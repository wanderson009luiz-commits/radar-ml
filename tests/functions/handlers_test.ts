import { assert, assertEquals, assertMatch } from "./assert.ts";
import { type Auth, iniciarAutorizacao, type ItemComBruto, lerPainel, receberRetorno, type Repo, rodarColeta } from "../../supabase/functions/_shared/handlers.ts";
import { desafioPkce, type BuscaRadar, type CategoriaRadar } from "../../supabase/functions/_shared/lib.ts";
import { criarClienteML } from "../../supabase/functions/_shared/ml.ts";

const REDIRECT = "https://proj.supabase.co/functions/v1/radar-auth-callback";
const CFG = { start_key: "chave-inicio-123", cron_key: "chave-cron-456", view_key: "chave-leitura-789" };

// ---------- Banco falso em memória ----------
function repoFalso(agora: () => Date) {
  const db = {
    estados: new Map<string, { verifier: string; criado: Date; usado: boolean }>(),
    auth: null as Auth | null,
    authGravacoes: 0,
    categorias: [
      { id: "MLB1747", nome: "Acessórios", grupo: "Carros" },
      { id: "MLB2527", nome: "Ferramentas manuais", grupo: "Ferramentas" },
    ] as CategoriaRadar[],
    execucoes: [] as { id: number; status: string; mensagem: string; falhas: unknown[]; relatorio: string | null; ocultos?: Record<string, number> }[],
    itens: [] as ItemComBruto[],
    buscas: [] as BuscaRadar[],
    eventos: [] as string[],
  };
  const repo: Repo = {
    config: async () => CFG,
    painel: async (dias: number) => ({ pedido_dias: dias, ultima: { itens: [] } }),
    salvarEstado: async (s, v) => void db.estados.set(s, { verifier: v, criado: agora(), usado: false }),
    consumirEstado: async (s) => {
      const e = db.estados.get(s);
      if (!e || e.usado || agora().getTime() - e.criado.getTime() > 15 * 60_000) return null;
      e.usado = true;
      return { code_verifier: e.verifier };
    },
    lerAuth: async () => db.auth,
    salvarAuth: async (a) => {
      db.auth = a;
      db.authGravacoes++;
      db.eventos.push("salvou-token");
    },
    comTravaAuth: async (fn) => await fn(db.auth, async (a) => {
      db.auth = a;
      db.authGravacoes++;
      db.eventos.push("salvou-token");
    }),
    categoriasAtivas: async () => db.categorias.map((c) => ({ ...c })),
    atualizarNomeCategoria: async (id, nome) => {
      const c = db.categorias.find((x) => x.id === id);
      if (c) c.nome = nome;
    },
    novaExecucao: async () => {
      const id = db.execucoes.length + 1;
      db.execucoes.push({ id, status: "rodando", mensagem: "", falhas: [], relatorio: null });
      return id;
    },
    salvarItens: async (_id, itens) => void db.itens.push(...itens),
    salvarBuscas: async (_id, b) => void db.buscas.push(...b),
    finalizar: async (id, status, mensagem, falhas, relatorio, ocultos) => {
      Object.assign(db.execucoes[id - 1], { status, mensagem, falhas, relatorio, ocultos });
    },
    limparAntigos: async () => {},
  };
  return { repo, db };
}

// ---------- Mercado Livre falso ----------
type Rota = (url: URL, init?: RequestInit) => Response | Promise<Response>;
function mlFalso(rotas: Record<string, Rota>) {
  const chamadas: { metodo: string; caminho: string; corpo?: string; auth?: string | null }[] = [];
  const f = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const corpo = init?.body ? String(init.body) : undefined;
    const headers = new Headers(init?.headers);
    chamadas.push({ metodo: init?.method ?? "GET", caminho: url.pathname + url.search, corpo, auth: headers.get("authorization") });
    for (const [padrao, rota] of Object.entries(rotas)) {
      if (new RegExp(padrao).test(url.pathname + url.search)) {
        if (headers.get("authorization") !== null && headers.get("authorization") !== "Bearer AT-NOVO" && headers.get("authorization") !== "Bearer AT-VALIDO") {
          return new Response('{"message":"invalid token"}', { status: 401 });
        }
        return await rota(url, init);
      }
    }
    return new Response('{"message":"not found"}', { status: 404 });
  }) as typeof fetch;
  return { cliente: criarClienteML({ fetch: f, clientId: "APP123", clientSecret: "SEGREDO", pausaMs: 1 }), chamadas };
}

const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

