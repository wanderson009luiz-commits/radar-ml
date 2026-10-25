// Teste de ponta a ponta da página (Playwright + API do radar falsa).
// Uso: node tests/e2e/run.mjs [pasta-de-prints]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAVE, painel } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const shots = path.resolve(process.argv[2] || path.join(here, 'shots'));
fs.mkdirSync(shots, { recursive: true });
const { chromium } = await import(process.env.PW_PATH || 'playwright');

const ARQUIVOS = ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const PASTAS = ['css', 'js', 'fonts'];
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const servidor = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const ok = ARQUIVOS.includes(rel) || PASTAS.some((p) => rel.startsWith(p + '/'));
  const p = path.join(root, rel);
  if (!ok || !p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': tipos[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}/`;

const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
let falhas = 0, passou = 0;
const erros = [];
function check(cond, msg) { if (cond) { passou++; console.log('  ✓', msg); } else { falhas++; console.log('  ✗', msg); } }

const CEL = { width: 390, height: 844 };
const MINI = { width: 320, height: 640 };
const DESK = { width: 1366, height: 900 };

// api: { status, body } ou função(req) → { status, body }
async function abrir(nome, { viewport = CEL, hash = `#k=${CHAVE}`, api = { status: 200, body: painel() }, ctx = null } = {}) {
  const context = ctx || await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1, locale: 'pt-BR', timezoneId: 'America/Recife' });
  const page = await context.newPage();
  page.estado = { api, pedidos: 0 };
  page.on('pageerror', (e) => erros.push(`[${nome}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource: the server responded with a status of (401|500)|net::ERR_FAILED|net::ERR_INTERNET_DISCONNECTED/.test(m.text())) erros.push(`[${nome}] console: ${m.text()}`); });
  page.on('dialog', (d) => { erros.push(`[${nome}] dialog inesperado: ${d.message()}`); d.dismiss(); });
  page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) erros.push(`[${nome}] ${r.status()} ${r.url()}`); });
  await context.route(/^https:\/\/(?!vldiylyynkgprpfxyyej\.supabase\.co\/functions\/v1\/radar\/dados).*/, (route) => { erros.push(`[${nome}] pedido externo inesperado: ${route.request().url()}`); route.abort(); });
  await page.route('https://vldiylyynkgprpfxyyej.supabase.co/functions/v1/radar/dados**', (route) => {
    page.estado.pedidos++;
    const req = route.request();
    if (req.headers()['x-radar-view'] !== CHAVE) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"erro":"chave inválida"}' });
    const a = typeof page.estado.api === 'function' ? page.estado.api(req) : page.estado.api;
    if (a.abortar) return route.abort('internetdisconnected');
    return route.fulfill({ status: a.status, contentType: 'application/json', body: typeof a.body === 'string' ? a.body : JSON.stringify(a.body) });
  });
  await page.goto(base + 'index.html' + hash);
  return page;
}

const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const texto = (page, sel) => page.locator(sel).first().innerText();

// ------------------------------------------------------------ 1
console.log('\n1) Celular: abrir pelo link de acesso, resumo e apostas');
{
  const page = await abrir('hoje');
  await page.waitForSelector('#tab-hoje .card');
  check(!(await page.evaluate(() => location.hash)), 'chave sai da barra de endereço depois de salva');
  check(await page.evaluate((k) => localStorage.getItem('radar:chave') === k, CHAVE), 'chave guardada no aparelho');
  const sub = await texto(page, '#sub');
  check(/Coleta de 25\/10 às 12:20/.test(sub), `subtítulo com a hora da coleta em Recife ("${sub}")`);
  const resumo = await texto(page, '.resumo');
  check(/5\s*OK/.test(resumo) && /2\s*Conferir/.test(resumo) && /11\s*Fora da faixa/.test(resumo) && /2\s*Evitar/.test(resumo), 'resumo: 5 OK, 2 conferir, 11 fora, 2 evitar');
  const nomes = await page.locator('#tab-hoje .lista').first().locator('h3').allInnerTexts();
  check(nomes.length === 5 && /Jogo De Chave Boca/.test(nomes[0]) && /Capa Para Carro/.test(nomes[4]), 'apostas: 5 OK, da melhor posição para a pior');
  check(await page.locator('#tab-hoje').getByText('Pague no máximo').count() >= 5, 'cada aposta mostra o preço máximo de compra');
  check(/15 posições|38 posições|posições dos mais vendidos/.test(await texto(page, '#tab-hoje')), 'avisa sobre os anúncios que a API não mostra');
  check(await semRolagemLateral(page), 'sem rolagem para os lados (390px)');
  const fontes = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 16px "Space Grotesk"') && document.fonts.check('16px "Atkinson Hyperlegible"'); });
  check(fontes, 'fontes do próprio site carregadas');
  await page.screenshot({ path: `${shots}/01-hoje-celular.png`, fullPage: true });

  // menu fixo não cobre o último conteúdo
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const cobre = await page.evaluate(() => {
    const nav = document.querySelector('#abas').getBoundingClientRect();
    const ult = [...document.querySelectorAll('#tab-hoje > *')].pop().getBoundingClientRect();
    return ult.bottom > nav.top + 1;
  });
  check(!cobre, 'menu de baixo não cobre o fim da página');

  console.log('\n2) Simular lucro');
  const card = page.locator('#tab-hoje .card').first();
  await card.getByRole('button', { name: 'Simular lucro' }).click();
  const campo = card.locator('input');
  await campo.fill('20');
  const r1 = await card.locator('.sim-res').innerText();
  check(/Comissão \(12%\)\s*−R\$ 6,96/.test(r1) && /Sobra por venda\s*R\$ 21,89/.test(r1), 'R$ 58,00 pagando R$ 20 → sobra R$ 21,89 (comissão R$ 6,96, envio R$ 8,15)');
  await campo.fill('45,00');
  const r2 = await card.locator('.sim-res').innerText();
  check(/−R\$ 3,11/.test(r2) && /neg-v/.test(await card.locator('.sim-res').innerHTML()), 'pagando R$ 45,00 → prejuízo de R$ 3,11 em vermelho');
  await campo.fill('abc');
  check(/Digite um valor/.test(await card.locator('.sim-res').innerText()), 'valor inválido gera mensagem clara');
  await campo.fill('20');
  await page.screenshot({ path: `${shots}/02-simular-celular.png`, fullPage: false });

  console.log('\n3) Categorias com filtros');
  await page.click('#abas [data-tab="categorias"]');
  await page.waitForSelector('#tab-categorias .card');
  check(await page.locator('#tab-categorias .cat-titulo').count() === 6, '6 categorias listadas');
  await page.click('#tab-categorias .chip[data-grupo="Elétrica"]');
  const titulos = await page.locator('#tab-categorias .cat-titulo h3').allInnerTexts();
  check(titulos.join('|') === 'Medições e Instrumentação|Energia', 'filtro Elétrica mostra só Medições e Energia');
  check(/\+6 ocultos/.test(await texto(page, '#tab-categorias .cat-titulo')), 'mostra quantos anúncios ficaram ocultos');
  await page.click('#tab-categorias .chip[data-selo="OK"]');
  check(/Nada com esses filtros/.test(await texto(page, '#lista-categorias')), 'Elétrica + OK sem resultado → mensagem de vazio');
  await page.click('#tab-categorias .chip[data-selo="OK"]');
  await page.click('#tab-categorias .chip[data-grupo="Todos"]');
  await page.fill('#tab-categorias input[type="search"]', 'multimetro');
  const achados = await page.locator('#lista-categorias h3:not(.cat-titulo h3)').count();
  const nomesAchados = await page.locator('#lista-categorias .card h3').allInnerTexts();
  check(nomesAchados.length === 1 && /Multímetro/.test(nomesAchados[0]), `busca "multimetro" (sem acento) acha o Multímetro (${achados})`);
  await page.fill('#tab-categorias input[type="search"]', '');
  check(await semRolagemLateral(page), 'sem rolagem lateral nos filtros');
  await page.screenshot({ path: `${shots}/03-categorias-celular.png`, fullPage: false });

  console.log('\n4) Atalho do resumo, buscas e histórico');
  await page.click('#abas [data-tab="hoje"]');
  await page.click('.resumo button.EVITAR');
  await page.waitForSelector('#tab-categorias:not([hidden])');
  const evitar = await page.locator('#lista-categorias .card').count();
  check(evitar === 2 && await page.locator('#lista-categorias .card.EVITAR').count() === 2, 'tocar em "Evitar" abre a lista só com os 2 evitar');
  await page.click('#tab-categorias .chip[data-selo="EVITAR"]');

  await page.click('#abas [data-tab="buscas"]');
  const href = await page.locator('#tab-buscas a.termo').first().getAttribute('href');
  check(href === 'https://lista.mercadolivre.com.br/sensor-estacionamento', `busca abre o Mercado Livre (${href})`);
  check(await page.locator('#tab-buscas a.termo').count() === 16, '16 buscas em alta');
  await page.screenshot({ path: `${shots}/04-buscas-celular.png`, fullPage: true });

  await page.click('#abas [data-tab="historico"]');
  const hist = await texto(page, '#tab-historico');
  check(/dom.*25\/10.*12:20/i.test(hist) && /114 produtos · 8 OK · 9 conferir/.test(hist) && /autorização do Mercado Livre venceu/.test(hist), 'histórico mostra coletas ok e com erro');
  await page.screenshot({ path: `${shots}/05-historico-celular.png`, fullPage: true });

  console.log('\n5) Recarregar lembra a chave e a aba');
  await page.goto(base + 'index.html');
  await page.waitForSelector('#tab-historico:not([hidden])');
  check(page.estado.pedidos >= 2, 'recarregou sem pedir a chave de novo e voltou para a aba Histórico');
  await page.context().close();
}

// ------------------------------------------------------------ 6
console.log('\n6) Segundo dia: tendência e "sempre em alta"');
{
  const page = await abrir('historico', { api: { status: 200, body: painel({ historico: true }) } });
  await page.waitForSelector('#tab-hoje .card');
  const t = await texto(page, '#tab-hoje');
  check(/▲ subiu 4/.test(t), 'Jogo de chaves: subiu 4 posições (9º → 5º)');
  check(/● novo hoje/.test(t), 'produto que não estava ontem aparece como novo');
  check(/= mesma posição/.test(t), 'produto na mesma posição');
  check(/Sempre em alta/.test(t) && /Em alta há 2 dias/.test(t), 'seção "Sempre em alta" com os dias');
  await page.screenshot({ path: `${shots}/06-segundo-dia-celular.png`, fullPage: true });
  await page.context().close();
}

// ------------------------------------------------------------ 7
console.log('\n7) Sem chave, chave errada e chave colada');
{
  const page = await abrir('sem-chave', { hash: '' });
  await page.waitForSelector('#tela-chave:not([hidden])');
  check(page.estado.pedidos === 0, 'sem chave não chama a API');
  await page.fill('#campo-chave', 'qualquer coisa');
  await page.click('#form-chave button');
  check(/Não reconheci a chave/.test(await texto(page, '#erro-chave')), 'texto inválido → mensagem clara');
  await page.screenshot({ path: `${shots}/07-sem-chave-celular.png` });
  await page.fill('#campo-chave', `https://wanderson009luiz-commits.github.io/radar-ml/#k=${CHAVE}`);
  await page.click('#form-chave button');
  await page.waitForSelector('#tab-hoje .card');
  check(true, 'colar o link completo conecta');
  await page.context().close();

  const p2 = await abrir('chave-errada', { hash: '#k=' + 'cd'.repeat(24) });
  await p2.waitForSelector('#tela-chave:not([hidden])');
  check(/não vale mais/.test(await texto(p2, '#erro-chave')), 'chave recusada pelo servidor → pede o link novo');
  check(await p2.evaluate(() => localStorage.getItem('radar:chave')) === null, 'chave recusada é apagada do aparelho');
  await p2.context().close();
}

// ------------------------------------------------------------ 8
console.log('\n8) Falhas: API fora, sem internet, resposta estranha');
{
  const page = await abrir('fora');
  await page.waitForSelector('#tab-hoje .card');
  page.estado.api = { status: 500, body: '{"x":1}' };
  await page.click('#btn-atualizar');
  await page.waitForSelector('#aviso:not([hidden])');
  const av = await texto(page, '#aviso');
  check(/Sem conexão com o radar agora\. Mostrando os dados salvos/.test(av), 'servidor fora → mostra os dados salvos e avisa');
  check(await page.locator('#tab-hoje .card').count() === 5, 'as apostas continuam na tela');
  check(/\(salva\)/.test(await texto(page, '#sub')), 'subtítulo indica dado salvo');
  await page.screenshot({ path: `${shots}/08-offline-celular.png` });
  page.estado.api = { status: 200, body: painel() };
  await page.click('#aviso button');
  await page.waitForFunction(() => document.querySelector('#aviso').hidden);
  check(!/\(salva\)/.test(await texto(page, '#sub')), '"Tentar de novo" volta ao normal quando o servidor responde');
  page.estado.api = { status: 200, body: { foo: 1 } };
  await page.click('#btn-atualizar');
  await page.waitForSelector('#aviso:not([hidden])');
  check(/respondeu algo inesperado/.test(await texto(page, '#aviso')), 'resposta estranha não quebra a tela');
  await page.context().close();

  const p2 = await abrir('sem-internet', { api: { abortar: true } });
  await p2.waitForSelector('#aviso:not([hidden])');
  check(/Sem conexão/.test(await texto(p2, '#aviso')) && await p2.locator('#aviso button').count() === 1, 'sem internet e sem dado salvo → mensagem e botão de tentar de novo');
  p2.estado.api = { status: 200, body: painel() };
  await p2.click('#aviso button');
  await p2.waitForSelector('#tab-hoje .card');
  check(true, 'tentar de novo carrega quando a internet volta');
  await p2.context().close();
}

// ------------------------------------------------------------ 9
console.log('\n9) Dado atrasado, sem coleta e texto malicioso');
{
  const antigo = painel({ quando: new Date(Date.now() - 3 * 86400000).toISOString() });
  const page = await abrir('atrasado', { api: { status: 200, body: antigo } });
  await page.waitForSelector('#tab-hoje .card');
  check(/coleta de hoje ainda não aparece/.test(await texto(page, '#aviso')), 'coleta de 3 dias atrás → aviso');
  await page.context().close();

  const p2 = await abrir('sem-coleta', { api: { status: 200, body: { execucoes: [], ultima: null, tem_anterior: false } } });
  await p2.waitForSelector('#tab-hoje:not([hidden])');
  check(/Ainda não há coleta concluída/.test(await texto(p2, '#tab-hoje')), 'sem nenhuma coleta → mensagem');
  await p2.context().close();

  const mal = painel();
  mal.ultima.itens[3] = { ...mal.ultima.itens[3], nome: '<img src=x onerror="alert(1)">Capa', link: 'javascript:alert(1)' };
  const p3 = await abrir('xss', { api: { status: 200, body: mal } });
  await p3.waitForSelector('#tab-hoje .card');
  check(await p3.locator('#tab-hoje .card img').count() === 0 && /<img src=x/.test(await texto(p3, '#tab-hoje')), 'nome com HTML aparece como texto, sem executar');
  check(await p3.locator('a[href^="javascript"]').count() === 0, 'link perigoso é descartado');
  await p3.context().close();
}

// ------------------------------------------------------------ 10
console.log('\n10) Telas pequenas e desktop');
{
  const page = await abrir('320', { viewport: MINI });
  await page.waitForSelector('#tab-hoje .card');
  check(await semRolagemLateral(page), 'sem rolagem lateral em 320px');
  await page.screenshot({ path: `${shots}/09-hoje-320.png`, fullPage: true });
  await page.click('#abas [data-tab="categorias"]');
  check(await semRolagemLateral(page), 'categorias sem rolagem lateral em 320px');
  await page.screenshot({ path: `${shots}/10-categorias-320.png` });
  await page.context().close();

  const d = await abrir('desktop', { viewport: DESK });
  await d.waitForSelector('#tab-hoje .card');
  check(await semRolagemLateral(d), 'sem rolagem lateral no desktop');
  await d.screenshot({ path: `${shots}/11-hoje-desktop.png`, fullPage: true });
  await d.click('#abas [data-tab="categorias"]');
  await d.screenshot({ path: `${shots}/12-categorias-desktop.png` });
  await d.context().close();
}

await browser.close();
servidor.close();
for (const e of erros) { falhas++; console.log('  ✗', e); }
console.log(`\n${passou} verificações ok, ${falhas} falha(s). Prints em ${shots}`);
process.exit(falhas ? 1 : 0);
