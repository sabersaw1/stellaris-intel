-- ============================================================================
-- STELLARIS INTEL — 0006 research engine, regimes, strategies, signals,
--                        paper trading, risk limits and trading mode
--
-- Apply in YOUR Supabase project after 0001. Safe to re-run.
--
-- Access model is unchanged: RLS enabled, privileges to service_role ONLY.
-- No anon or authenticated grants. All reads and writes go through this
-- application's server-side code.
-- ============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------ market regimes
create table if not exists public.market_regimes (
  id            uuid primary key default gen_random_uuid(),
  market_id     uuid not null references public.markets(id) on delete cascade,
  regime        text not null,                -- TREND_UP | TREND_DOWN | SIDEWAYS | HIGH_VOLATILITY | LOW_VOLATILITY | RISK_ON | RISK_OFF | UNKNOWN
  basis         text,                         -- documented rule that fired
  features      jsonb not null default '{}',  -- feature snapshot used
  determined_at timestamptz not null default now()
);
create index if not exists market_regimes_market_idx on public.market_regimes (market_id, determined_at desc);

-- ------------------------------------------------------- strategy versioning
create table if not exists public.strategy_versions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  version      text not null,
  description  text,
  timeframe    text,
  features     jsonb not null default '[]',
  entry_rules  jsonb not null default '[]',
  exit_rules   jsonb not null default '[]',
  risk_rules   jsonb not null default '[]',
  parameters   jsonb not null default '{}',
  status       text not null default 'RESEARCH',  -- RESEARCH | PAPER | RETIRED
  created_at   timestamptz not null default now(),
  unique (name, version)
);

-- ------------------------------------------------- research predictions (obs)
-- One row per automatically generated research observation. Predictions are
-- written BEFORE the outcome is knowable and resolved only from real later
-- market observations. Nothing here is ever back-filled or invented.
create table if not exists public.research_predictions (
  id                 uuid primary key default gen_random_uuid(),
  market_id          uuid not null references public.markets(id) on delete cascade,
  asset              text not null,
  strategy_name      text not null,
  strategy_version   text not null,
  regime             text not null default 'UNKNOWN',
  market_state       jsonb not null default '{}',
  features           jsonb not null default '{}',
  predicted_direction text not null,          -- UP | DOWN | FLAT
  probability        numeric,                 -- 0..1 stated confidence
  horizon_minutes    integer not null,
  reference_price    numeric,
  predicted_at       timestamptz not null default now(),
  resolve_at         timestamptz not null,
  -- resolution (null until the horizon has genuinely passed)
  resolved_at        timestamptz,
  actual_price       numeric,
  actual_return      numeric,
  direction_outcome  text,                    -- CORRECT | INCORRECT | FLAT_CORRECT | UNRESOLVABLE
  prediction_error   numeric,                 -- |probability - realized(0/1)|
  brier_score        numeric,
  resolution_detail  text
);
create index if not exists research_predictions_open_idx on public.research_predictions (resolve_at) where resolved_at is null;
create index if not exists research_predictions_market_idx on public.research_predictions (market_id, predicted_at desc);
create index if not exists research_predictions_resolved_idx on public.research_predictions (resolved_at desc);
-- Dedup: one prediction per market, strategy version and horizon per minute.
create unique index if not exists research_predictions_dedup_idx
  on public.research_predictions (market_id, strategy_version, horizon_minutes, date_trunc('minute', predicted_at));

-- ------------------------------------------------------------------- signals
create table if not exists public.signals (
  id               uuid primary key default gen_random_uuid(),
  market_id        uuid not null references public.markets(id) on delete cascade,
  asset            text not null,
  direction        text not null,             -- LONG | SHORT | FLAT | WATCH | NO SIGNAL
  strategy_name    text not null,
  strategy_version text not null,
  confidence       numeric,
  horizon_minutes  integer,
  entry_logic      text,
  invalidation     text,
  risk_note        text,
  regime           text,
  features         jsonb not null default '{}',
  state            text not null default 'ACTIVE',  -- ACTIVE | EXPIRED | INVALIDATED
  risk_verdict     text,                      -- ACCEPTED | REJECTED
  risk_reason      text,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz
);
create index if not exists signals_active_idx on public.signals (state, created_at desc);