const tokenOk = () => j({ access_token: "AT-NOVO", refresh_token: "RT-NOVO", expires_in: 21600, user_id: 777, scope: "offline_access read" });

// ---------- 1) Início ----------
Deno.test("início: chave errada é recusada", async () => {
  const { repo } = repoFalso(() => new Date());
  const r = await iniciarAutorizacao(new Request("https://f/radar-auth-start?k=errada"), { repo, clientId: "APP123", redirectUri: REDIRECT });
  assertEquals(r.status, 403);
});

Deno.test("início: sem Client ID avisa o que falta", async () => {
  const { repo } = repoFalso(() => new Date());
  const r = await iniciarAutorizacao(new Request(`https://f/radar-auth-start?k=${CFG.start_key}`), { repo, clientId: undefined, redirectUri: REDIRECT });
  assertEquals(r.status, 500);
  assertMatch(await r.text(), /ML_CLIENT_ID/);
});

Deno.test("início: redireciona ao Mercado Livre com state salvo e PKCE correto", async () => {
  const { repo, db } = repoFalso(() => new Date());
  const r = await iniciarAutorizacao(new Request(`https://f/radar-auth-start?k=${CFG.start_key}`), { repo, clientId: "APP123", redirectUri: REDIRECT });
  assertEquals(r.status, 302);
  const destino = new URL(r.headers.get("location")!);
  assertEquals(destino.host, "auth.mercadolivre.com.br");
  const state = destino.searchParams.get("state")!;
  assert(db.estados.has(state));
  assertEquals(destino.searchParams.get("code_challenge"), await desafioPkce(db.estados.get(state)!.verifier));
  assertEquals(destino.searchParams.get("redirect_uri"), REDIRECT);
});

// ---------- 2) Retorno ----------
async function prepararEstado(repo: Repo) {
  await repo.salvarEstado("ST1", "VERIFIER1");
}

Deno.test("retorno: troca o código, manda PKCE e salva o token", async () => {
  let agora = new Date("2026-10-25T15:00:00Z");
  const { repo, db } = repoFalso(() => agora);
  await prepararEstado(repo);
  const ml = mlFalso({ "^/oauth/token$": tokenOk });
  const r = await receberRetorno(new Request("https://f/cb?code=CODE1&state=ST1"), { repo, ml: ml.cliente, redirectUri: REDIRECT, agora: () => agora });
  assertEquals(r.status, 200);
  assertMatch(await r.text(), /Pronto!/);
  const corpo = new URLSearchParams(ml.chamadas[0].corpo);
  assertEquals(corpo.get("grant_type"), "authorization_code");
  assertEquals(corpo.get("code"), "CODE1");
  assertEquals(corpo.get("code_verifier"), "VERIFIER1");
  assertEquals(corpo.get("redirect_uri"), REDIRECT);
  assertEquals(corpo.get("client_secret"), "SEGREDO");
  assertEquals(db.auth?.refresh_token, "RT-NOVO");
  assertEquals(db.auth?.expires_at.toISOString(), "2026-10-25T21:00:00.000Z");
  // reutilizar o mesmo link não funciona
  agora = new Date("2026-10-25T15:01:00Z");
  const r2 = await receberRetorno(new Request("https://f/cb?code=CODE1&state=ST1"), { repo, ml: ml.cliente, redirectUri: REDIRECT, agora: () => agora });
  assertEquals(r2.status, 400);
});

Deno.test("retorno: state desconhecido, vencido ou erro do ML são recusados", async () => {
  let agora = new Date("2026-10-25T15:00:00Z");
  const { repo, db } = repoFalso(() => agora);
  const ml = mlFalso({ "^/oauth/token$": tokenOk });
  const d = { repo, ml: ml.cliente, redirectUri: REDIRECT, agora: () => agora };
  assertEquals((await receberRetorno(new Request("https://f/cb?code=C&state=NAOEXISTE"), d)).status, 400);
  await prepararEstado(repo);
  agora = new Date("2026-10-25T15:16:00Z");
  assertEquals((await receberRetorno(new Request("https://f/cb?code=C&state=ST1"), d)).status, 400);
  assertEquals((await receberRetorno(new Request("https://f/cb?error=access_denied"), d)).status, 400);
  assertEquals(ml.chamadas.length, 0);
  assertEquals(db.auth, null);
});

