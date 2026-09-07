-- ============================================================================
-- STELLARIS INTEL — 0003 operator state (notes, alerts, saved filters)
--
-- Apply in YOUR Supabase project: SQL Editor -> paste -> Run.
-- Safe to re-run. Same access model as 0001: RLS enabled, service_role only;
-- the browser never talks to these tables directly.
-- ============================================================================

create table if not exists public.research_notes (
  id         uuid primary key default gen_random_uuid(),
  market_id  uuid not null references public.markets(id) on delete cascade,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  unique (market_id)
);

create table if not exists public.alert_events (
  id           uuid primary key default gen_random_uuid(),
  market_id    uuid references public.markets(id) on delete cascade,
  market_key   text not null,
  symbol       text,
  chain_id     text,
  dex_id       text,
  kind         text not null,
  severity     text not null,
  message      text not null,
  confidence   numeric,
  acknowledged boolean not null default false,
  detected_at  timestamptz not null default now()
);
create index if not exists alert_events_time_idx on public.alert_events (detected_at desc);
create index if not exists alert_events_dedupe_idx on public.alert_events (market_key, kind, detected_at desc);

create table if not exists public.filter_presets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  definition text not null,
  saved_at   timestamptz not null default now()
);

-- watchlist grouping used by the WATCHLIST surface
alter table public.watchlist add column if not exists group_name text not null default 'Default';
alter table public.watchlist add column if not exists market_key text;

do $$
declare
  t text;
  tables text[] := array['research_notes','alert_events','filter_presets'];
begin
  foreach t in array tables loop
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
