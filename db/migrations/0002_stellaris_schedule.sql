-- ============================================================================
-- STELLARIS INTEL — 0002 scheduled processing (pg_cron + pg_net)
--
-- Apply AFTER 0001, in your Supabase SQL Editor.
--
-- Before running, replace the two placeholders below:
--   <STELLARIS_CRON_SECRET>  the same worker secret saved in the application
--   <APP_BASE_URL>           https://project--94daf48b-7ea3-4c4f-b2c0-ab7d59178e5d.lovable.app
--                            (use the -dev suffix variant to drive the preview build)
--
-- The secret is stored in Postgres so pg_cron can send it; it is sent as a
-- bearer token over HTTPS to the signed endpoint /api/public/cron/tick.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Keep the secret out of the job definition and out of logs.
create table if not exists public.stellaris_config (
  key   text primary key,
  value text not null
);
grant all on public.stellaris_config to service_role;
alter table public.stellaris_config enable row level security;
revoke all on public.stellaris_config from anon, authenticated;

insert into public.stellaris_config (key, value)
values ('cron_secret', '<STELLARIS_CRON_SECRET>'),
       ('app_base_url', '<APP_BASE_URL>')
on conflict (key) do update set value = excluded.value;

create or replace function public.stellaris_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  base   text;
  secret text;
begin
  select value into base from public.stellaris_config where key = 'app_base_url';
  select value into secret from public.stellaris_config where key = 'cron_secret';
  if base is null or secret is null then
    raise notice 'STELLARIS: configuration missing, tick skipped';
    return;
  end if;

  perform net.http_post(
    url     := base || '/api/public/cron/tick',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'authorization', 'Bearer ' || secret
               ),
    body    := jsonb_build_object('trigger', 'pg_cron', 'at', now()),
    timeout_milliseconds := 25000
  );
end $$;

-- Every 5 minutes. Adjust the expression to your rate-limit budget.
select cron.unschedule('stellaris-tick')
where exists (select 1 from cron.job where jobname = 'stellaris-tick');

select cron.schedule('stellaris-tick', '*/5 * * * *', $$select public.stellaris_tick();$$);

-- Inspect scheduled runs:
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select * from public.system_jobs order by started_at desc limit 20;
