// Dados de teste baseados na coleta real de 25/10/2026 (amostra reduzida).
const L = (id) => `https://www.mercadolivre.com.br/p/${id}`;
const it = (categoria_id, posicao, ml_id, nome, preco, selo, motivo, compra_max, extra = {}) =>
  ({ categoria_id, posicao, ml_id, nome, preco, link: L(ml_id), selo, motivo, compra_max, dias_em_alta: 1, posicao_anterior: null, ...extra });

const FAIXA_BAIXA = 'abaixo da faixa ideal (R$ 49 a 78,99)';
const FAIXA_ALTA = 'acima da faixa ideal (R$ 49 a 78,99)';
const ELETRICO = 'elétrico: conferir certificação Inmetro/Anatel antes de comprar';
const OK = 'na faixa ideal, sem alerta de certificação';

export const categorias = [
  { id: 'MLB1747', nome: 'Aces. de Carros e Caminhonetes', grupo: 'Carros' },
  { id: 'MLB2227', nome: 'Ferramentas para Veículos', grupo: 'Carros' },
  { id: 'MLB2527', nome: 'Ferramentas Manuais', grupo: 'Ferramentas' },
  { id: 'MLB2526', nome: 'Ferramentas Elétricas', grupo: 'Ferramentas' },
  { id: 'MLB5550', nome: 'Medições e Instrumentação', grupo: 'Elétrica' },
  { id: 'MLB2467', nome: 'Energia', grupo: 'Elétrica' },
];

export const itens = [
  it('MLB1747', 1, 'MLB23873203', 'Estilete Largo Lâmina 18mm Profissional ES 218 Vonder', 9.9, 'FORA_FAIXA', FAIXA_BAIXA, -17.24),
  it('MLB1747', 6, 'MLB52109079', 'Câmera De Re Automotiva 8 Leds Hd Infravermelho Visão Noturna Colorida Universal Veicular Carro Borboleta 2 Em 1 A Prova D\'agua Gurumania', 32.99, 'FORA_FAIXA', `${FAIXA_BAIXA}; eletrônico: conferir certificação Anatel/Inmetro antes de comprar`, 1.18),
  it('MLB1747', 8, 'MLB56330062', '3 Câmera Wifi Automotiva Veicular Carro Com Hd Noturna 1080p Icarbonx', 87.9, 'EVITAR', 'item com rádio/Bluetooth (exige Anatel)', null),
  it('MLB1747', 16, 'MLB64690346', 'Capa Para Carro Forrada Impermeável 100% Proteção Anti Raios Uv, Sol, Chuva', 61.1, 'OK', OK, 24.62),
  it('MLB2227', 1, 'MLB65770538', 'Carregador Inteligente De Bateria Automotiva 12v 6a Bivolt Recupera Baterias', 41.9, 'FORA_FAIXA', `${FAIXA_BAIXA}; ${ELETRICO}`, 9.02),
  it('MLB2227', 4, 'MLB26499306', 'Compressor de Ar Portátil Digital Lumi 150psi Preto P/ Carro Moto Bicicleta', 129.9, 'FORA_FAIXA', `${FAIXA_ALTA}; ${ELETRICO}`, null),
  it('MLB2227', 7, 'MLB29753519', 'Bomba De Encher Pneu De Carro Bike Moto Portátil Digital Ex B&G', 65.95, 'CONFERIR', ELETRICO, 28.89),
  it('MLB2527', 1, 'MLB78796303', 'Kit Jogo De Ferramentas Aço Carbono Titanium 11 Peças', 15.1, 'FORA_FAIXA', FAIXA_BAIXA, -15.26),
  it('MLB2527', 2, 'MLB79915624', 'Kit Ferramentas 46 Peças Jogo Chaves Catraca Soquetes Allen Torx Fenda Phillips Maleta Completa', 32.9, 'FORA_FAIXA', FAIXA_BAIXA, 1.1),
  it('MLB2527', 3, 'MLB62519400', 'Kit Maçarico Portátil Automático Liderança Ferro E Aço para 1300°C com 4 Refis de Gás Butano', 58.5, 'EVITAR', 'inflamável ou gás (envio restrito)', null),
  it('MLB2527', 5, 'MLB65763694', 'Jogo De Chave Boca E Estrela Combinada 12 Pçs Aço 6-22 Mm Cromada Profissional', 58, 'OK', OK, 21.89),
  it('MLB2527', 7, 'MLB67561388', 'Kit Jogo De Ferramentas 58 Peças Completo Profissional Soquete 46 Peças', 78.9, 'OK', OK, 40.28),
  it('MLB2527', 11, 'MLB55824605', 'Pistola Fixação Finca Pino Ação Direta Pregos Epi Maleta Pinador Pregos Concreto', 59.99, 'OK', OK, 23.64),
  it('MLB2527', 14, 'MLB43199356', '4x Cinta Catraca 800kg Reforçada Amarração Carga 4,6m Gancho', 72.99, 'OK', OK, 35.08),
  it('MLB2526', 1, 'MLB30144703', 'Parafusadeira Furadeira De Impacto The Black Tools Profissional TB-21PX 2 Baterias Com Maleta', 159.9, 'FORA_FAIXA', `${FAIXA_ALTA}; ${ELETRICO}`, null),
  it('MLB2526', 6, 'MLB24076624', 'Parafusadeira Furadeira The Black Tools TB12A 3/8 a Bateria Cor Amarelo', 74.9, 'CONFERIR', ELETRICO, 36.76),
  it('MLB5550', 2, 'MLB24669291', 'Kit Eletrica Chave Teste Digital + Caneta Detectora Tensão', 24.9, 'FORA_FAIXA', `${FAIXA_BAIXA}; ${ELETRICO}`, -5.94),
  it('MLB5550', 3, 'MLB71650391', 'Multímetro Digital Profissional Lcd Iluminado Portátil Multifunções Ac Dc Bip Com Bateria', 29.93, 'FORA_FAIXA', `${FAIXA_BAIXA}; ${ELETRICO}`, -1.51),
  it('MLB2467', 1, 'MLB48482467', 'Régua Extensão Elétrica 6 Tomadas Filtro Linha 10a Cabo 2 Metros', 28.89, 'FORA_FAIXA', `${FAIXA_BAIXA}; ${ELETRICO}`, -2.43),
  it('MLB2467', 3, 'MLB68929894', 'Extensão Elétrica 30 Metros Reforçada 3 Tomadas Cabo Resistente 10a 20a Bivolt', 45.48, 'FORA_FAIXA', `${FAIXA_BAIXA}; ${ELETRICO}`, 12.17),
];

