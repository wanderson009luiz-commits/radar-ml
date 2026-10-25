// Radar ML — interface. Todo texto vindo dos dados entra por textContent (nunca como HTML).
import {
  API_URL, NOME_SELO, SELOS, apostas, brl, compraMax, contarSelos, dadosValidos, dataHora, diaSemana,
  dadoAtrasado, extrairChave, filtrar, grupos, lerValor, linkSeguro, maisConstantes, ordenar, simularLucro, tendencia, unicos,
} from './core.js?v=dev';

const VERSAO = 'dev';
const K_CHAVE = 'radar:chave';
const K_CACHE = 'radar:cache';
const K_TAB = 'radar:tab';

const $ = (s) => document.querySelector(s);
const estado = { dados: null, deCache: false, tab: 'hoje', filtro: { grupo: 'Todos', selos: new Set(), texto: '' } };

// ---------- armazenamento (nunca quebra se o navegador bloquear) ----------
const guardar = {
  ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
  gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  apagar(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) n.append(f instanceof Node ? f : String(f));
  return n;
}

// ---------- telas ----------
function mostrar(qual) {
  for (const id of ['tela-carregando', 'tela-chave']) $('#' + id).hidden = id !== qual;
  const comDados = qual === 'dados';
  $('#abas').hidden = !comDados;
  for (const t of ['hoje', 'categorias', 'buscas', 'historico']) $('#tab-' + t).hidden = !comDados || estado.tab !== t;
}

function aviso(texto, { erro = false, acao = null } = {}) {
  const a = $('#aviso');
  a.replaceChildren();
  if (!texto) { a.hidden = true; return; }
  a.className = 'aviso' + (erro ? ' erro' : '');
  a.append(el('span', {}, texto));
  if (acao) a.append(el('button', { type: 'button', onclick: acao.fn }, acao.rotulo));
  a.hidden = false;
}

function pedirChave(msg) {
  $('#sub').textContent = 'não conectado';
  const e = $('#erro-chave');
  e.textContent = msg || '';
  e.hidden = !msg;
  mostrar('tela-chave');
}

