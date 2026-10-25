// Acesso ao banco (schema radar) por conexão direta do servidor.
import postgres from "npm:postgres@3.4.5";
import type { Auth, Falha, ItemComBruto, Repo } from "./handlers.ts";
import type { BuscaRadar, CategoriaRadar } from "./lib.ts";
import { criarClienteML } from "./ml.ts";

let _sql: ReturnType<typeof postgres> | null = null;
function sql() {
  if (!_sql) _sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 5 });
  return _sql;
}

function paraAuth(r: Record<string, unknown> | undefined): Auth | null {
  if (!r) return null;
  return {
    ml_user_id: Number(r.ml_user_id),
    access_token: String(r.access_token),
    refresh_token: String(r.refresh_token),
    expires_at: new Date(r.expires_at as string),
    scope: (r.scope as string) ?? null,
  };
}

async function gravarAuth(q: ReturnType<typeof postgres> | postgres.TransactionSql, a: Auth) {
  await q`
    insert into radar.auth (id, ml_user_id, access_token, refresh_token, expires_at, scope, atualizado_em)
    values (1, ${a.ml_user_id}, ${a.access_token}, ${a.refresh_token}, ${a.expires_at}, ${a.scope}, now())
    on conflict (id) do update set
      ml_user_id = excluded.ml_user_id, access_token = excluded.access_token,
      refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
      scope = excluded.scope, atualizado_em = now()`;
}

export const repoPostgres: Repo = {
  async config() {
    const [r] = await sql()`select start_key, cron_key, view_key from radar.config where id = 1`;
    return { start_key: r.start_key, cron_key: r.cron_key, view_key: r.view_key };
  },
  async painel(dias) {
    const [r] = await sql()`select radar.painel(${dias}::int) as p`;
    return r.p;
  },
  async salvarEstado(state, verifier) {
    await sql()`insert into radar.oauth_state (state, code_verifier) values (${state}, ${verifier})`;
  },
  async consumirEstado(state) {
    const [r] = await sql()`
      update radar.oauth_state set usado_em = now()
      where state = ${state} and usado_em is null and criado_em > now() - interval '15 minutes'
      returning code_verifier`;
    return r ? { code_verifier: r.code_verifier } : null;
  },
  async lerAuth() {
    const [r] = await sql()`select * from radar.auth where id = 1`;
    return paraAuth(r);
  },
  async salvarAuth(a) {
    await gravarAuth(sql(), a);
  },
  async comTravaAuth(fn) {
    return await sql().begin(async (tx) => {
      const [r] = await tx`select * from radar.auth where id = 1 for update`;
      return await fn(paraAuth(r), (a) => gravarAuth(tx, a));
    }) as never;
  },
  async categoriasAtivas() {
    const rs = await sql()`select id, nome, grupo from radar.categorias where ativo order by ordem, id`;
    return rs.map((r) => ({ id: r.id, nome: r.nome, grupo: r.grupo })) as CategoriaRadar[];
  },
  async atualizarNomeCategoria(id, nome) {
    await sql()`update radar.categorias set nome = ${nome} where id = ${id}`;
  },
  async novaExecucao() {
    const [r] = await sql()`insert into radar.execucoes default values returning id`;
    return Number(r.id);
  },
  async salvarItens(execucaoId: number, itens: ItemComBruto[]) {
    if (!itens.length) return;
    const linhas = itens.map((i) => ({
      execucao_id: execucaoId, categoria_id: i.categoria_id, posicao: i.posicao, tipo: i.tipo, ml_id: i.ml_id,
      nome: i.nome, preco: i.preco, link: i.link, selo: i.selo, motivo: i.motivo, compra_max: i.compra_max,
      bruto: sql().json(i.bruto as never),
    }));
    await sql()`insert into radar.itens ${sql()(linhas)}`;
  },
  async salvarBuscas(execucaoId: number, buscas: BuscaRadar[]) {
    if (!buscas.length) return;
    const linhas = buscas.map((b) => ({ execucao_id: execucaoId, categoria_id: b.categoria_id, posicao: b.posicao, termo: b.termo, link: b.link }));
    await sql()`insert into radar.buscas ${sql()(linhas)}`;
  },
  async finalizar(execucaoId: number, status, mensagem: string, falhas: Falha[], relatorio: string | null, ocultos = {}) {
    await sql()`
      update radar.execucoes set status = ${status}, mensagem = ${mensagem}, falhas = ${sql().json(falhas as never)},
        relatorio = ${relatorio}, ocultos = ${sql().json(ocultos as never)}, terminado_em = now()
      where id = ${execucaoId}`;
  },
  async limparAntigos() {
    await sql()`delete from radar.execucoes where iniciado_em < now() - interval '60 days'`;
    await sql()`delete from radar.oauth_state where criado_em < now() - interval '1 day'`;
  },
};

export function ambiente() {
  const clientId = Deno.env.get("ML_CLIENT_ID") ?? undefined;
  const clientSecret = Deno.env.get("ML_CLIENT_SECRET") ?? undefined;
  const base = Deno.env.get("SUPABASE_URL")!;
  return {
    clientId,
    redirectUri: `${base}/functions/v1/radar/retorno`,
    ml: clientId && clientSecret ? criarClienteML({ clientId, clientSecret }) : null,
  };
}
