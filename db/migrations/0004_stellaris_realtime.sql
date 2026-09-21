-- ============================================================================
-- STELLARIS INTEL — 0004 change streaming (PRIVATE)
--
-- Apply AFTER 0001 (and 0002 if you use pg_cron).
--
-- PRIVACY DECISION (revised): research and market tables stay PRIVATE.
-- No anonymous or authenticated read grants are created here. The browser
-- never reads the database directly; every read goes through this
-- application's server-side code using the service role key.
--
-- Consequence, stated honestly: browser Realtime cannot receive change events
-- for private tables, so the interface uses fast server-side revalidation
-- (10-15s) for live data instead. Background processing stays on its own
-- schedule and is never what refreshes the UI.
--
-- This migration only sets full row images and publication membership, which
-- are useful for server-side listeners, logical replication and future
-- authenticated (RLS-scoped) streaming. It grants nothing.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'markets','market_observations','investigations','evidence','change_events',
    'alert_events','watchlist','research_notes','unknown_questions','conflicts',
    'challenger_reviews','outcomes','calibration','source_health','system_jobs'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('alter table public.%I replica identity full', t);

      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;

      -- Least privilege: make sure no public read access exists on these tables.
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('drop policy if exists "realtime read" on public.%I', t);
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;
