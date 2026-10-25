// Lógica das três funções do radar, com banco e API injetáveis (para testar sem rede).
import {
  aleatorio,
  type BuscaRadar,
  buscaUtil,
  type CategoriaRadar,
  classificar,
  compraMax,
  desafioPkce,
  iguais,
  type ItemRadar,
  linkAutorizacao,
  precisaRenovar,
  renderRelatorio,
} from "./lib.ts";
import { type ClienteML, ErroML } from "./ml.ts";

export type Auth = {
  ml_user_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  scope: string | null;
};

export type ItemComBruto = ItemRadar & { bruto: unknown };

export type Falha = { categoria: string; etapa: string; erro: string };

export interface Repo {
  config(): Promise<{ start_key: string; cron_key: string; view_key: string }>;
  painel(dias: number): Promise<unknown>;
  salvarEstado(state: string, verifier: string): Promise<void>;
  consumirEstado(state: string): Promise<{ code_verifier: string } | null>;
  lerAuth(): Promise<Auth | null>;
  salvarAuth(a: Auth): Promise<void>;
  comTravaAuth<T>(fn: (auth: Auth | null, salvar: (a: Auth) => Promise<void>) => Promise<T>): Promise<T>;
  categoriasAtivas(): Promise<CategoriaRadar[]>;
  atualizarNomeCategoria(id: string, nome: string): Promise<void>;
  novaExecucao(): Promise<number>;
  salvarItens(execucaoId: number, itens: ItemComBruto[]): Promise<void>;
  salvarBuscas(execucaoId: number, buscas: BuscaRadar[]): Promise<void>;
  finalizar(execucaoId: number, status: "ok" | "parcial" | "erro", mensagem: string, falhas: Falha[], relatorio: string | null, ocultos?: Record<string, number>): Promise<void>;
  limparAntigos(): Promise<void>;
}

