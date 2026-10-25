// Radar ML: uma função com três rotas.
//   GET  /radar/inicio?k=...   → começa a autorização no Mercado Livre
//   GET  /radar/retorno        → o Mercado Livre volta aqui com o código
//   POST /radar/coleta         → coleta diária (chamada pelo agendamento do banco)
//   GET  /radar/dados          → dados para a página do Radar (cabeçalho x-radar-view)
import { iniciarAutorizacao, lerPainel, receberRetorno, rodarColeta } from "./handlers.ts";
import { ambiente, repoPostgres } from "./repo.ts";

Deno.serve(async (req) => {
  const rota = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop();
  try {
    const env = ambiente();
    if (rota === "inicio") return await iniciarAutorizacao(req, { repo: repoPostgres, clientId: env.clientId, redirectUri: env.redirectUri });
    if (rota === "retorno") return await receberRetorno(req, { repo: repoPostgres, ml: env.ml, redirectUri: env.redirectUri, agora: () => new Date() });
    if (rota === "coleta") return await rodarColeta(req, { repo: repoPostgres, ml: env.ml, agora: () => new Date() });
    if (rota === "dados") return await lerPainel(req, { repo: repoPostgres });
    return new Response("Rota não encontrada.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) {
    console.error(e);
    return new Response("Erro interno do Radar ML.", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
});
