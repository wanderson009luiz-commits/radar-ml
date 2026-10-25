// Regras puras do Radar ML (sem rede, sem banco): classificação, contas e relatório.

export const FAIXA_IDEAL = { min: 49, max: 78.99 };
export const FAIXA_ACEITA = { min: 30, max: 150 };
export const COMISSAO_PADRAO = 0.12;
export const EMBALAGEM = 1;
export const LUCRO_ALVO = 20;

export type Selo = "OK" | "CONFERIR" | "EVITAR" | "FORA_FAIXA" | "SEM_PRECO";

export function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Regra = { padrao: RegExp; motivo: string };

// EVITAR: certificação difícil, envio perigoso, proibido ou marca de terceiros.
const EVITAR: Regra[] = [
  { padrao: /\bcarregador\b.*\b(celular|usb|tipo c|type c|iphone|turbo|wireless|sem fio|inducao|notebook)\b|\b(celular|usb|tipo c|type c|iphone|turbo|wireless|sem fio|inducao)\b.*\bcarregador\b/, motivo: "carregador eletrônico (exige Anatel)" },
  { padrao: /\b(fone|headset|caixa de som|bluetooth|wi-?fi|rastreador|transmissor|smartwatch|radio)\b/, motivo: "item com rádio/Bluetooth (exige Anatel)" },
  { padrao: /\b(macarico|gas butano|refil de gas|isqueiro|inflamavel)\b/, motivo: "inflamável ou gás (envio restrito)" },
  { padrao: /\b(airsoft|arma|anti ?-?radar|antirradar|detector de radar|vape|cigarro eletronico|pod descartavel)\b/, motivo: "item proibido ou restrito" },
  { padrao: /\b(remedio|medicamento|suplemento|simparic|bravecto)\b/, motivo: "medicamento ou suplemento" },
  // o produto é o próprio pneu/bateria/colchão ou é feito de vidro (não acessórios que só citam a palavra)
  { padrao: /^(kit |jogo |par de )?(\d+x? )?(pneus?|colchao|colchoes)\b|\b(de|em) vidro\b|^(?!.*carregador).*\bbateria (automotiva|de carro)\b/, motivo: "pesado, frágil ou perigoso no envio" },
  {
    padrao: /\b(vw|volkswagen|chevrolet|gm|fiat|ford|toyota|honda|hyundai|renault|jeep|nissan|peugeot|citroen|mitsubishi|kia|bmw|audi|mercedes)\b.*\b(personalizad[oa]s?|logo|emblema)\b|\b(personalizad[oa]s?|logo|emblema)\b.*\b(vw|volkswagen|chevrolet|gm|fiat|ford|toyota|honda|hyundai|renault|jeep|nissan|peugeot|citroen|mitsubishi|kia|bmw|audi|mercedes)\b/,
    motivo: "usa marca de montadora",
  },
];

// CONFERIR: elétricos/eletrônicos que podem exigir certificação.
const CONFERIR: Regra[] = [
  { padrao: /\b(lampada|led|farol|xenon|neblina)\b/, motivo: "conferir certificação Inmetro antes de comprar" },
  { padrao: /\b(camera|dashcam|alarme|sensor de estacionamento)\b/, motivo: "eletrônico: conferir certificação Anatel/Inmetro antes de comprar" },
  { padrao: /\b(compressor|inversor|carregador|multimetro|amperimetro|testador|caneta de teste|12v|24v|110v|127v|220v|bivolt|eletric[oa]s?|parafusadeira|furadeira|soprador|aspirador|esmerilhadeira|lixadeira|serra (eletrica|circular|tico[- ]?tico|marmore)|tupia|recarregave(l|is)|bateria|baterias|usb|lanterna|motor|digital|eletronic[oa]s?)\b/, motivo: "elétrico: conferir certificação Inmetro/Anatel antes de comprar" },
];

export function envioAprox(preco: number): number | null {
  if (!Number.isFinite(preco) || preco <= 0) return null;
  if (preco < 19) return arred(preco / 2);
  if (preco < 49) return 6.85;
  if (preco < 79) return 8.15;
  if (preco < 100) return 12.95;
  return null; // acima de R$ 100 a tabela de referência não cobre
}

export function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

// Preço máximo de compra para lucrar LUCRO_ALVO por venda (aproximado).
export function compraMax(preco: number | null): number | null {
  if (preco == null) return null;
  const envio = envioAprox(preco);
  if (envio == null) return null;
  return arred(preco * (1 - COMISSAO_PADRAO) - envio - EMBALAGEM - LUCRO_ALVO);
}

export function classificar(nome: string, preco: number | null): { selo: Selo; motivo: string } {
  const t = normalizar(nome);
  for (const r of EVITAR) if (r.padrao.test(t)) return { selo: "EVITAR", motivo: r.motivo };
  const conferir = CONFERIR.find((r) => r.padrao.test(t));
  if (preco == null || !Number.isFinite(preco)) {
    return { selo: "SEM_PRECO", motivo: "preço não informado pela API" };
  }
  if (preco < FAIXA_IDEAL.min || preco > FAIXA_IDEAL.max) {
    const fora = preco < FAIXA_IDEAL.min ? "abaixo da faixa ideal (R$ 49 a 78,99)" : "acima da faixa ideal (R$ 49 a 78,99)";
    return { selo: "FORA_FAIXA", motivo: conferir ? `${fora}; ${conferir.motivo}` : fora };
  }
  if (conferir) return { selo: "CONFERIR", motivo: conferir.motivo };
  return { selo: "OK", motivo: "na faixa ideal, sem alerta de certificação" };
}