Deno.test("retorno: conta diferente da já autorizada não sobrescreve", async () => {
  const agora = new Date("2026-10-25T15:00:00Z");
  const { repo, db } = repoFalso(() => agora);
  db.auth = { ml_user_id: 111, access_token: "AT-VALIDO", refresh_token: "RT-ANTIGO", expires_at: agora, scope: null };
  await prepararEstado(repo);
  const ml = mlFalso({ "^/oauth/token$": tokenOk });
  const r = await receberRetorno(new Request("https://f/cb?code=C&state=ST1"), { repo, ml: ml.cliente, redirectUri: REDIRECT, agora: () => agora });
  assertEquals(r.status, 403);
  assertEquals(db.auth?.refresh_token, "RT-ANTIGO");
});

Deno.test("retorno: ML recusa a troca → mensagem clara", async () => {
  const agora = new Date();
  const { repo, db } = repoFalso(() => agora);
  await prepararEstado(repo);
  const ml = mlFalso({ "^/oauth/token$": () => j({ error: "invalid_client" }, 400) });
  const r = await receberRetorno(new Request("https://f/cb?code=C&state=ST1"), { repo, ml: ml.cliente, redirectUri: REDIRECT, agora: () => agora });
  assertEquals(r.status, 502);
  assertMatch(await r.text(), /Client ID/);
  assertEquals(db.auth, null);
});

// ---------- 3) Coleta ----------
const post = (chave: string) => new Request("https://f/radar-coleta", { method: "POST", headers: { "x-radar-key": chave } });

function rotasColeta(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    "^/oauth/token$": tokenOk,
    "^/categories/MLB1747$": () => j({ id: "MLB1747", name: "Acessórios para Veículos" }),
    "^/categories/MLB2527$": () => j({ id: "MLB2527", name: "Ferramentas Manuais" }),
    "^/highlights/MLB/category/MLB1747$": () => j({ content: [
      { id: "MLB-P0", position: 1, type: "PRODUCT" },
      { id: "MLBU111", position: 2, type: "USER_PRODUCT" },
      { id: "MLB222", position: 3, type: "ITEM" },
      { id: "MLB-P1", position: 4, type: "PRODUCT" },
      { id: "MLB-P2", position: 5, type: "PRODUCT" },
      { id: "MLB-P3", position: 6, type: "PRODUCT" },
    ] }),
    "^/highlights/MLB/category/MLB2527$": () => j({ content: [
      { id: "MLB-P0", position: 2, type: "PRODUCT" },
      { id: "MLB-P4", position: 1, type: "PRODUCT" },
    ] }),
    "^/products/MLB-P0$": () => j({ id: "MLB-P0", name: "Quebra-sol Para-brisa Guarda-chuva", buy_box_winner: { price: 59.9 }, permalink: "https://ml/p0" }),
    "^/products/MLB-P1$": () => j({ id: "MLB-P1", name: "Lâmpada LED H4 6000K", buy_box_winner: { price: 69.9, item_id: "MLB9" }, permalink: "https://ml/p1" }),
    "^/products/MLB-P2$": () => j({ id: "MLB-P2", name: "Compressor de Ar 12V" }),
    "^/products/MLB-P2/items": () => j({ results: [{ item_id: "MLB8", price: 75 }] }),
    "^/products/MLB-P3$": () => j({ message: "not found" }, 404),
    "^/products/MLB-P4$": () => j({ id: "MLB-P4", name: "Estilete Largo 18mm", buy_box_winner: { price: 9.9 } }),
    "^/trends/MLB/MLB1747$": () => j([{ keyword: "compressor de ar", url: "https://ml/t1" }, { keyword: "lojas online" }, { keyword: "lampada h4", url: "https://ml/t2" }]),
    "^/trends/MLB/MLB2527$": () => j([{ keyword: "alicate", url: "https://ml/t3" }]),
    ...extra,
  };
}

Deno.test("coleta: chave errada é recusada sem criar execução", async () => {
  const { repo, db } = repoFalso(() => new Date());
  const ml = mlFalso(rotasColeta());
  const r = await rodarColeta(post("errada"), { repo, ml: ml.cliente, agora: () => new Date() });
  assertEquals(r.status, 401);
  assertEquals(db.execucoes.length, 0);
});

Deno.test("coleta: sem autorização registra erro claro", async () => {
  const { repo, db } = repoFalso(() => new Date());
  const ml = mlFalso(rotasColeta());
  const r = await rodarColeta(post(CFG.cron_key), { repo, ml: ml.cliente, agora: () => new Date() });
  assertEquals(r.status, 500);
  assertEquals(db.execucoes[0].status, "erro");
  assertMatch(db.execucoes[0].mensagem, /não autorizado/);
});

