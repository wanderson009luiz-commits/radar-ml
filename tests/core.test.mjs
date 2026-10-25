import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apostas, brl, compraMax, contarSelos, dadoAtrasado, dadosValidos, dataHora, envioAprox, extrairChave, filtrar,
  lerValor, linkSeguro, maisConstantes, ordenar, simularLucro, tendencia, unicos,
} from '../js/core.js';

const item = (p) => ({ categoria_id: 'MLB1', posicao: 1, ml_id: 'A', nome: 'Produto', preco: 59.9, link: 'https://www.mercadolivre.com.br/p/A', selo: 'OK', motivo: 'm', compra_max: 23.56, dias_em_alta: 1, posicao_anterior: null, ...p });

test('formato brasileiro de dinheiro', () => {
  assert.equal(brl(59.9), 'R$ 59,90');
  assert.equal(brl(1234.5), 'R$ 1.234,50');
  assert.equal(brl(1234567.891), 'R$ 1.234.567,89');
  assert.equal(brl(-17.24), '−R$ 17,24');
  assert.equal(brl(0), 'R$ 0,00');
  assert.equal(brl(null), '—');
  assert.equal(brl('abc'), '—');
});

test('leitura de valores digitados', () => {
  assert.equal(lerValor('22,50'), 22.5);
  assert.equal(lerValor('22.50'), 22.5);
  assert.equal(lerValor('R$ 1.234,56'), 1234.56);
  assert.equal(lerValor('1.234.567'), 1234567);
  assert.equal(lerValor(' 15 '), 15);
  assert.equal(lerValor(''), null);
  assert.equal(lerValor('abc'), null);
  assert.equal(lerValor('-5'), null);
  assert.equal(lerValor('1,2,3'), null);
});

test('envio e compra máxima iguais ao servidor', () => {
  assert.equal(envioAprox(18), 9);
  assert.equal(envioAprox(48.99), 6.85);
  assert.equal(envioAprox(49), 8.15);
  assert.equal(envioAprox(79), 12.95);
  assert.equal(envioAprox(100), null);
  assert.equal(compraMax(59.9), 23.56);
});

test('simulação de lucro: conta conferida (R$ 59,90 pagando R$ 20 → R$ 23,56)', () => {
  const s = simularLucro(59.9, 20);
  assert.deepEqual(s, { comissao: 7.19, envio: 8.15, embalagem: 1, lucro: 23.56, margem: 39.33 });
  assert.equal(simularLucro(59.9, -1), null);
  assert.equal(simularLucro(150, 10), null);
  assert.equal(simularLucro(NaN, 10), null);
});

test('simulação: pagar a compra máxima dá R$ 20 (± centavo) em 5.000 preços aleatórios', () => {
  for (let k = 0; k < 5000; k++) {
    const preco = Math.round((49 + Math.random() * 50.99) * 100) / 100;
    const s = simularLucro(preco, compraMax(preco));
    assert.ok(Math.abs(s.lucro - 20) <= 0.011, `preço ${preco}: ${s.lucro}`);
  }
});

test('tendência de posição', () => {
  assert.deepEqual(tendencia(item({ posicao: 3, posicao_anterior: 7 }), true), { tipo: 'subiu', delta: 4 });
  assert.deepEqual(tendencia(item({ posicao: 9, posicao_anterior: 2 }), true), { tipo: 'desceu', delta: 7 });
  assert.deepEqual(tendencia(item({ posicao: 5, posicao_anterior: 5 }), true), { tipo: 'igual', delta: 0 });
  assert.deepEqual(tendencia(item({ posicao: 5, posicao_anterior: null }), true), { tipo: 'novo', delta: 0 });
  assert.deepEqual(tendencia(item({ posicao: 5, posicao_anterior: null }), false), { tipo: 'sem_hist', delta: 0 });
});

test('apostas: OK antes de Conferir, por posição, sem repetir produto', () => {
  const a = apostas([
    item({ ml_id: 'c', selo: 'CONFERIR', posicao: 1 }),
    item({ ml_id: 'b', selo: 'OK', posicao: 9 }),
    item({ ml_id: 'x', selo: 'EVITAR', posicao: 1 }),
    item({ ml_id: 'd', selo: 'OK', posicao: 2 }),
    item({ ml_id: 'd', selo: 'OK', posicao: 4, categoria_id: 'MLB2' }),
    item({ ml_id: 'f', selo: 'FORA_FAIXA', posicao: 1 }),
  ]);
  assert.deepEqual(a.map((i) => i.ml_id), ['d', 'b', 'c']);
});

