-- ============================================================================
-- STELLARIS INTEL — 0002 scheduled processing (pg_cron + pg_net)
--
-- Apply AFTER 0001. Safe to re-run: it never creates a duplicate schedule and
-- never duplicates the config table.
--
-- BEFORE RUNNING, replace the two placeholders in the insert below:
--   <STELLARIS_CRON_SECRET>   the same worker secret saved in the application
--   <APP_BASE_URL>            https://project--94daf48b-7ea3-4c4f-b2c0-ab7d59178e5d.lovable.app
--
-- The secret lives only in a service_role-only table with RLS enabled. It is
-- never written to the job definition, never logged, never sent to the browser.
--
-- pg_cron and pg_net must be enabled first:
--   Supabase Dashboard -> Database -> Extensions -> enable "pg_cron" and "pg_net".
-- Every cron/net call below is issued through dynamic SQL, so this file parses
-- and applies cleanly even before those extensions exist.
-- ============================================================================

-- --------------------------------------------------------------- secret store
create table if not exists public.stellaris_config (
  key   text primary key,
  value text not null
);
alter table public.stellaris_config enable row level security;
revoke all on public.stellaris_config from anon, authenticated;
grant all on public.stellaris_config to service_role;

insert into public.stellaris_config (key, value)
values ('cron_secret', '<STELLARIS_CRON_SECRET>'),
       ('app_base_url', '<APP_BASE_URL>')
on conflict (key) do update set value = excluded.value;

-- ------------------------------------------------------------- tick procedure
create or replace function public.stellaris_tick()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  base   text;
  secret text;
begin
  select value into base   from public.stellaris_config where key = 'app_base_url';
  select value into secret from public.stellaris_config where key = 'cron_secret';

  if base is null or secret is null
     or base like '<%' or secret like '<%' then
    raise notice 'STELLARIS: configuration missing, tick skipped';
    return;
  end if;

  if to_regnamespace('net') is null then
    raise notice 'STELLARIS: pg_net not enabled, tick skipped';
    return;
  end if;

  execute
    'select net.http_post('
    || 'url := $1, headers := $2, body := $3, timeout_milliseconds := 25000)'
  using
    base || '/api/public/cron/tick',
    jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || secret
    ),
    jsonb_build_object('trigger', 'pg_cron', 'at', now());
end
$fn$;

revoke all on function public.stellaris_tick() from anon, authenticated;

-- ------------------------------------------------------------- schedule (5m)
do $mig$
begin
  if to_regnamespace('cron') is null then
    raise notice 'STELLARIS: pg_cron is not enabled. Enable it in Dashboard -> Database -> Extensions, then re-run this file.';
    return;
  end if;

  -- remove any previous definition so re-running cannot create duplicates
  if exists (select 1 from cron.job where jobname = 'stellaris-tick') then
    perform cron.unschedule('stellaris-tick');
  end if;

  perform cron.schedule('stellaris-tick', '*/5 * * * *', 'select public.stellaris_tick();');
end
$mig$;

-- Inspect scheduled runs:
--   select jobid, jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select * from public.system_jobs order by started_at desc limit 20;