Deno.test("coleta completa: renova o token antes, classifica, salva e monta o relatório", async () => {
  const agora = new Date("2026-10-26T15:20:00Z");
  const { repo, db } = repoFalso(() => agora);
  db.auth = { ml_user_id: 777, access_token: "AT-VELHO", refresh_token: "RT-VELHO", expires_at: new Date("2026-10-26T15:25:00Z"), scope: null };
  const ml = mlFalso(rotasColeta());
  const r = await rodarColeta(post(CFG.cron_key), { repo, ml: ml.cliente, agora: () => agora });
  const corpo = await r.json();

  // renovou primeiro, com o refresh token antigo, e salvou o novo antes de coletar
  assertEquals(ml.chamadas[0].caminho, "/oauth/token");
  assertEquals(new URLSearchParams(ml.chamadas[0].corpo).get("refresh_token"), "RT-VELHO");
  assertEquals(db.auth?.refresh_token, "RT-NOVO");
  assert(ml.chamadas.slice(1).every((c) => c.auth === "Bearer AT-NOVO"));

  // anúncios de outros vendedores não são consultados (a API recusa) — só contados
  assert(!ml.chamadas.some((c) => c.caminho.startsWith("/items")));
  // produto repetido em duas categorias é consultado uma vez só
  assertEquals(ml.chamadas.filter((c) => c.caminho === "/products/MLB-P0").length, 1);

  // P3 falhou → parcial, com o resto salvo
  assertEquals(corpo.status, "parcial");
  assertEquals(db.execucoes[0].status, "parcial");
  const de = (cat: string, id: string) => db.itens.find((i) => i.categoria_id === cat && i.ml_id === id)!;
  assertEquals(de("MLB1747", "MLB-P0").selo, "OK");
  assertEquals(de("MLB1747", "MLB-P0").compra_max, 23.56);
  assertEquals(de("MLB2527", "MLB-P0").posicao, 2);
  assertEquals(de("MLB1747", "MLB-P1").selo, "CONFERIR");
  assertEquals(de("MLB1747", "MLB-P2").preco, 75); // veio do fallback /products/{id}/items
  assertEquals(de("MLB2527", "MLB-P4").selo, "FORA_FAIXA");
  assertEquals(db.itens.length, 5);
  assertEquals(db.buscas.map((b) => b.termo), ["compressor de ar", "lampada h4", "alicate"]); // "lojas online" filtrado
  assertEquals(db.categorias[1].nome, "Ferramentas Manuais");

  const rel = db.execucoes[0].relatorio!;
  assertMatch(rel, /Radar ML – 26\/10/);
  assertMatch(rel, /APOSTAS DO DIA\n.*Quebra-sol/);
  assertEquals((rel.split("APOSTAS DO DIA")[1].split("\n\n")[0].match(/Quebra-sol/g) ?? []).length, 1); // sem repetir
  assertMatch(rel, /Buscas em alta: compressor de ar, lampada h4/);
  assertMatch(rel, /\+ 2 dos mais vendidos são anúncios próprios de vendedores/);
  assertMatch(rel, /Estilete Largo 18mm – R\$ 9,90 – FORA_FAIXA .* – não dá R\$ 20 de lucro/);
  assertMatch(rel, /MLB1747 – detalhes de 1 produto\(s\) de catálogo/);
  assertEquals(db.execucoes[0].ocultos, { MLB1747: 2, MLB2527: 0 });
});

Deno.test("coleta: token ainda válido não é renovado; sem falhas = ok", async () => {
  const agora = new Date("2026-10-26T15:20:00Z");
  const { repo, db } = repoFalso(() => agora);
  db.auth = { ml_user_id: 777, access_token: "AT-VALIDO", refresh_token: "RT-X", expires_at: new Date("2026-10-26T20:00:00Z"), scope: null };
  const ml = mlFalso(rotasColeta({ "^/products/MLB-P3$": () => j({ id: "MLB-P3", name: "Alicate Desencapador", buy_box_winner: { price: 55 } }) }));
  const r = await rodarColeta(post(CFG.cron_key), { repo, ml: ml.cliente, agora: () => agora });
  assertEquals((await r.json()).status, "ok");
  assert(!ml.chamadas.some((c) => c.caminho === "/oauth/token"));
  assertEquals(db.authGravacoes, 0);
  assertEquals(db.itens.find((i) => i.ml_id === "MLB-P3")?.link, "https://www.mercadolivre.com.br/p/MLB-P3");
  assertEquals(db.execucoes[0].falhas.length, 0);
});

