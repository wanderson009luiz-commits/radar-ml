import { assert, assertEquals, assertMatch } from "./assert.ts";
import {
  apostasDoDia,
  buscaUtil,
  classificar,
  compraMax,
  desafioPkce,
  envioAprox,
  iguais,
  type ItemRadar,
  linkAutorizacao,
  precisaRenovar,
  renderRelatorio,
} from "../../supabase/functions/_shared/lib.ts";

Deno.test("envio aproximado respeita as faixas e os limites", () => {
  assertEquals(envioAprox(18), 9);
  assertEquals(envioAprox(19), 6.85);
  assertEquals(envioAprox(48.99), 6.85);
  assertEquals(envioAprox(49), 8.15);
  assertEquals(envioAprox(78.99), 8.15);
  assertEquals(envioAprox(79), 12.95);
  assertEquals(envioAprox(99.99), 12.95);
  assertEquals(envioAprox(100), null);
  assertEquals(envioAprox(0), null);
  assertEquals(envioAprox(NaN), null);
});

Deno.test("compra máxima bate com a conta conferida (R$ 59,90 → R$ 23,56)", () => {
  assertEquals(compraMax(59.9), 23.56);
  assertEquals(compraMax(null), null);
  assertEquals(compraMax(150), null);
});

Deno.test("compra máxima: lucro de R$ 20 confere em milhares de preços aleatórios", () => {
  for (let i = 0; i < 5000; i++) {
    const preco = Math.round((19 + Math.random() * 80.99) * 100) / 100;
    const cm = compraMax(preco)!;
    const lucro = preco * 0.88 - envioAprox(preco)! - 1 - cm;
    assert(Math.abs(lucro - 20) <= 0.006, `preço ${preco}: lucro ${lucro}`);
  }
});

Deno.test("classificação dos produtos", () => {
  const c = (n: string, p: number | null) => classificar(n, p).selo;
  assertEquals(c("Quebra-sol Para-brisa Tipo Guarda-chuva", 59.9), "OK");
  assertEquals(c("Kit Ferramentas 46 Peças Catraca", 32.9), "FORA_FAIXA");
  assertEquals(c("Carregador Turbo USB-C 25W", 59), "EVITAR");
  assertEquals(c("Fone de Ouvido Bluetooth Pro 4", 59), "EVITAR");
  assertEquals(c("Kit Maçarico com 4 refis", 57), "EVITAR");
  assertEquals(c("Pistola Fixação Finca Pino Ação Direta Pregos Epi Maleta", 59.99), "EVITAR");
  assertEquals(c("Pistola Fincapino Kit Premium", 54.96), "EVITAR");
  assertEquals(c("Pistola De Pintura Gravidade 600ml 3 Bicos", 64.9), "OK");
  assertEquals(c("Tapete Personalizado VW Gol com Logo", 59), "EVITAR");
  assertEquals(c("Tapete de Borracha Gol G4 5 peças", 59), "OK");
  assertEquals(c("Lâmpada LED H4 6000K", 59.9), "CONFERIR");
  assertEquals(c("Compressor de Ar Portátil 12V", 69.9), "CONFERIR");
  assertEquals(c("Câmera de Ré 8 LEDs", 59.9), "CONFERIR");
  assertEquals(c("Câmera de Ré Wi-Fi", 59.9), "EVITAR");
  assertEquals(c("Carregador de Bateria Automotiva 12V", 69.9), "CONFERIR");
  assertEquals(c("Bateria Automotiva 60Ah", 69.9), "EVITAR");
  assertEquals(c("Jogo de Potes de Vidro", 59.9), "EVITAR");
  assertEquals(c("Descascador de Fio Automático", 49), "OK");
  assertEquals(c("Parafusadeira Furadeira The Black Tools TB12A a Bateria", 74.9), "CONFERIR");
  assertEquals(c("Soprador de Ar Portátil Recarregável", 59.9), "CONFERIR");
  assertEquals(c("Arco de Serra Manual 12 Pol", 59.9), "OK");
  assertEquals(c("Serra Elétrica Tico-tico 500W", 59.9), "CONFERIR");
  assertEquals(c("Capa Para Carro Forrada Impermeável", 61.1), "OK");
  assertEquals(c("Carregador Inteligente De Bateria Automotiva 12v 6a Bivolt", 59.9), "CONFERIR");
  assertEquals(c("Bomba De Encher Pneu De Carro Bike Moto Portátil Digital", 65.95), "CONFERIR");
  assertEquals(c("Kit Macarrão Reparo Pneu Sem Câmara", 59.9), "OK");
  assertEquals(c("Pneu Aro 14 175/70", 59.9), "EVITAR");
  assertEquals(c("Película Para Vidros Automotivos", 59.9), "OK");
  assertEquals(c("Kit 10 Potes De Vidro Hermético", 59.9), "EVITAR");
  assertEquals(c("Jogo De Chave Boca E Estrela Combinada 12 Pçs", 58), "OK");
  assertEquals(c("Descascador de Fio Automático", null), "SEM_PRECO");
  assertEquals(c("Fone Bluetooth", null), "EVITAR");
  const fora = classificar("Lâmpada LED H7", 120);
  assertEquals(fora.selo, "FORA_FAIXA");
  assertMatch(fora.motivo, /Inmetro/);
});