// ---------- dados ----------
async function buscar(chave) {
  const r = await fetch(API_URL + '?dias=14', {
    headers: { 'x-radar-view': chave },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401) { const e = new Error('chave'); e.tipo = 'chave'; throw e; }
  if (!r.ok) { const e = new Error('http ' + r.status); e.tipo = 'servidor'; throw e; }
  let j;
  try { j = await r.json(); } catch { const e = new Error('json'); e.tipo = 'formato'; throw e; }
  if (!dadosValidos(j)) { const e = new Error('formato'); e.tipo = 'formato'; throw e; }
  return j;
}

function lerCache() {
  try {
    const c = JSON.parse(guardar.ler(K_CACHE) || 'null');
    return c && dadosValidos(c.dados) ? c : null;
  } catch { return null; }
}

async function carregar({ silencioso = false } = {}) {
  const chave = guardar.ler(K_CHAVE);
  if (!chave) { pedirChave(); return; }
  const btn = $('#btn-atualizar');
  btn.classList.add('girando');
  btn.disabled = true;
  if (!estado.dados && !silencioso) mostrar('tela-carregando');
  try {
    const dados = await buscar(chave);
    estado.dados = dados;
    estado.deCache = false;
    guardar.gravar(K_CACHE, JSON.stringify({ salvo_em: new Date().toISOString(), dados }));
    aviso(null);
    desenhar();
  } catch (e) {
    if (e.tipo === 'chave') {
      guardar.apagar(K_CHAVE);
      estado.dados = null;
      aviso(null);
      pedirChave('Essa chave não vale mais. Cole o link de acesso novo que o Claude te mandar.');
      return;
    }
    const cache = lerCache();
    const motivo = e.tipo === 'formato' ? 'O radar respondeu algo inesperado.' : 'Sem conexão com o radar agora.';
    if (cache) {
      estado.dados = cache.dados;
      estado.deCache = true;
      desenhar();
      aviso(`${motivo} Mostrando os dados salvos em ${dataHora(cache.salvo_em)}.`, { erro: true, acao: { rotulo: 'Tentar de novo', fn: () => carregar() } });
    } else {
      mostrar('tela-carregando');
      $('#tela-carregando .centro').textContent = motivo + ' Confira a internet e tente de novo.';
      aviso(motivo, { erro: true, acao: { rotulo: 'Tentar de novo', fn: () => carregar() } });
    }
  } finally {
    btn.classList.remove('girando');
    btn.disabled = false;
  }
}

// ---------- pedaços da interface ----------
function nomeCategoria(id) {
  return estado.dados?.ultima?.categorias.find((c) => c.id === id)?.nome ?? id;
}

function textoTendencia(t) {
  if (t.tipo === 'subiu') return `▲ subiu ${t.delta}`;
  if (t.tipo === 'desceu') return `▼ caiu ${t.delta}`;
  if (t.tipo === 'novo') return '● novo hoje';
  if (t.tipo === 'igual') return '= mesma posição';
  return null;
}

function cartao(i, { mostrarCategoria = true } = {}) {
  const t = tendencia(i, estado.dados.tem_anterior);
  const tt = textoTendencia(t);
  const link = linkSeguro(i.link);
  const cm = i.compra_max ?? (i.preco != null && i.selo !== 'EVITAR' ? compraMax(Number(i.preco)) : null);
  const sim = el('div', { class: 'sim', hidden: true });
  const res = el('div', { class: 'sim-res', 'aria-live': 'polite' });
  const entrada = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'ex.: 22,50', 'aria-label': 'Quanto você paga no produto, em reais' });
  entrada.addEventListener('input', () => desenharSimulacao(res, Number(i.preco), entrada.value));
  sim.append(el('label', {}, 'Quanto você paga no produto (com frete até você)?'), entrada, res);

  let compra = null;
  if (i.selo !== 'EVITAR' && cm != null) {
    compra = cm > 0
      ? el('p', { class: 'compra' }, 'Pague no máximo ', el('b', {}, brl(cm)), ' para lucrar R$ 20 por venda')
      : el('p', { class: 'compra ruim' }, el('b', {}, 'Não dá R$ 20 de lucro'), ' nesse preço');
  }
  const podeSimular = i.preco != null && Number(i.preco) < 100;
  return el('article', { class: 'card ' + i.selo, 'data-id': i.ml_id },
    el('div', { class: 'card-topo' },
      i.posicao != null ? el('span', { class: 'pos' }, `${i.posicao}º`) : null,
      el('span', { class: 'selo ' + i.selo }, NOME_SELO[i.selo]),
      tt ? el('span', { class: 'trend ' + t.tipo }, tt) : null,
      mostrarCategoria ? el('span', { class: 'cat' }, nomeCategoria(i.categoria_id)) : null,
    ),
    el('h3', {}, i.nome),
    el('p', { class: 'preco num' }, brl(i.preco)),
    el('p', { class: 'motivo' }, i.motivo),
    compra,
    (i.dias_em_alta ?? 0) >= 2 ? el('p', { class: 'dias' }, `Em alta há ${i.dias_em_alta} dias (últimos 7)`) : null,
    el('div', { class: 'acoes' },
      podeSimular ? el('button', {
        type: 'button', class: 'btn-sec', 'aria-expanded': 'false',
        onclick: (ev) => {
          const aberto = sim.hidden;
          sim.hidden = !aberto;
          ev.currentTarget.setAttribute('aria-expanded', String(aberto));
          if (aberto) entrada.focus();
        },
      }, 'Simular lucro') : null,
      link ? el('a', { class: 'btn', href: link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Abrir no Mercado Livre' }, 'Abrir no ML ↗') : null,
    ),
    podeSimular ? sim : null,
  );
}

function desenharSimulacao(alvo, preco, texto) {
  alvo.replaceChildren();
  const custo = lerValor(texto);
  if (texto.trim() === '') return;
  if (custo == null) { alvo.append(el('p', { class: 'erro' }, 'Digite um valor, por exemplo 22,50')); return; }
  const s = simularLucro(preco, custo);
  if (!s) { alvo.append(el('p', { class: 'erro' }, 'Não dá para simular esse preço.')); return; }
  const linha = (a, b, cls) => el('tr', { class: cls }, el('td', {}, a), el('td', {}, b));
  alvo.append(el('table', {},
    el('tbody', {},
      linha('Preço de venda', brl(preco)),
      linha('Comissão (12%)', '−' + brl(s.comissao)),
      linha('Envio (aprox.)', '−' + brl(s.envio)),
      linha('Embalagem', '−' + brl(s.embalagem)),
      linha('Produto', '−' + brl(custo)),
      el('tr', { class: 'total' }, el('td', {}, 'Sobra por venda'), el('td', { class: s.lucro >= 0 ? 'pos-v' : 'neg-v' }, `${brl(s.lucro)} (${String(s.margem).replace('.', ',')}%)`)),
    )),
    el('p', { class: 'nota' }, 'Estimativa com pacote até 0,3 kg. Confirme no Simulador de custos do Mercado Livre.'),
  );
}

// ---------- abas ----------
function tabHoje() {
  const d = estado.dados;
  const sec = $('#tab-hoje');
  sec.replaceChildren();
  if (!d.ultima) {
    sec.append(el('div', { class: 'vazio' }, 'Ainda não há coleta concluída. A primeira roda às 12h20.'));
    return;
  }
  const itens = unicos(d.ultima.itens);
  const c = contarSelos(itens);
  const irPara = (selo) => () => { estado.filtro.selos = new Set([selo]); trocarTab('categorias'); };
  sec.append(
    el('div', { class: 'resumo' },
      ...['OK', 'CONFERIR', 'FORA_FAIXA', 'EVITAR'].map((s) =>
        el('button', { type: 'button', class: s, onclick: irPara(s), 'aria-label': `${c[s]} ${NOME_SELO[s]} — ver lista` },
          el('span', { class: 'num' }, String(c[s])), el('small', {}, NOME_SELO[s]))),
    ),
    el('p', { class: 'nota' }, `${itens.length} produtos de catálogo em ${d.ultima.categorias.length} categorias.`),
  );
  const ap = apostas(d.ultima.itens);
  sec.append(el('h2', {}, 'Apostas do dia ', el('span', { class: 'cont' }, `(${ap.length})`)),
    el('p', { class: 'secao-desc' }, 'Na faixa de melhor lucro (R$ 49 a 78,99), da melhor posição para a pior.'));
  sec.append(ap.length ? el('div', { class: 'lista' }, ap.map((i) => cartao(i))) : el('div', { class: 'vazio' }, 'Nenhum produto na faixa ideal hoje.'));

  const jaMostrados = new Set(ap.map((i) => i.ml_id));
  const constantes = maisConstantes(d.ultima.itens).filter((i) => !jaMostrados.has(i.ml_id)).slice(0, 4);
  if (constantes.length) {
    sec.append(el('h2', {}, 'Sempre em alta'), el('p', { class: 'secao-desc' }, 'Aparecem nos mais vendidos há vários dias seguidos.'),
      el('div', { class: 'lista' }, constantes.map((i) => cartao(i))));
  }
  const oc = Object.values(d.ultima.ocultos || {}).reduce((a, b) => a + Number(b || 0), 0);
  if (oc) sec.append(el('p', { class: 'nota' }, `Além desses, ${oc} posições dos mais vendidos são anúncios próprios de vendedores — a API oficial não mostra os detalhes deles.`));
  sec.append(rodape());
}

function tabCategorias() {
  const d = estado.dados;
  const sec = $('#tab-categorias');
  sec.replaceChildren();
  if (!d.ultima) { sec.append(el('div', { class: 'vazio' }, 'Ainda não há coleta concluída.')); return; }
  const f = estado.filtro;
  const gs = ['Todos', ...grupos(d.ultima.categorias)];
  const lista = el('div', { id: 'lista-categorias' });
  const redesenhar = () => {
    lista.replaceChildren();
    const itens = filtrar(d.ultima.itens, d.ultima.categorias, f);
    if (!itens.length) { lista.append(el('div', { class: 'vazio' }, 'Nada com esses filtros.')); return; }
    for (const c of d.ultima.categorias) {
      if (f.grupo !== 'Todos' && c.grupo !== f.grupo) continue;
      const daCat = ordenar(itens.filter((i) => i.categoria_id === c.id));
      if (!daCat.length) continue;
      const oc = Number(d.ultima.ocultos?.[c.id] || 0);
      lista.append(
        el('div', { class: 'cat-titulo' }, el('h3', {}, c.nome ?? c.id), el('span', {}, `${daCat.length} produto(s)${oc ? ` · +${oc} ocultos` : ''}`)),
        el('div', { class: 'lista' }, daCat.map((i) => cartao(i, { mostrarCategoria: false }))),
      );
    }
  };
  const chipsGrupo = gs.map((g) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(f.grupo === g), 'data-grupo': g,
    onclick: (ev) => { f.grupo = g; for (const b of chipsGrupo) b.setAttribute('aria-pressed', String(b === ev.currentTarget)); redesenhar(); },
  }, g));
  const chipsSelo = SELOS.filter((s) => s !== 'SEM_PRECO').map((s) => el('button', {
    type: 'button', class: 'chip chip-selo ' + s, 'aria-pressed': String(f.selos.has(s)), 'data-selo': s,
    onclick: (ev) => { f.selos.has(s) ? f.selos.delete(s) : f.selos.add(s); ev.currentTarget.setAttribute('aria-pressed', String(f.selos.has(s))); redesenhar(); },
  }, NOME_SELO[s]));
  const campo = el('input', { type: 'search', placeholder: 'Procurar produto (ex.: compressor)', value: f.texto, 'aria-label': 'Procurar produto' });
  campo.addEventListener('input', () => { f.texto = campo.value; redesenhar(); });
  sec.append(
    el('div', { class: 'filtros' },
      el('div', { class: 'segmento', role: 'group', 'aria-label': 'Grupo' }, el('span', { class: 'rot' }, 'Grupo'), chipsGrupo),
      el('div', { class: 'segmento', role: 'group', 'aria-label': 'Selo' }, el('span', { class: 'rot' }, 'Selo'), chipsSelo),
      el('div', { class: 'busca' }, campo),
    ),
    lista,
    rodape(),
  );
  redesenhar();
}