Deno.test("coleta: autorização revogada → pede para autorizar de novo", async () => {
  const agora = new Date("2026-10-26T15:20:00Z");
  const { repo, db } = repoFalso(() => agora);
  db.auth = { ml_user_id: 777, access_token: "AT-VELHO", refresh_token: "RT-VELHO", expires_at: new Date("2026-10-26T15:00:00Z"), scope: null };
  const ml = mlFalso(rotasColeta({ "^/oauth/token$": () => j({ error: "invalid_grant", message: "invalid_grant" }, 400) }));
  const r = await rodarColeta(post(CFG.cron_key), { repo, ml: ml.cliente, agora: () => agora });
  assertEquals(r.status, 500);
  assertMatch(db.execucoes[0].mensagem, /link de autorização de novo/);
  assertEquals(db.auth?.refresh_token, "RT-VELHO");
});

Deno.test("coleta: API fora do ar em tudo → erro, sem quebrar", async () => {
  const agora = new Date("2026-10-26T15:20:00Z");
  const { repo, db } = repoFalso(() => agora);
  db.auth = { ml_user_id: 777, access_token: "AT-VALIDO", refresh_token: "RT-X", expires_at: new Date("2026-10-26T20:00:00Z"), scope: null };
  const fora = () => j({ message: "unavailable" }, 503);
  const ml = mlFalso({ "^/highlights": fora, "^/trends": fora, "^/categories": fora });
  const r = await rodarColeta(post(CFG.cron_key), { repo, ml: ml.cliente, agora: () => agora });
  assertEquals((await r.json()).status, "erro");
  assertEquals(db.execucoes[0].status, "erro");
  assertMatch(db.execucoes[0].relatorio!, /FALHAS\n  MLB1747 – mais vendidos/);
});

Deno.test("cliente ML: tenta de novo após 429 e depois funciona", async () => {
  let n = 0;
  const ml = mlFalso({ "^/trends/MLB/MLB1": () => (++n === 1 ? j({}, 429) : j([{ keyword: "x" }])) });
  const t = await ml.cliente.tendencias("MLB1", "AT-VALIDO");
  assertEquals(t.length, 1);
  assertEquals(n, 2);
});

// ---------- 4) Leitura para a página ----------
const SITE = "https://wanderson009luiz-commits.github.io";
const get = (url: string, h: Record<string, string> = {}, method = "GET") => new Request(url, { method, headers: h });

Deno.test("dados: sem chave ou chave errada → 401, com CORS do site", async () => {
  const { repo } = repoFalso(() => new Date());
  const r1 = await lerPainel(get("https://f/radar/dados", { origin: SITE }), { repo });
  assertEquals(r1.status, 401);
  assertEquals(r1.headers.get("access-control-allow-origin"), SITE);
  const r2 = await lerPainel(get("https://f/radar/dados", { origin: SITE, "x-radar-view": "errada" }), { repo });
  assertEquals(r2.status, 401);
  // a chave do agendamento não serve para ler
  const r3 = await lerPainel(get("https://f/radar/dados", { "x-radar-view": CFG.cron_key }), { repo });
  assertEquals(r3.status, 401);
});

Deno.test("dados: chave certa devolve o painel; dias fora do limite viram 14", async () => {
  const { repo } = repoFalso(() => new Date());
  const ok = await lerPainel(get("https://f/radar/dados?dias=30", { origin: SITE, "x-radar-view": CFG.view_key }), { repo });
  assertEquals(ok.status, 200);
  assertEquals((await ok.json()).pedido_dias, 30);
  assertEquals(ok.headers.get("cache-control"), "no-store");
  const ruim = await lerPainel(get("https://f/radar/dados?dias=999", { "x-radar-view": CFG.view_key }), { repo });
  assertEquals((await ruim.json()).pedido_dias, 14);
  const txt = await lerPainel(get("https://f/radar/dados?dias=abc", { "x-radar-view": CFG.view_key }), { repo });
  assertEquals((await txt.json()).pedido_dias, 14);
});

Deno.test("dados: outro site não recebe permissão de CORS; preflight responde 204", async () => {
  const { repo } = repoFalso(() => new Date());
  const r = await lerPainel(get("https://f/radar/dados", { origin: "https://site-estranho.com", "x-radar-view": CFG.view_key }), { repo });
  assertEquals(r.headers.get("access-control-allow-origin"), null);
  const pre = await lerPainel(get("https://f/radar/dados", { origin: SITE }, "OPTIONS"), { repo });
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get("access-control-allow-headers"), "x-radar-view");
  const post = await lerPainel(get("https://f/radar/dados", { "x-radar-view": CFG.view_key }, "POST"), { repo });
  assertEquals(post.status, 405);
});
