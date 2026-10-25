-- Página do Radar: chave de leitura, ocultos por categoria e a consulta do painel.

alter table radar.config add column if not exists view_key text not null default encode(extensions.gen_random_bytes(24), 'hex');
alter table radar.execucoes add column if not exists ocultos jsonb not null default '{}'::jsonb;

-- Tudo que a página precisa numa chamada só (somente leitura).
create or replace function radar.painel(p_dias int default 14)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with boas as (
    select id, iniciado_em, (iniciado_em at time zone 'America/Recife')::date as d
    from radar.execucoes
    where status in ('ok', 'parcial') and relatorio is not null
    order by id desc
    limit 60
  ),
  ultima as (select * from boas order by id desc limit 1),
  por_dia as (select distinct on (d) id, d from boas order by d desc, id desc),
  anterior as (select id, d from por_dia where d < (select d from ultima) order by d desc limit 1),
  ult7 as (select id, d from por_dia order by d desc limit 7),
  itens as (
    select i.*,
      (select count(distinct u.d) from radar.itens x join ult7 u on u.id = x.execucao_id
        where x.ml_id = i.ml_id and x.categoria_id = i.categoria_id) as dias_em_alta,
      (select x.posicao from radar.itens x
        where x.execucao_id = (select id from anterior) and x.ml_id = i.ml_id and x.categoria_id = i.categoria_id
        limit 1) as posicao_anterior
    from radar.itens i
    where i.execucao_id = (select id from ultima)
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'tem_anterior', exists (select 1 from anterior),
    'data_anterior', (select d from anterior),
    'execucoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'iniciado_em', e.iniciado_em, 'status', e.status, 'mensagem', e.mensagem,
        'ok', (select count(*) from radar.itens x where x.execucao_id = e.id and x.selo = 'OK'),
        'conferir', (select count(*) from radar.itens x where x.execucao_id = e.id and x.selo = 'CONFERIR'),
        'total', (select count(*) from radar.itens x where x.execucao_id = e.id)
      ) order by e.id desc)
      from (select * from radar.execucoes order by id desc limit greatest(1, least(p_dias, 60))) e
    ), '[]'::jsonb),
    'ultima', (
      select jsonb_build_object(
        'id', u.id, 'iniciado_em', e.iniciado_em, 'status', e.status, 'falhas', e.falhas, 'ocultos', e.ocultos,
        'categorias', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'grupo', c.grupo) order by c.ordem, c.id)
                                from radar.categorias c where c.ativo), '[]'::jsonb),
        'itens', coalesce((select jsonb_agg(jsonb_build_object(
                    'categoria_id', i.categoria_id, 'posicao', i.posicao, 'ml_id', i.ml_id, 'nome', i.nome,
                    'preco', i.preco, 'link', i.link, 'selo', i.selo, 'motivo', i.motivo, 'compra_max', i.compra_max,
                    'dias_em_alta', i.dias_em_alta, 'posicao_anterior', i.posicao_anterior
                  ) order by i.categoria_id, i.posicao) from itens i), '[]'::jsonb),
        'buscas', coalesce((select jsonb_agg(jsonb_build_object('categoria_id', b.categoria_id, 'posicao', b.posicao, 'termo', b.termo, 'link', b.link)
                    order by b.categoria_id, b.posicao) from radar.buscas b where b.execucao_id = u.id), '[]'::jsonb)
      )
      from ultima u join radar.execucoes e on e.id = u.id
    )
  );
$$;

revoke all on function radar.painel(int) from public, anon, authenticated;