export type ItemRadar = {
  categoria_id: string;
  posicao: number | null;
  tipo: string;
  ml_id: string;
  nome: string;
  preco: number | null;
  link: string | null;
  selo: Selo;
  motivo: string;
  compra_max: number | null;
};

export type BuscaRadar = { categoria_id: string | null; posicao: number; termo: string; link: string | null };

export type CategoriaRadar = { id: string; nome: string | null; grupo: string };

export type DadosRelatorio = {
  quando: Date;
  categorias: CategoriaRadar[];
  itens: ItemRadar[];
  buscas: BuscaRadar[];
  falhas: { categoria: string; etapa: string; erro: string }[];
  ocultos?: Record<string, number>;
};

export function brl(n: number | null): string {
  if (n == null) return "—";
  return "R$ " + n.toFixed(2).replace(".", ",");
}

export function dataCurta(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", day: "2-digit", month: "2-digit" }).format(d);
}

export function horaCurta(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", hour: "2-digit", minute: "2-digit" }).format(d);
}

function cortar(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

const PESO_SELO: Record<Selo, number> = { OK: 0, CONFERIR: 1, FORA_FAIXA: 2, SEM_PRECO: 3, EVITAR: 4 };

export function apostasDoDia(itens: ItemRadar[], n = 3): ItemRadar[] {
  const vistos = new Set<string>();
  return itens
    .filter((i) => i.selo === "OK" || i.selo === "CONFERIR")
    .sort((a, b) => PESO_SELO[a.selo] - PESO_SELO[b.selo] || (a.posicao ?? 99) - (b.posicao ?? 99))
    .filter((i) => (vistos.has(i.ml_id) ? false : (vistos.add(i.ml_id), true)))
    .slice(0, n);
}

const TERMOS_GENERICOS = /^(lojas? online|promo(cao|cao relampago)?|promocao relampago|ofertas?( do dia)?|mais vendidos|black friday|frete gratis)$/;
export function buscaUtil(termo: string): boolean {
  return !TERMOS_GENERICOS.test(normalizar(termo));
}

export function linhaItem(i: ItemRadar): string {
  const pos = i.posicao != null ? `${i.posicao}º` : "–";
  const compra = i.compra_max == null ? "" : i.compra_max > 0 ? ` – compra máx. ${brl(i.compra_max)}` : " – não dá R$ 20 de lucro";
  const link = i.link ? `\n     ${i.link}` : "";
  return `  ${pos} – ${cortar(i.nome, 70)} – ${brl(i.preco)} – ${i.selo} (${i.motivo})${compra}${link}`;
}

export function renderRelatorio(d: DadosRelatorio, maxPorCategoria = 6): string {
  const out: string[] = [];
  out.push(`Radar ML – ${dataCurta(d.quando)}`);
  out.push("");
  const apostas = apostasDoDia(d.itens);
  out.push("APOSTAS DO DIA");
  if (apostas.length === 0) out.push("  Nenhum item na faixa ideal hoje.");
  for (const a of apostas) out.push(linhaItem(a));
  out.push("");

  const grupos = [...new Set(d.categorias.map((c) => c.grupo))];
  for (const g of grupos) {
    out.push(g.toUpperCase());
    for (const c of d.categorias.filter((x) => x.grupo === g)) {
      const itens = d.itens
        .filter((i) => i.categoria_id === c.id)
        .sort((a, b) => (a.posicao ?? 99) - (b.posicao ?? 99))
        .slice(0, maxPorCategoria);
      out.push(`  ${c.nome ?? c.id} (${c.id})`);
      const oc = d.ocultos?.[c.id] ?? 0;
      if (itens.length === 0) out.push(oc ? "    sem produtos de catálogo hoje" : "    sem itens (ver falhas)");
      for (const i of itens) out.push("  " + linhaItem(i));
      const buscas = d.buscas.filter((b) => b.categoria_id === c.id).sort((a, b) => a.posicao - b.posicao).slice(0, 5);
      if (buscas.length) out.push(`    Buscas em alta: ${buscas.map((b) => b.termo).join(", ")}`);
      if (oc) out.push(`    + ${oc} dos mais vendidos são anúncios próprios de vendedores (a API não mostra os detalhes)`);
      out.push("");
    }
  }

  const contagem = (s: Selo) => d.itens.filter((i) => i.selo === s).length;
  out.push(`RESUMO: ${d.itens.length} itens – ${contagem("OK")} OK, ${contagem("CONFERIR")} conferir, ${contagem("FORA_FAIXA")} fora da faixa, ${contagem("EVITAR")} evitar, ${contagem("SEM_PRECO")} sem preço.`);
  out.push("");
  out.push("FALHAS");
  if (d.falhas.length === 0) out.push("  Nenhuma.");
  for (const f of d.falhas) out.push(`  ${f.categoria} – ${f.etapa}: ${f.erro}`);
  out.push("");
  out.push(`Coletado às ${horaCurta(d.quando)} (Recife) pela API oficial do Mercado Livre. Preços mudam ao longo do dia.`);
  out.push("Compra máx. = preço × 0,88 − envio aprox. − R$ 1 de embalagem − R$ 20 de lucro (pacote até 0,3 kg). Confirme no Simulador de custos.");
  return out.join("\n");
}

// ---- PKCE e utilidades de segurança ----

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function aleatorio(nBytes = 32): string {
  const b = new Uint8Array(nBytes);
  crypto.getRandomValues(b);
  return base64url(b);
}

export async function desafioPkce(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(hash));
}

export function iguais(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function precisaRenovar(expiresAt: Date, agora: Date, folgaMin = 10): boolean {
  return expiresAt.getTime() - agora.getTime() < folgaMin * 60_000;
}

export function linkAutorizacao(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL("https://auth.mercadolivre.com.br/authorization");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("state", p.state);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}