Deno.test("PKCE S256 segue o exemplo oficial da RFC 7636", async () => {
  assertEquals(await desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

Deno.test("comparação de chaves e renovação do token", () => {
  assert(iguais("abc", "abc"));
  assert(!iguais("abc", "abd"));
  assert(!iguais("abc", "ab"));
  assert(!iguais("", "a"));
  const agora = new Date("2026-10-25T12:00:00Z");
  assert(precisaRenovar(new Date("2026-10-25T12:05:00Z"), agora));
  assert(!precisaRenovar(new Date("2026-10-25T13:00:00Z"), agora));
});

Deno.test("link de autorização leva todos os parâmetros", () => {
  const u = new URL(linkAutorizacao({ clientId: "123", redirectUri: "https://x.supabase.co/functions/v1/radar-auth-callback", state: "s", challenge: "c" }));
  assertEquals(u.host, "auth.mercadolivre.com.br");
  assertEquals(u.searchParams.get("response_type"), "code");
  assertEquals(u.searchParams.get("client_id"), "123");
  assertEquals(u.searchParams.get("redirect_uri"), "https://x.supabase.co/functions/v1/radar-auth-callback");
  assertEquals(u.searchParams.get("code_challenge_method"), "S256");
});

const item = (p: Partial<ItemRadar>): ItemRadar => ({
  categoria_id: "MLB1747", posicao: 1, tipo: "ITEM", ml_id: "MLB1", nome: "Produto", preco: 59.9, link: "https://x", selo: "OK",
  motivo: "m", compra_max: 23.56, ...p,
});

Deno.test("apostas do dia: OK antes de CONFERIR, depois pela posição", () => {
  const a = apostasDoDia([
    item({ ml_id: "a", selo: "CONFERIR", posicao: 1 }),
    item({ ml_id: "b", selo: "OK", posicao: 5 }),
    item({ ml_id: "c", selo: "EVITAR", posicao: 1 }),
    item({ ml_id: "d", selo: "OK", posicao: 2 }),
  ]);
  assertEquals(a.map((x) => x.ml_id), ["d", "b", "a"]);
});

Deno.test("relatório tem data, categorias, buscas, falhas e formato brasileiro", () => {
  const r = renderRelatorio({
    quando: new Date("2026-10-26T15:20:00Z"),
    categorias: [{ id: "MLB1747", nome: "Acessórios para Veículos", grupo: "Carros" }, { id: "MLB2527", nome: "Ferramentas manuais", grupo: "Ferramentas" }],
    itens: [item({ nome: "Quebra-sol", preco: 59.9 })],
    buscas: [{ categoria_id: "MLB1747", posicao: 1, termo: "compressor de ar", link: null }],
    falhas: [{ categoria: "MLB2527", etapa: "mais vendidos", erro: "GET → 404" }],
  });
  assertMatch(r, /^Radar ML – 26\/10/);
  assertMatch(r, /R\$ 59,90/);
  assertMatch(r, /compra máx\. R\$ 23,56/);
  assertMatch(r, /Buscas em alta: compressor de ar/);
  assertMatch(r, /MLB2527 – mais vendidos: GET → 404/);
  assertMatch(r, /sem itens \(ver falhas\)/);
  assertMatch(r, /Coletado às 12:20 \(Recife\)/);
});

Deno.test("buscas genéricas são descartadas", () => {
  assert(!buscaUtil("lojas online"));
  assert(!buscaUtil("Promoção Relâmpago"));
  assert(buscaUtil("descascador fio"));
});

Deno.test("relatório: compra máxima negativa vira aviso", () => {
  const r = renderRelatorio({
    quando: new Date("2026-10-26T15:20:00Z"),
    categorias: [{ id: "MLB1", nome: "X", grupo: "G" }],
    itens: [item({ categoria_id: "MLB1", nome: "Estilete", preco: 9.9, selo: "FORA_FAIXA", compra_max: -17.24 })],
    buscas: [], falhas: [], ocultos: { MLB1: 3 },
  });
  assertMatch(r, /não dá R\$ 20 de lucro/);
  assert(!/-17/.test(r));
  assertMatch(r, /\+ 3 dos mais vendidos/);
});
