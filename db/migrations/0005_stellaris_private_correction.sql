-- ============================================================================
-- STELLARIS INTEL — 0005 corrective: remove public read access
--
-- Run this if you already applied the earlier version of 0004, which granted
-- anonymous SELECT on research tables so the browser could receive Realtime
-- events. That access is no longer used or needed.
--
-- Safe to run even if you never applied it: every statement is idempotent.
-- After this migration, private research and market data is reachable only
-- through the service role (server-side code).
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'markets','market_observations','investigations','evidence','change_events',
    'alert_events','watchlist','research_notes','unknown_questions','conflicts',
    'challenger_reviews','outcomes','calibration','source_health','system_jobs',
    'hypotheses','investigation_evidence','research_jobs','filter_presets'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('drop policy if exists "realtime read" on public.%I', t);
      execute format('revoke all on public.%I from anon', t);
      execute format('revoke all on public.%I from authenticated', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
end $$;
