-- STELLARIS INTEL — migration 0004
-- Enable Realtime change streaming for the tables the interface watches.
--
-- Apply in your Supabase SQL Editor AFTER 0001 (and 0002 if you use pg_cron).
-- Realtime lets the app update the moment a row is written, so the five-minute
-- scheduled cycle is only a background safety net and never the UI refresh rate.

-- 1. Full row images so change events carry previous values.
alter table public.markets              replica identity full;
alter table public.market_observations  replica identity full;
alter table public.investigations       replica identity full;
alter table public.evidence             replica identity full;
alter table public.change_events        replica identity full;
alter table public.alert_events         replica identity full;
alter table public.watchlist            replica identity full;
alter table public.research_notes       replica identity full;
alter table public.unknown_questions    replica identity full;
alter table public.conflicts            replica identity full;
alter table public.challenger_reviews   replica identity full;
alter table public.outcomes             replica identity full;
alter table public.calibration          replica identity full;
alter table public.source_health        replica identity full;
alter table public.system_jobs          replica identity full;

-- 2. Add each table to the Realtime publication (idempotent).
do $$
declare t text;
begin
  foreach t in array array[
    'markets','market_observations','investigations','evidence','change_events',
    'alert_events','watchlist','research_notes','unknown_questions','conflicts',
    'challenger_reviews','outcomes','calibration','source_health','system_jobs'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 3. Realtime delivers change events to the anon role only for rows a SELECT
--    policy allows. These tables hold no personal data and are the operator's
--    own research records, so grant read-only visibility for live updates.
--    Writes remain service-role only (migration 0001); nothing here allows
--    inserts, updates or deletes from the browser.
do $$
declare t text;
begin
  foreach t in array array[
    'markets','market_observations','investigations','evidence','change_events',
    'alert_events','watchlist','research_notes','unknown_questions','conflicts',
    'challenger_reviews','outcomes','calibration','source_health','system_jobs'
  ]
  loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('drop policy if exists "realtime read" on public.%I', t);
    execute format('create policy "realtime read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;
