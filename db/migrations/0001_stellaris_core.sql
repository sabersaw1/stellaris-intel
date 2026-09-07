-- ============================================================================
-- STELLARIS INTEL — 0001 core intelligence memory
--
-- Apply in YOUR Supabase project: SQL Editor -> paste -> Run
-- (or `supabase db execute --file db/migrations/0001_stellaris_core.sql`).
-- Safe to re-run: every object uses IF NOT EXISTS / exception guards.
--
-- Access model: the browser never talks to the database. All reads and writes
-- go through this application's server-side code using the service role key.
-- Every table therefore has RLS ENABLED with NO anon/authenticated policies
-- (deny by default) and privileges granted to service_role only.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enumerations
do $$ begin
  create type stellaris_research_state as enum (
    'NEW','TRIAGING','INVESTIGATING','MONITORING','LOW-CONCERN',
    'ELEVATED RISK','HIGH-RISK','CONFLICTING','INSUFFICIENT DATA','RESOLVED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type stellaris_evidence_grade as enum
    ('VERIFIED','OBSERVED','INFERRED','SUSPECTED','UNKNOWN','CONFLICTING','INSUFFICIENT DATA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stellaris_evidence_layer as enum
    ('MARKET','HOLDERS','DEVELOPER','CONTRACT','SOCIAL','HISTORICAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stellaris_job_state as enum ('QUEUED','RUNNING','DONE','FAILED','SKIPPED');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------- markets
create table if not exists public.markets (
  id              uuid primary key default gen_random_uuid(),
  chain_id        text not null,
  pair_address    text not null,
  base_symbol     text,
  base_name       text,
  base_address    text,
  quote_symbol    text,
  dex_id          text,
  pair_created_at timestamptz,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (chain_id, pair_address)
);
create index if not exists markets_last_seen_idx on public.markets (last_seen_at desc);
create index if not exists markets_symbol_idx on public.markets (base_symbol);

-- ---------------------------------------------------------- market observations
-- One row per ingested snapshot; deduplicated on (market, observed_at, source).
create table if not exists public.market_observations (
  id               bigserial primary key,
  market_id        uuid not null references public.markets(id) on delete cascade,
  observed_at      timestamptz not null default now(),
  source           text not null default 'dexscreener',
  price_usd        numeric,
  liquidity_usd    numeric,
  volume_24h_usd   numeric,
  volume_5m_usd    numeric,
  price_change_5m  numeric,
  price_change_1h  numeric,
  price_change_24h numeric,
  txns_5m_buys     integer,
  txns_5m_sells    integer,
  fdv_usd          numeric,
  raw              jsonb,
  unique (market_id, observed_at, source)
);
create index if not exists observations_market_time_idx
  on public.market_observations (market_id, observed_at desc);

-- -------------------------------------------------------------------- evidence
create table if not exists public.evidence (
  id          uuid primary key default gen_random_uuid(),
  market_id   uuid references public.markets(id) on delete cascade,
  layer       stellaris_evidence_layer not null,
  grade       stellaris_evidence_grade not null,
  source      text not null,
  label       text not null,
  value       text,
  detail      text,
  observed_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists evidence_market_idx on public.evidence (market_id, observed_at desc);
create index if not exists evidence_layer_idx on public.evidence (layer);

-- -------------------------------------------------------------- investigations
create table if not exists public.investigations (
  id               uuid primary key default gen_random_uuid(),
  market_id        uuid not null references public.markets(id) on delete cascade,
  state            stellaris_research_state not null default 'NEW',
  priority         numeric not null default 0,
  headline         text,
  plain_english    text,
  risk_signal      numeric,
  evidence_quality numeric,
  source_agreement text,
  data_quality     text,
  model_version    text,
  opened_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  resolved_at      timestamptz
);
create index if not exists investigations_state_idx on public.investigations (state, priority desc);
create index if not exists investigations_market_idx on public.investigations (market_id);

create table if not exists public.investigation_evidence (
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  evidence_id      uuid not null references public.evidence(id) on delete cascade,
  primary key (investigation_id, evidence_id)
);

-- ------------------------------------------------------- unknowns and conflicts
create table if not exists public.unknown_questions (
  id               uuid primary key default gen_random_uuid(),
  market_id        uuid references public.markets(id) on delete cascade,
  investigation_id uuid references public.investigations(id) on delete cascade,
  question         text not null,
  blocked_by       text,
  answer           text,
  answered_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists public.conflicts (
  id               uuid primary key default gen_random_uuid(),
  market_id        uuid references public.markets(id) on delete cascade,
  investigation_id uuid references public.investigations(id) on delete cascade,
  topic            text not null,
  side_a           text not null,
  side_b           text not null,
  resolution       text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

-- ------------------------------------------------ hypotheses and challenger log
create table if not exists public.hypotheses (
  id               uuid primary key default gen_random_uuid(),
  market_id        uuid references public.markets(id) on delete cascade,
  investigation_id uuid references public.investigations(id) on delete cascade,
  statement        text not null,
  supports         jsonb not null default '[]'::jsonb,
  contradicts      jsonb not null default '[]'::jsonb,
  status           text not null default 'OPEN',
  created_at       timestamptz not null default now(),
  closed_at        timestamptz
);

create table if not exists public.challenger_reviews (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid references public.investigations(id) on delete cascade,
  outcome          text not null,
  question         text,
  checks           jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------------- watchlist
create table if not exists public.watchlist (
  id         uuid primary key default gen_random_uuid(),
  market_id  uuid not null references public.markets(id) on delete cascade,
  note       text,
  added_at   timestamptz not null default now(),
  removed_at timestamptz,
  unique (market_id)
);

-- --------------------------------------------------------------- change events
create table if not exists public.change_events (
  id           bigserial primary key,
  market_id    uuid not null references public.markets(id) on delete cascade,
  field        text not null,
  before_value text,
  after_value  text,
  magnitude    numeric,
  detail       text,
  detected_at  timestamptz not null default now()
);
create index if not exists change_events_time_idx on public.change_events (detected_at desc);

-- --------------------------------------------------------------- research jobs
create table if not exists public.research_jobs (
  id          uuid primary key default gen_random_uuid(),
  market_id   uuid references public.markets(id) on delete cascade,
  kind        text not null,
  state       stellaris_job_state not null default 'QUEUED',
  priority    numeric not null default 0,
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);
create index if not exists research_jobs_queue_idx
  on public.research_jobs (state, priority desc, created_at);

-- ----------------------------------------------------- outcomes and calibration
create table if not exists public.outcomes (
  id               uuid primary key default gen_random_uuid(),
  investigation_id uuid references public.investigations(id) on delete cascade,
  market_id        uuid references public.markets(id) on delete cascade,
  assessed_state   stellaris_research_state,
  observed_result  text not null,
  window_hours     integer,
  detail           text,
  measured_at      timestamptz not null default now()
);

create table if not exists public.calibration (
  id            uuid primary key default gen_random_uuid(),
  model_version text not null,
  bucket        text not null,
  cases         integer not null default 0,
  correct       integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (model_version, bucket)
);

-- --------------------------------------------------- source and system health
create table if not exists public.source_health (
  id              uuid primary key default gen_random_uuid(),
  source          text not null unique,
  state           text not null,
  configured      boolean not null default false,
  last_ok_at      timestamptz,
  last_error      text,
  last_latency_ms integer,
  requests_1h     integer not null default 0,
  updated_at      timestamptz not null default now()
);

create table if not exists public.system_jobs (
  id          bigserial primary key,
  job         text not null,
  state       stellaris_job_state not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  processed   integer,
  detail      text,
  error       text
);
create index if not exists system_jobs_time_idx on public.system_jobs (started_at desc);

-- ------------------------------------------------------------- privileges + RLS
do $$
declare
  t text;
  tables text[] := array[
    'markets','market_observations','evidence','investigations','investigation_evidence',
    'unknown_questions','conflicts','hypotheses','challenger_reviews','watchlist',
    'change_events','research_jobs','outcomes','calibration','source_health','system_jobs'
  ];
begin
  foreach t in array tables loop
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

grant usage on schema public to service_role;
grant all on all sequences in schema public to service_role;