test('filtros por grupo, selo e texto (sem acento)', () => {
  const cats = [{ id: 'C1', grupo: 'Carros' }, { id: 'E1', grupo: 'Elétrica' }];
  const its = [
    item({ ml_id: '1', categoria_id: 'C1', nome: 'Compressor de Ar 12V', selo: 'CONFERIR' }),
    item({ ml_id: '2', categoria_id: 'E1', nome: 'Multímetro Digital', selo: 'FORA_FAIXA' }),
    item({ ml_id: '3', categoria_id: 'C1', nome: 'Capa para carro', selo: 'OK' }),
  ];
  assert.equal(filtrar(its, cats).length, 3);
  assert.deepEqual(filtrar(its, cats, { grupo: 'Carros' }).map((i) => i.ml_id), ['1', '3']);
  assert.deepEqual(filtrar(its, cats, { selos: new Set(['OK']) }).map((i) => i.ml_id), ['3']);
  assert.deepEqual(filtrar(its, cats, { texto: 'MULTIMETRO' }).map((i) => i.ml_id), ['2']);
  assert.deepEqual(filtrar(its, cats, { grupo: 'Elétrica', texto: 'capa' }), []);
});

test('ordem, contagem, únicos e constantes', () => {
  const its = [item({ ml_id: 'a', selo: 'EVITAR' }), item({ ml_id: 'b', selo: 'OK', posicao: 3 }), item({ ml_id: 'b', selo: 'OK', posicao: 1, categoria_id: 'X' }), item({ ml_id: 'c', selo: 'CONFERIR', dias_em_alta: 4 })];
  assert.deepEqual(ordenar(its).map((i) => i.selo), ['OK', 'OK', 'CONFERIR', 'EVITAR']);
  assert.equal(unicos(its).length, 3);
  assert.equal(unicos(its).find((i) => i.ml_id === 'b').posicao, 1);
  assert.deepEqual(contarSelos(unicos(its)), { OK: 1, CONFERIR: 1, FORA_FAIXA: 0, SEM_PRECO: 0, EVITAR: 1 });
  assert.deepEqual(maisConstantes(its).map((i) => i.ml_id), ['c']);
});

test('chave de acesso no link', () => {
  const k = 'a'.repeat(48);
  assert.equal(extrairChave('#k=' + k), k);
  assert.equal(extrairChave('#x=1&k=' + k.toUpperCase()), k);
  assert.equal(extrairChave('#k=curta'), null);
  assert.equal(extrairChave('#k=<script>'), null);
  assert.equal(extrairChave(''), null);
});

test('dados com formato estranho são recusados', () => {
  assert.equal(dadosValidos(null), false);
  assert.equal(dadosValidos({}), false);
  assert.equal(dadosValidos({ execucoes: [] , ultima: null }), true);
  assert.equal(dadosValidos({ execucoes: [], ultima: { itens: [item({})], categorias: [], buscas: [] } }), true);
  assert.equal(dadosValidos({ execucoes: [], ultima: { itens: [item({ selo: 'XYZ' })], categorias: [], buscas: [] } }), false);
  assert.equal(dadosValidos({ execucoes: [], ultima: { itens: 'x', categorias: [], buscas: [] } }), false);
});

test('datas no fuso de Recife e aviso de dado atrasado', () => {
  assert.equal(dataHora('2026-10-25T15:20:00Z'), '25/10 às 12:20');
  assert.equal(dataHora('lixo'), '—');
  const coleta = '2026-10-25T15:20:00Z';
  assert.equal(dadoAtrasado(coleta, new Date('2026-10-25T20:00:00Z')), false); // mesmo dia
  assert.equal(dadoAtrasado(coleta, new Date('2026-10-26T13:00:00Z')), false); // dia seguinte, 10h: normal
  assert.equal(dadoAtrasado(coleta, new Date('2026-10-26T15:45:00Z')), true);  // dia seguinte, 12h45: atrasou
  assert.equal(dadoAtrasado(coleta, new Date('2026-10-27T11:00:00Z')), true);  // 2 dias
  assert.equal(dadoAtrasado('2026-10-25T02:30:00Z', new Date('2026-10-25T12:00:00Z')), false); // coleta 23h30 de 24/10, agora 9h de 25/10
  assert.equal(dadoAtrasado('2026-10-25T02:30:00Z', new Date('2026-10-25T16:00:00Z')), true);  // mesma coleta, agora 13h de 25/10
});

test('só links https do Mercado Livre', () => {
  assert.equal(linkSeguro('https://www.mercadolivre.com.br/p/MLB1'), 'https://www.mercadolivre.com.br/p/MLB1');
  assert.equal(linkSeguro('https://produto.mercadolibre.com/x'), 'https://produto.mercadolibre.com/x');
  assert.equal(linkSeguro('javascript:alert(1)'), null);
  assert.equal(linkSeguro('http://www.mercadolivre.com.br/p/MLB1'), null);
  assert.equal(linkSeguro('https://mercadolivre.com.br.golpe.com/x'), null);
  assert.equal(linkSeguro(null), null);
});