function urlBusca(termo) {
  const slug = String(termo).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');
  return 'https://lista.mercadolivre.com.br/' + encodeURIComponent(slug);
}

function tabBuscas() {
  const d = estado.dados;
  const sec = $('#tab-buscas');
  sec.replaceChildren();
  if (!d.ultima) { sec.append(el('div', { class: 'vazio' }, 'Ainda não há coleta concluída.')); return; }
  sec.append(el('h2', {}, 'Buscas que mais cresceram'), el('p', { class: 'secao-desc' }, 'O que os compradores estão procurando em cada categoria. Toque para ver a busca no Mercado Livre.'));
  for (const c of d.ultima.categorias) {
    const bs = d.ultima.buscas.filter((b) => b.categoria_id === c.id).sort((a, b) => a.posicao - b.posicao);
    if (!bs.length) continue;
    sec.append(el('div', { class: 'cat-titulo' }, el('h3', {}, c.nome ?? c.id), el('span', {}, c.grupo)),
      el('div', { class: 'termos' }, bs.map((b) => el('a', { class: 'termo', href: urlBusca(b.termo), target: '_blank', rel: 'noopener noreferrer' }, el('b', {}, `${b.posicao}º`), b.termo))));
  }
  sec.append(rodape());
}

function tabHistorico() {
  const d = estado.dados;
  const sec = $('#tab-historico');
  sec.replaceChildren();
  sec.append(el('h2', {}, 'Coletas recentes'), el('p', { class: 'secao-desc' }, 'A coleta roda sozinha todo dia às 12h20 (Recife).'));
  const rot = { ok: 'ok', parcial: 'parcial', erro: 'erro', rodando: 'rodando' };
  sec.append(d.execucoes.length
    ? el('div', { class: 'dias-lista' }, d.execucoes.map((e) => el('div', { class: 'dia' },
        el('span', { class: 'quando' }, `${diaSemana(e.iniciado_em)} · ${dataHora(e.iniciado_em).split(' às ')[1]}`),
        el('span', { class: 'st ' + (rot[e.status] ?? 'erro') }, e.status),
        el('span', { class: 'det' }, e.status === 'erro' ? (e.mensagem || 'falhou') : `${e.total} produtos · ${e.ok} OK · ${e.conferir} conferir`),
      )))
    : el('div', { class: 'vazio' }, 'Nenhuma coleta ainda.'));
  if (d.ultima) {
    const constantes = maisConstantes(d.ultima.itens, 12);
    sec.append(el('h2', {}, 'Sempre em alta'));
    sec.append(constantes.length
      ? el('div', { class: 'lista' }, constantes.map((i) => cartao(i)))
      : el('div', { class: 'vazio' }, 'Com alguns dias de coleta, aqui aparecem os produtos que continuam em alta.'));
  }
  sec.append(rodape());
}

