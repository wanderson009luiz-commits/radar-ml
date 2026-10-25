-- Radar Mercado Livre: área separada do banco (schema "radar").
-- Não toca em nenhuma tabela do Aporte+. Nada aqui é acessível pela API pública:
-- só as funções do radar (conexão direta do servidor) leem e escrevem.

create schema if not exists radar;
revoke all on schema radar from public, anon, authenticated;

-- Configuração única (1 linha): chaves internas geradas no próprio banco.
create table radar.config (
  id int primary key default 1 check (id = 1),
  start_key text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  cron_key  text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  criado_em timestamptz not null default now()
);
insert into radar.config default values;

-- Token do Mercado Livre (1 linha). O refresh token é de uso único: sempre sobrescrever.
create table radar.auth (
  id int primary key default 1 check (id = 1),
  ml_user_id bigint not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  atualizado_em timestamptz not null default now()
);

-- Estado temporário do login (protege contra pedidos forjados e guarda o PKCE).
create table radar.oauth_state (
  state text primary key,
  code_verifier text not null,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);

create table radar.categorias (
  id text primary key,
  nome text,
  grupo text not null,
  ordem int not null default 0,
  ativo boolean not null default true
);
insert into radar.categorias (id, nome, grupo, ordem) values
  ('MLB1747',   'Acessórios para Veículos', 'Carros',      1),
  ('MLB263532', 'Ferramentas',              'Ferramentas', 2),
  ('MLB2527',   'Ferramentas manuais',      'Ferramentas', 3);

create table radar.execucoes (
  id bigserial primary key,
  iniciado_em timestamptz not null default now(),
  terminado_em timestamptz,
  status text not null default 'rodando' check (status in ('rodando', 'ok', 'parcial', 'erro')),
  mensagem text,
  falhas jsonb not null default '[]'::jsonb,
  relatorio text
);

create table radar.itens (
  id bigserial primary key,
  execucao_id bigint not null references radar.execucoes(id) on delete cascade,
  categoria_id text not null,
  posicao int,
  tipo text,
  ml_id text,
  nome text,
  preco numeric(12, 2),
  link text,
  selo text check (selo in ('OK', 'CONFERIR', 'EVITAR', 'FORA_FAIXA', 'SEM_PRECO')),
  motivo text,
  compra_max numeric(12, 2),
  bruto jsonb
);
create index on radar.itens (execucao_id);

create table radar.buscas (
  id bigserial primary key,
  execucao_id bigint not null references radar.execucoes(id) on delete cascade,
  categoria_id text,
  posicao int,
  termo text not null,
  link text
);
create index on radar.buscas (execucao_id);

-- RLS ligado em tudo e nenhuma política: a API pública não enxerga nada.
alter table radar.config      enable row level security;
alter table radar.auth        enable row level security;
alter table radar.oauth_state enable row level security;
alter table radar.categorias  enable row level security;
alter table radar.execucoes   enable row level security;
alter table radar.itens       enable row level security;
alter table radar.buscas      enable row level security;
revoke all on all tables    in schema radar from public, anon, authenticated;
revoke all on all sequences in schema radar from public, anon, authenticated;