export const buscas = [
  ['MLB1747', 'sensor estacionamento'], ['MLB1747', 'capa pra carro'], ['MLB1747', 'camera veicular'], ['MLB1747', 'kit macarrao pneu'],
  ['MLB2227', 'mini compressor ar'], ['MLB2227', 'calibrador pneu portatil'], ['MLB2227', 'compressor portatil pneu'],
  ['MLB2527', 'chave inglesa ajustavel'], ['MLB2527', 'chave torx'], ['MLB2527', 'kit alicate'],
  ['MLB2526', 'furadeira bateria'], ['MLB2526', 'chave impacto'],
  ['MLB5550', 'termometro digital'], ['MLB5550', 'alicate amperimetro minipa'],
  ['MLB2467', 'extensor tomada'], ['MLB2467', 'conduite'],
].map(([categoria_id, termo], i, arr) => ({ categoria_id, termo, posicao: arr.slice(0, i).filter((x) => x[0] === categoria_id).length + 1, link: null }));

export const ocultos = { MLB1747: 15, MLB2227: 5, MLB2527: 3, MLB2526: 5, MLB5550: 6, MLB2467: 4 };

export function painel({ quando = '2026-10-25T15:20:01Z', historico = false, falhas = [], status = 'ok' } = {}) {
  const its = itens.map((i) => {
    if (!historico) return { ...i };
    // segundo dia: posições de ontem e dias em alta
    const ontem = { MLB65763694: 9, MLB64690346: 16, MLB29753519: 3, MLB55824605: 11, MLB24076624: 6, MLB23873203: 1 };
    const dias = { MLB65763694: 2, MLB64690346: 2, MLB29753519: 2, MLB23873203: 2, MLB55824605: 2, MLB24076624: 2 };
    return { ...i, posicao_anterior: ontem[i.ml_id] ?? null, dias_em_alta: dias[i.ml_id] ?? 1 };
  });
  const execucoes = [
    { id: 6, iniciado_em: quando, status, mensagem: '114 itens, 90 buscas, 0 falha(s)', ok: 8, conferir: 9, total: 114 },
    ...(historico ? [{ id: 5, iniciado_em: '2026-10-24T15:20:02Z', status: 'parcial', mensagem: '110 itens, 90 buscas, 1 falha(s)', ok: 7, conferir: 9, total: 110 }] : []),
    { id: 4, iniciado_em: '2026-10-23T15:20:00Z', status: 'erro', mensagem: 'A autorização do Mercado Livre venceu ou foi revogada: abra o link de autorização de novo.', ok: 0, conferir: 0, total: 0 },
  ];
  return {
    gerado_em: quando,
    tem_anterior: historico,
    data_anterior: historico ? '2026-10-24' : null,
    execucoes,
    ultima: { id: 6, iniciado_em: quando, status, falhas, ocultos, categorias, itens: its, buscas },
  };
}

export const CHAVE = 'ab'.repeat(24);
