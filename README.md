# Radar ML

Os mais vendidos do Mercado Livre em **carro, ferramentas e elétrica**, todo dia às 12h20 (Recife), com selo (OK, Conferir, Fora da faixa, Evitar), preço máximo de compra e simulador de lucro.

**Página:** https://wanderson009luiz-commits.github.io/radar-ml/ — abrir pelo link de acesso (`#k=…`) uma vez; depois ela lembra no aparelho. No celular: menu do navegador → "Adicionar à tela inicial".

## Como funciona
- **Coleta** (`supabase/functions/_shared/` → função `radar` no Supabase do Aporte+, área separada `radar`): API oficial do Mercado Livre, todo dia 12h20 (pg_cron). A API só detalha produtos de catálogo; anúncios próprios de outros vendedores voltam 403 e aparecem só como contagem.
- **E-mail** das 13h: tarefa agendada do Claude lê `radar.execucoes` e envia pelo Gmail.
- **Página** (`index.html`, `css/`, `js/`): lê `GET /radar/dados` com o cabeçalho `x-radar-view` (chave de leitura, que só lê). Sem chaves secretas no site.

## Rotas da função `radar`
`/inicio?k=` (autorizar no ML) · `/retorno` (volta do ML) · `/coleta` (POST, `x-radar-key`) · `/dados` (GET, `x-radar-view`).
Segredos no painel do Supabase: `ML_CLIENT_ID`, `ML_CLIENT_SECRET`. Banco: `supabase/migrations/`.

## Testes
- `npm test` — regras da página (node --test).
- `npm run test:functions` — servidor (Deno, sem rede, Mercado Livre e banco falsos).
- `node tests/e2e/run.mjs e2e-prints` — navegador (Playwright) em celular, 320px e desktop, com API falsa.
O GitHub Actions só publica se tudo passar. `./build.sh` copia `_shared/` para `supabase/functions/radar/` antes de publicar a função.
