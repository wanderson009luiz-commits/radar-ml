// Regras da página do Radar ML (sem DOM): contas, filtros, tendência e validação dos dados.
// As contas seguem as mesmas do servidor (supabase/functions/_shared/lib.ts).

export const API_URL = 'https://vldiylyynkgprpfxyyej.supabase.co/functions/v1/radar/dados';
export const COMISSAO = 0.12;
export const EMBALAGEM = 1;
export const LUCRO_ALVO = 20;
export const FAIXA = { min: 49, max: 78.99 };
export const SELOS = ['OK', 'CONFERIR', 'FORA_FAIXA', 'SEM_PRECO', 'EVITAR'];
export const NOME_SELO = { OK: 'OK', CONFERIR: 'Conferir', FORA_FAIXA: 'Fora da faixa', SEM_PRECO: 'Sem preço', EVITAR: 'Evitar' };
const PESO = { OK: 0, CONFERIR: 1, FORA_FAIXA: 2, SEM_PRECO: 3, EVITAR: 4 };

export function arred(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function brl(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const s = Math.abs(v).toFixed(2).split('.');
  const inteiro = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '−' : '') + 'R$ ' + inteiro + ',' + s[1];
}

// Lê "12,50", "12.50", "R$ 1.234,56" → número (ou null se inválido).
export function lerValor(txt) {
  if (txt == null) return null;
  let s = String(txt).replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function envioAprox(preco) {
  if (!Number.isFinite(preco) || preco <= 0) return null;
  if (preco < 19) return arred(preco / 2);
  if (preco < 49) return 6.85;
  if (preco < 79) return 8.15;
  if (preco < 100) return 12.95;
  return null;
}

// Quanto sobra por venda pagando "custo" no produto.
export function simularLucro(preco, custo) {
  if (!Number.isFinite(preco) || preco <= 0 || !Number.isFinite(custo) || custo < 0) return null;
  const envio = envioAprox(preco);
  if (envio == null) return null;
  const comissao = arred(preco * COMISSAO);
  const lucro = arred(preco - comissao - envio - EMBALAGEM - custo);
  return { comissao, envio, embalagem: EMBALAGEM, lucro, margem: arred((lucro / preco) * 100) };
}

export function compraMax(preco) {
  const envio = envioAprox(preco);
  if (envio == null) return null;
  return arred(preco * (1 - COMISSAO) - envio - EMBALAGEM - LUCRO_ALVO);
}

const TZ = 'America/Recife';
export function dataHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  return `${dia} às ${hora}`;
}

export function diaSemana(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
  return s.replace('.', '');
}

// Diferença de dias de calendário (Recife) entre duas datas.
export function diasEntre(isoA, isoB) {
  const f = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
  return Math.round((Date.parse(f(isoB)) - Date.parse(f(isoA))) / 86_400_000);
}

// "novo" (não estava ontem), "subiu"/"desceu" (com quantas posições), "igual" ou "sem_hist" (ainda não há dia anterior).
export function tendencia(item, temAnterior) {
  if (!temAnterior) return { tipo: 'sem_hist', delta: 0 };
  if (item.posicao_anterior == null) return { tipo: 'novo', delta: 0 };
  const delta = item.posicao_anterior - item.posicao;
  if (delta > 0) return { tipo: 'subiu', delta };
  if (delta < 0) return { tipo: 'desceu', delta: -delta };
  return { tipo: 'igual', delta: 0 };
}

export function normalizar(t) {
  return String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export function ordenar(itens) {
  return [...itens].sort((a, b) => PESO[a.selo] - PESO[b.selo] || (a.posicao ?? 99) - (b.posicao ?? 99) || a.nome.localeCompare(b.nome));
}

// Melhores oportunidades: OK primeiro, depois CONFERIR; sem repetir o mesmo produto.
export function apostas(itens, n = 5) {
  const vistos = new Set();
  return ordenar(itens.filter((i) => i.selo === 'OK' || i.selo === 'CONFERIR'))
    .filter((i) => (vistos.has(i.ml_id) ? false : (vistos.add(i.ml_id), true)))
    .slice(0, n);
}

export function filtrar(itens, categorias, { grupo = 'Todos', selos = null, texto = '' } = {}) {
  const grupoDe = new Map(categorias.map((c) => [c.id, c.grupo]));
  const q = normalizar(texto);
  return itens.filter((i) =>
    (grupo === 'Todos' || grupoDe.get(i.categoria_id) === grupo) &&
    (!selos || selos.size === 0 || selos.has(i.selo)) &&
    (!q || normalizar(i.nome).includes(q))
  );
}

export function grupos(categorias) {
  return [...new Set(categorias.map((c) => c.grupo))];
}

export function contarSelos(itens) {
  const c = Object.fromEntries(SELOS.map((s) => [s, 0]));
  for (const i of itens) if (c[i.selo] != null) c[i.selo]++;
  return c;
}

// Produtos que aparecem em mais de uma categoria contam uma vez.
export function unicos(itens) {
  const m = new Map();
  for (const i of itens) {
    const atual = m.get(i.ml_id);
    if (!atual || (i.posicao ?? 99) < (atual.posicao ?? 99)) m.set(i.ml_id, i);
  }
  return [...m.values()];
}

export function maisConstantes(itens, n = 8) {
  return unicos(itens)
    .filter((i) => (i.dias_em_alta ?? 0) >= 2)
    .sort((a, b) => b.dias_em_alta - a.dias_em_alta || PESO[a.selo] - PESO[b.selo] || (a.posicao ?? 99) - (b.posicao ?? 99))
    .slice(0, n);
}

export function extrairChave(hash) {
  const m = /(?:^#|&)k=([0-9a-f]{16,128})(?:&|$)/i.exec(hash || '');
  return m ? m[1].toLowerCase() : null;
}

// Confere o formato antes de desenhar (resposta estranha nunca quebra a tela).
export function dadosValidos(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.execucoes)) return false;
  if (d.ultima == null) return true; // ainda sem coleta boa
  const u = d.ultima;
  return Array.isArray(u.itens) && Array.isArray(u.categorias) && Array.isArray(u.buscas) &&
    u.itens.every((i) => typeof i.nome === 'string' && typeof i.ml_id === 'string' && SELOS.includes(i.selo));
}

// A coleta de hoje é de hoje? (para avisar quando o dado está velho)
export function idadeEmDias(iso, agora = new Date()) {
  return diasEntre(iso, agora.toISOString());
}

// O dado está atrasado? Antes das 12h40 (Recife) é normal ainda ser o de ontem.
export function dadoAtrasado(iso, agora = new Date()) {
  const idade = idadeEmDias(iso, agora);
  if (idade >= 2) return true;
  if (idade < 1) return false;
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(agora).split(':').map(Number);
  return h * 60 + m >= 12 * 60 + 40;
}

export function linkSeguro(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)mercadoli(vre|bre)\.com(\.br)?$/.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}