-- ------------------------------------------------------------ paper trading
create table if not exists public.paper_positions (
  id               uuid primary key default gen_random_uuid(),
  signal_id        uuid references public.signals(id) on delete set null,
  market_id        uuid not null references public.markets(id) on delete cascade,
  asset            text not null,
  side             text not null,             -- LONG | SHORT
  quantity         numeric not null,
  entry_price      numeric not null,
  entry_fee        numeric not null default 0,
  slippage_bps     numeric not null default 0,
  stop_price       numeric,
  take_profit      numeric,
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  exit_price       numeric,
  exit_fee         numeric,
  realized_pnl     numeric,
  exit_reason      text,
  strategy_name    text,
  strategy_version text,
  state            text not null default 'OPEN'  -- OPEN | CLOSED
);
create index if not exists paper_positions_state_idx on public.paper_positions (state, opened_at desc);

create table if not exists public.paper_equity (
  id          uuid primary key default gen_random_uuid(),
  equity      numeric not null,
  cash        numeric not null,
  exposure    numeric not null default 0,
  open_count  integer not null default 0,
  drawdown    numeric,
  recorded_at timestamptz not null default now()
);

-- ------------------------------------------------------- risk and trade mode
create table if not exists public.risk_limits (
  id                      text primary key default 'default',
  max_position_usd        numeric not null default 1000,
  max_portfolio_exposure  numeric not null default 5000,
  max_asset_exposure      numeric not null default 2000,
  max_daily_loss          numeric not null default 250,
  max_drawdown_pct        numeric not null default 20,
  max_open_positions      integer not null default 5,
  max_volatility_pct      numeric not null default 25,
  min_liquidity_usd       numeric not null default 250000,
  emergency_stop          boolean not null default false,
  updated_at              timestamptz not null default now()
);
insert into public.risk_limits (id) values ('default') on conflict (id) do nothing;

create table if not exists public.trading_mode (
  id            text primary key default 'default',
  mode          text not null default 'RESEARCH ONLY',  -- RESEARCH ONLY | PAPER TRADING | READY FOR APPROVAL | APPROVED FOR LIVE | LIVE DISABLED | EMERGENCY STOP
  approved_by   text,
  approved_at   timestamptz,
  note          text,
  updated_at    timestamptz not null default now()
);
insert into public.trading_mode (id, mode, note)
values ('default', 'RESEARCH ONLY', 'Live trading is disabled until explicitly approved by the operator.')
on conflict (id) do nothing;

-- ----------------------------------------------------- tracked asset universe
create table if not exists public.asset_universe (
  symbol     text primary key,
  enabled    boolean not null default true,
  added_at   timestamptz not null default now(),
  note       text
);
insert into public.asset_universe (symbol) values
  ('BTC'),('ETH'),('SOL'),('XRP'),('BNB'),('DOGE'),('ADA'),('AVAX'),('LINK'),('DOT')
on conflict (symbol) do nothing;

-- ----------------------------------------------------- calibration summaries
create table if not exists public.research_calibration (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null,             -- OVERALL | CONFIDENCE | ASSET | HORIZON | REGIME
  bucket        text not null,
  predictions   integer not null default 0,
  resolved      integer not null default 0,
  correct       integer not null default 0,
  avg_error     numeric,
  brier         numeric,
  updated_at    timestamptz not null default now(),
  unique (scope, bucket)
);

-- ----------------------------------------------------------- least privilege
do $$
declare t text;
begin
  foreach t in array array[
    'market_regimes','strategy_versions','research_predictions','signals',
    'paper_positions','paper_equity','risk_limits','trading_mode',
    'asset_universe','research_calibration'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