const texto = (corpo: string, status = 200) =>
  new Response(corpo, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

// ---------- 1) Início da autorização ----------
export async function iniciarAutorizacao(req: Request, d: { repo: Repo; clientId?: string; redirectUri: string }): Promise<Response> {
  if (req.method !== "GET") return texto("Use o link no navegador.", 405);
  const k = new URL(req.url).searchParams.get("k") ?? "";
  const cfg = await d.repo.config();
  if (!iguais(k, cfg.start_key)) return texto("Link inválido. Peça o link certo ao Claude.", 403);
  if (!d.clientId) return texto("Falta cadastrar o segredo ML_CLIENT_ID no Supabase.", 500);
  const state = aleatorio(32);
  const verifier = aleatorio(48);
  await d.repo.salvarEstado(state, verifier);
  const destino = linkAutorizacao({ clientId: d.clientId, redirectUri: d.redirectUri, state, challenge: await desafioPkce(verifier) });
  return new Response(null, { status: 302, headers: { location: destino, "cache-control": "no-store" } });
}

// ---------- 2) Retorno do Mercado Livre ----------
export async function receberRetorno(req: Request, d: { repo: Repo; ml: ClienteML | null; redirectUri: string; agora: () => Date }): Promise<Response> {
  const u = new URL(req.url);
  const erro = u.searchParams.get("error");
  if (erro) return texto(`O Mercado Livre não autorizou (${erro}). Tente de novo pelo link.`, 400);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  if (!code || !state) return texto("Faltou o código de autorização. Abra o link de autorização de novo.", 400);
  if (!d.ml) return texto("Faltam os segredos ML_CLIENT_ID e ML_CLIENT_SECRET no Supabase.", 500);

  const estado = await d.repo.consumirEstado(state);
  if (!estado) return texto("Este link já foi usado ou expirou (15 minutos). Abra o link de autorização de novo.", 400);

  let t;
  try {
    t = await d.ml.trocarCodigo(code, d.redirectUri, estado.code_verifier);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return texto(`O Mercado Livre recusou a troca do código. Confira o Client ID, a chave secreta e a URL de retorno no app do DevCenter.\nDetalhe: ${msg}`, 502);
  }

  const atual = await d.repo.lerAuth();
  if (atual && Number(atual.ml_user_id) !== Number(t.user_id)) {
    return texto("Esta conta do Mercado Livre é diferente da que já estava autorizada. Nada foi alterado.", 403);
  }
  await d.repo.salvarAuth({
    ml_user_id: Number(t.user_id),
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: new Date(d.agora().getTime() + Number(t.expires_in) * 1000),
    scope: t.scope ?? null,
  });
  return texto("Pronto! O Radar ML foi autorizado na sua conta do Mercado Livre.\nPode fechar esta aba e avisar o Claude.");
}

// ---------- 3) Coleta diária ----------
async function tokenValido(d: { repo: Repo; ml: ClienteML; agora: () => Date }): Promise<string> {
  return await d.repo.comTravaAuth(async (auth, salvar) => {
    if (!auth) throw new Error("Radar ainda não autorizado: abra o link de autorização.");
    if (!precisaRenovar(auth.expires_at, d.agora())) return auth.access_token;
    let t;
    try {
      t = await d.ml.renovar(auth.refresh_token);
    } catch (e) {
      if (e instanceof ErroML && /invalid_grant/.test(e.corpo)) {
        throw new Error("A autorização do Mercado Livre venceu ou foi revogada: abra o link de autorização de novo.");
      }
      throw e;
    }
    await salvar({
      ml_user_id: Number(t.user_id ?? auth.ml_user_id),
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(d.agora().getTime() + Number(t.expires_in) * 1000),
      scope: t.scope ?? auth.scope,
    });
    return t.access_token;
  });
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function emLotes<T, R>(lista: T[], tamanho: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const res: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    res.push(...(await Promise.allSettled(lista.slice(i, i + tamanho).map(fn))));
  }
  return res;
}

export type ProdutoCache = Map<string, Promise<{ nome: string | null; preco: number | null; link: string | null; bruto: unknown }>>;

// A API só mostra detalhes de produtos de catálogo (PRODUCT). Anúncios próprios de outros
// vendedores (ITEM / USER_PRODUCT) voltam 403, então são só contados como "ocultos".
export async function coletarCategoria(
  cat: CategoriaRadar,
  at: string,
  ml: ClienteML,
  cache: ProdutoCache = new Map(),
): Promise<{ itens: ItemComBruto[]; buscas: BuscaRadar[]; falhas: Falha[]; nome: string | null; ocultos: number }> {
  const falhas: Falha[] = [];
  const itens: ItemComBruto[] = [];
  let nome: string | null = null;

  try {
    nome = str((await ml.categoria(cat.id, at)).name);
  } catch { /* nome é opcional */ }

  let ranking: { id: string; position: number; type: string }[] = [];
  try {
    ranking = await ml.maisVendidos(cat.id, at);
  } catch (e) {
    falhas.push({ categoria: cat.id, etapa: "mais vendidos", erro: e instanceof Error ? e.message : String(e) });
  }

  const prodRank = ranking.filter((r) => r.type === "PRODUCT");
  const ocultos = ranking.length - prodRank.length;

  const detalhes = (id: string) => {
    let p = cache.get(id);
    if (!p) {
      p = (async () => {
        const prod = await ml.produto(id, at);
        const bbw = (prod.buy_box_winner ?? null) as Record<string, unknown> | null;
        let preco = num(bbw?.price);
        if (preco == null) {
          try {
            preco = num((await ml.itensDoProduto(id, at))[0]?.price);
          } catch { /* sem preço */ }
        }
        return {
          nome: str(prod.name),
          preco,
          link: str(prod.permalink) ?? `https://www.mercadolivre.com.br/p/${id}`,
          bruto: { fonte: "produto", bbw: bbw ? Object.keys(bbw) : null },
        };
      })();
      cache.set(id, p);
    }
    return p;
  };

  const resultados = await emLotes(prodRank, 6, async (r) => {
    const d = await detalhes(r.id);
    const nomeItem = d.nome ?? r.id;
    const c = classificar(nomeItem, d.preco);
    return {
      categoria_id: cat.id, posicao: r.position ?? null, tipo: r.type, ml_id: r.id, nome: nomeItem, preco: d.preco,
      link: d.link, selo: c.selo, motivo: c.motivo, compra_max: c.selo === "EVITAR" ? null : compraMax(d.preco), bruto: d.bruto,
    } as ItemComBruto;
  });
  const erros = resultados.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
  for (const x of resultados) if (x.status === "fulfilled") itens.push(x.value);
  if (erros.length) {
    falhas.push({
      categoria: cat.id,
      etapa: `detalhes de ${erros.length} produto(s) de catálogo`,
      erro: erros[0].reason instanceof Error ? erros[0].reason.message : String(erros[0].reason),
    });
  }

  let buscas: BuscaRadar[] = [];
  try {
    buscas = (await ml.tendencias(cat.id, at)).filter((t) => t.keyword && buscaUtil(t.keyword)).slice(0, 10).map((t, i) => ({
      categoria_id: cat.id, posicao: i + 1, termo: t.keyword, link: str(t.url),
    }));
  } catch (e) {
    falhas.push({ categoria: cat.id, etapa: "buscas em alta", erro: e instanceof Error ? e.message : String(e) });
  }

  return { itens, buscas, falhas, nome, ocultos };
}

export async function rodarColeta(req: Request, d: { repo: Repo; ml: ClienteML | null; agora: () => Date }): Promise<Response> {
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  const cfg = await d.repo.config();
  if (!iguais(req.headers.get("x-radar-key") ?? "", cfg.cron_key)) return json({ erro: "não autorizado" }, 401);

  const execId = await d.repo.novaExecucao();
  if (!d.ml) {
    await d.repo.finalizar(execId, "erro", "Faltam os segredos ML_CLIENT_ID e ML_CLIENT_SECRET.", [], null);
    return json({ status: "erro", execucao: execId }, 500);
  }
  try {
    const at = await tokenValido({ repo: d.repo, ml: d.ml, agora: d.agora });
    const categorias = await d.repo.categoriasAtivas();
    const itens: ItemComBruto[] = [];
    const buscas: BuscaRadar[] = [];
    const falhas: Falha[] = [];
    const ocultos: Record<string, number> = {};
    const cache: ProdutoCache = new Map();
    for (const c of categorias) {
      const r = await coletarCategoria(c, at, d.ml, cache);
      ocultos[c.id] = r.ocultos;
      if (r.nome && r.nome !== c.nome) {
        c.nome = r.nome;
        await d.repo.atualizarNomeCategoria(c.id, r.nome);
      }
      itens.push(...r.itens);
      buscas.push(...r.buscas);
      falhas.push(...r.falhas);
    }
    await d.repo.salvarItens(execId, itens);
    await d.repo.salvarBuscas(execId, buscas);
    const relatorio = renderRelatorio({ quando: d.agora(), categorias, itens, buscas, falhas, ocultos });
    const status = falhas.length === 0 ? "ok" : itens.length > 0 ? "parcial" : "erro";
    await d.repo.finalizar(execId, status, `${itens.length} itens, ${buscas.length} buscas, ${falhas.length} falha(s)`, falhas, relatorio, ocultos);
    await d.repo.limparAntigos();
    return json({ status, execucao: execId, itens: itens.length, buscas: buscas.length, falhas: falhas.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await d.repo.finalizar(execId, "erro", msg, [], null);
    return json({ status: "erro", execucao: execId, erro: msg }, 500);
  }
}

// ---------- 4) Leitura para a página do Radar ----------
export const ORIGENS_PERMITIDAS = ["https://wanderson009luiz-commits.github.io"];

function cors(origem: string | null): Record<string, string> {
  const h: Record<string, string> = { vary: "Origin" };
  if (origem && ORIGENS_PERMITIDAS.includes(origem)) {
    h["access-control-allow-origin"] = origem;
    h["access-control-allow-methods"] = "GET, OPTIONS";
    h["access-control-allow-headers"] = "x-radar-view";
    h["access-control-max-age"] = "86400";
  }
  return h;
}

export async function lerPainel(req: Request, d: { repo: Repo }): Promise<Response> {
  const origem = req.headers.get("origin");
  const h = cors(origem);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...h, "content-type": "application/json", "cache-control": "no-store" } });
  if (req.method !== "GET") return responder({ erro: "use GET" }, 405);
  const cfg = await d.repo.config();
  if (!iguais(req.headers.get("x-radar-view") ?? "", cfg.view_key)) return responder({ erro: "chave inválida" }, 401);
  const n = Number(new URL(req.url).searchParams.get("dias") ?? 14);
  const dias = Number.isInteger(n) && n >= 1 && n <= 60 ? n : 14;
  return responder(await d.repo.painel(dias));
}