function rodape() {
  return el('div', { class: 'rodape' },
    el('p', {}, `Radar ML · versão ${VERSAO} · dados da API oficial do Mercado Livre`),
    el('button', { type: 'button', onclick: () => { guardar.apagar(K_CHAVE); aviso(null); pedirChave(); } }, 'Trocar chave de acesso'),
  );
}

const DESENHAR = { hoje: tabHoje, categorias: tabCategorias, buscas: tabBuscas, historico: tabHistorico };

function trocarTab(t) {
  if (!DESENHAR[t]) t = 'hoje';
  estado.tab = t;
  guardar.gravar(K_TAB, t);
  for (const b of document.querySelectorAll('#abas button')) {
    if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  DESENHAR[t]();
  mostrar('dados');
  window.scrollTo({ top: 0 });
}

function desenhar() {
  const d = estado.dados;
  const sub = $('#sub');
  if (d.ultima) {
    sub.textContent = `Coleta de ${dataHora(d.ultima.iniciado_em)}${estado.deCache ? ' (salva)' : ''}`;
    if (!estado.deCache && dadoAtrasado(d.ultima.iniciado_em)) {
      aviso(`A coleta de hoje ainda não aparece — último dado é de ${dataHora(d.ultima.iniciado_em)}.`);
    }
  } else {
    sub.textContent = 'aguardando a primeira coleta';
  }
  trocarTab(estado.tab);
}

// ---------- início ----------
function salvarChaveDe(texto) {
  const t = String(texto || '').trim();
  const k = extrairChave(t.includes('#') ? t.slice(t.indexOf('#')) : '#k=' + t);
  if (!k) return false;
  guardar.gravar(K_CHAVE, k);
  return true;
}

function iniciar() {
  document.documentElement.style.setProperty('--topo-h', $('.topo').offsetHeight + 'px');
  window.addEventListener('resize', () => document.documentElement.style.setProperty('--topo-h', $('.topo').offsetHeight + 'px'));
  const daUrl = extrairChave(location.hash);
  if (daUrl) {
    guardar.gravar(K_CHAVE, daUrl);
    history.replaceState(null, '', location.pathname + location.search);
  }
  const salva = guardar.ler(K_TAB);
  if (salva && DESENHAR[salva]) estado.tab = salva;
  for (const b of document.querySelectorAll('#abas button')) b.addEventListener('click', () => trocarTab(b.dataset.tab));
  $('#btn-atualizar').addEventListener('click', () => carregar({ silencioso: true }));
  $('#form-chave').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!salvarChaveDe($('#campo-chave').value)) {
      const e = $('#erro-chave');
      e.textContent = 'Não reconheci a chave. Cole o link inteiro que o Claude mandou.';
      e.hidden = false;
      return;
    }
    $('#campo-chave').value = '';
    carregar();
  });
  carregar();
}

iniciar();
