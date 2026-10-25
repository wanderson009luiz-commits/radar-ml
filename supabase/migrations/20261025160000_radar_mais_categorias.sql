-- Mais categorias de carro e elétrica (a API só detalha produtos de catálogo; mais categorias = mais produtos).
insert into radar.categorias (id, nome, grupo, ordem) values
  ('MLB2227',   'Ferramentas para Veículos',          'Carros',      2),
  ('MLB188063', 'Limpeza Automotiva',                 'Carros',      3),
  ('MLB22693',  'Peças de Carros e Caminhonetes',     'Carros',      4),
  ('MLB2526',   'Ferramentas Elétricas',              'Ferramentas', 7),
  ('MLB5550',   'Medições e Instrumentação',          'Elétrica',    8),
  ('MLB2467',   'Energia',                            'Elétrica',    9)
on conflict (id) do nothing;
update radar.categorias set ordem = 5 where id = 'MLB263532';
update radar.categorias set ordem = 6 where id = 'MLB2527';
