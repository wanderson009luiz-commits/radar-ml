-- Coleta diária do Radar ML às 12h20 de Recife (15h20 UTC). A chave fica só no banco.
select cron.schedule(
  'radar-ml-coleta',
  '20 15 * * *',
  $$
  select net.http_post(
    url := 'https://vldiylyynkgprpfxyyej.supabase.co/functions/v1/radar/coleta',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-radar-key', (select cron_key from radar.config where id = 1)),
    timeout_milliseconds := 120000
  );
  $$
);
