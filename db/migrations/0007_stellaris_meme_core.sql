-- ============================================================================
-- STELLARIS — 0007 meme-coin intelligence core
--
-- Apply in YOUR Supabase project: SQL Editor -> paste -> Run. Safe to re-run.
--
-- Access model is unchanged from 0001: every table has RLS enabled, NO anon or
-- authenticated privileges, and service_role only. The browser never talks to
-- the database; all reads and writes go through this application's server code.
--
-- Provenance rule enforced by design: every observation row carries source,
-- observed_at and received_at. Missing values stay NULL — never zero.
-- ============================================================================

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------- tokens
-- Canonical identity is chain + mint/contract address. Symbols and names are
-- never used as identity because meme tickers collide constantly.
create table if not exists public.tokens (
  id                uuid primary key default gen_random_uuid(),
  chain_id          text not null,
  address           text not null,
  symbol            text,
  name              text,
  decimals          integer,
  creator_address   text,
  created_at_chain  timestamptz,                 -- token creation per the source
  origin            text,                        -- PUMPFUN | DEX | MANUAL | UNKNOWN
  meme_verdict      text not null default 'UNKNOWN',  -- MEME | NOT MEME | UNKNOWN
  meme_reasons      jsonb not null default '[]',
  lifecycle_stage   text not null default 'DISCOVERED',
  live_state        text not null default 'NEW',  -- NEW | ACCELERATING | WATCH | STABLE | DETERIORATING | HIGH RISK | RESEARCHING | UNAVAILABLE
  image_url         text,
  websites          jsonb not null default '[]',
  socials           jsonb not null default '[]',
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  unique (chain_id, address)
);
create index if not exists tokens_meme_idx on public.tokens (meme_verdict, last_seen_at desc);
create index if not exists tokens_symbol_idx on public.tokens (symbol);
create index if not exists tokens_stage_idx on public.tokens (lifecycle_stage, last_seen_at desc);

create table if not exists public.token_snapshots (
  id             bigserial primary key,
  token_id       uuid not null references public.tokens(id) on delete cascade,
  source         text not null,
  observed_at    timestamptz not null,
  received_at    timestamptz not null default now(),
  price_usd      numeric,
  market_cap_usd numeric,
  fdv_usd        numeric,
  liquidity_usd  numeric,
  volume_5m_usd  numeric,
  volume_1h_usd  numeric,
  volume_24h_usd numeric,
  txns_5m_buys   integer,
  txns_5m_sells  integer,
  txns_24h_buys  integer,
  txns_24h_sells integer,
  holders        integer,
  freshness_ms   integer,
  data_quality   text,
  confidence     text,
  raw            jsonb,
  unique (token_id, source, observed_at)
);
create index if not exists token_snapshots_token_idx on public.token_snapshots (token_id, observed_at desc);

create table if not exists public.token_lifecycle (
  id          bigserial primary key,
  token_id    uuid not null references public.tokens(id) on delete cascade,
  stage       text not null,   -- CREATED | DISCOVERED | EARLY | ACCELERATING | MOMENTUM | PEAK | DECAY | INACTIVE | GRADUATED | MIGRATED
  basis       text,
  source      text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (token_id, stage, observed_at)
);

-- ---------------------------------------------------------------------- pairs
create table if not exists public.token_pairs (
  id              uuid primary key default gen_random_uuid(),
  token_id        uuid not null references public.tokens(id) on delete cascade,
  chain_id        text not null,
  pair_address    text not null,
  dex_id          text,
  quote_symbol    text,
  url             text,
  pair_created_at timestamptz,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (chain_id, pair_address)
);
create index if not exists token_pairs_token_idx on public.token_pairs (token_id);

create table if not exists public.pair_snapshots (
  id             bigserial primary key,
  pair_id        uuid not null references public.token_pairs(id) on delete cascade,
  source         text not null,
  observed_at    timestamptz not null,
  received_at    timestamptz not null default now(),
  price_usd      numeric,
  liquidity_usd  numeric,
  volume_24h_usd numeric,
  volume_5m_usd  numeric,
  txns_5m_buys   integer,
  txns_5m_sells  integer,
  raw            jsonb,
  unique (pair_id, source, observed_at)
);
create index if not exists pair_snapshots_pair_idx on public.pair_snapshots (pair_id, observed_at desc);

-- --------------------------------------------------------------------- events
create table if not exists public.stellaris_events (
  id           bigserial primary key,
  dedup_key    text not null unique,
  kind         text not null,
  entity_kind  text not null,
  entity_id    text not null,
  token_id     uuid references public.tokens(id) on delete cascade,
  source       text not null,
  field        text,
  before_value numeric,
  after_value  numeric,
  change_pct   numeric,
  confidence   text not null default 'UNKNOWN',
  severity     text not null default 'INFO',
  summary      text not null,
  reference    jsonb,
  observed_at  timestamptz,
  received_at  timestamptz not null default now()
);
create index if not exists stellaris_events_time_idx on public.stellaris_events (received_at desc);
create index if not exists stellaris_events_entity_idx on public.stellaris_events (entity_id, received_at desc);
create index if not exists stellaris_events_kind_idx on public.stellaris_events (kind, received_at desc);
create index if not exists stellaris_events_token_idx on public.stellaris_events (token_id, received_at desc);

-- -------------------------------------------------------------------- traders
create table if not exists public.traders (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  origin       text not null,          -- FOMO | X | ONCHAIN | USER
  note         text,
  monitored    boolean not null default false,
  confidence   text not null default 'UNKNOWN',  -- VERIFIED | HIGH CONFIDENCE | POSSIBLE | UNKNOWN
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.trader_accounts (
  id         uuid primary key default gen_random_uuid(),
  trader_id  uuid not null references public.traders(id) on delete cascade,
  kind       text not null,            -- X | FOMO | WALLET | OTHER
  handle     text,
  identifier text not null,
  confidence text not null default 'UNKNOWN',
  evidence   jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (kind, identifier)
);

-- -------------------------------------------------------------------- wallets
create table if not exists public.wallets (
  id            uuid primary key default gen_random_uuid(),
  chain_id      text not null,
  address       text not null,
  label         text,
  trader_id     uuid references public.traders(id) on delete set null,
  attribution   text not null default 'UNKNOWN',  -- VERIFIED | HIGH CONFIDENCE | POSSIBLE | UNKNOWN
  attribution_evidence jsonb not null default '[]',
  monitored     boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (chain_id, address)
);

create table if not exists public.wallet_events (
  id          bigserial primary key,
  wallet_id   uuid not null references public.wallets(id) on delete cascade,
  token_id    uuid references public.tokens(id) on delete cascade,
  kind        text not null,     -- BUY | SELL | TRANSFER_IN | TRANSFER_OUT
  amount      numeric,
  price_usd   numeric,
  value_usd   numeric,
  tx_hash     text,
  source      text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (wallet_id, tx_hash, kind, token_id)
);
create index if not exists wallet_events_time_idx on public.wallet_events (observed_at desc);
create index if not exists wallet_events_token_idx on public.wallet_events (token_id, observed_at desc);

create table if not exists public.wallet_relationships (
  id           uuid primary key default gen_random_uuid(),
  wallet_a     uuid not null references public.wallets(id) on delete cascade,
  wallet_b     uuid not null references public.wallets(id) on delete cascade,
  relationship text not null,
  confidence   text not null default 'POSSIBLE',
  evidence     jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  unique (wallet_a, wallet_b, relationship)
);

-- ------------------------------------------------------- social intelligence
create table if not exists public.x_accounts (
  id           uuid primary key default gen_random_uuid(),
  x_user_id    text not null unique,
  handle       text not null,
  display_name text,
  followers    integer,
  trader_id    uuid references public.traders(id) on delete set null,
  monitored    boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists public.x_posts (
  id          uuid primary key default gen_random_uuid(),
  post_id     text not null unique,
  x_account_id uuid references public.x_accounts(id) on delete set null,
  author_handle text,
  text        text not null,
  likes       integer,
  reposts     integer,
  replies     integer,
  url         text,
  posted_at   timestamptz not null,
  received_at timestamptz not null default now(),
  raw         jsonb
);
create index if not exists x_posts_time_idx on public.x_posts (posted_at desc);

create table if not exists public.social_events (
  id            bigserial primary key,
  token_id      uuid references public.tokens(id) on delete cascade,
  post_id       uuid references public.x_posts(id) on delete cascade,
  match_basis   text not null,        -- CONTRACT_ADDRESS | SYMBOL_AND_CONTEXT | NAME
  confidence    text not null default 'POSSIBLE',
  observed_at   timestamptz not null,
  received_at   timestamptz not null default now(),
  unique (token_id, post_id)
);

create table if not exists public.narratives (
  id            uuid primary key default gen_random_uuid(),
  label         text not null unique,
  description   text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  state         text not null default 'EMERGING'
);

create table if not exists public.narrative_events (
  id           bigserial primary key,
  narrative_id uuid not null references public.narratives(id) on delete cascade,
  token_id     uuid references public.tokens(id) on delete cascade,
  post_id      uuid references public.x_posts(id) on delete set null,
  kind         text not null,
  detail       text,
  observed_at  timestamptz not null,
  received_at  timestamptz not null default now()
);

-- ----------------------------------------------------------- research layer
create table if not exists public.research_candidates (
  id             uuid primary key default gen_random_uuid(),
  token_id       uuid not null references public.tokens(id) on delete cascade,
  stage          text not null default 'DISCOVERED',  -- DISCOVERED | VALIDATED | RISK_FILTERED | MARKET_FILTERED | ANALYSED | DEEP_RESEARCH | WATCHLIST | PAPER | CLOSED
  decision       text not null default 'NO SIGNAL',   -- WATCH | RESEARCH | STRONG RESEARCH CANDIDATE | PAPER TRADE IDEA | DECAYING | HIGH RISK | NO SIGNAL
  why            jsonb not null default '[]',         -- evidence for
  contradictions jsonb not null default '[]',         -- evidence against
  unknowns       jsonb not null default '[]',
  invalidation   jsonb not null default '[]',
  signals        jsonb not null default '{}',         -- per-dimension scores, never one magic number
  conclusion     text,
  confidence     text not null default 'UNKNOWN',
  opened_at      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  closed_at      timestamptz
);
create index if not exists research_candidates_stage_idx on public.research_candidates (stage, updated_at desc);
create unique index if not exists research_candidates_open_idx
  on public.research_candidates (token_id) where closed_at is null;

-- -------------------------------------------------------------------- alerts
create table if not exists public.stellaris_alerts (
  id           uuid primary key default gen_random_uuid(),
  token_id     uuid references public.tokens(id) on delete cascade,
  event_id     bigint references public.stellaris_events(id) on delete set null,
  category     text not null,
  severity     text not null default 'INFO',
  title        text not null,
  why          jsonb not null default '[]',
  acknowledged boolean not null default false,
  cooldown_key text,
  created_at   timestamptz not null default now()
);
create index if not exists stellaris_alerts_time_idx on public.stellaris_alerts (created_at desc);
create index if not exists stellaris_alerts_cooldown_idx on public.stellaris_alerts (cooldown_key, created_at desc);

-- ------------------------------------------------------------- watchlist v2
create table if not exists public.watchlist_items (
  id          uuid primary key default gen_random_uuid(),
  entity_kind text not null,     -- TOKEN | TRADER | WALLET | X_ACCOUNT | NARRATIVE
  entity_id   text not null,
  token_id    uuid references public.tokens(id) on delete cascade,
  label       text,
  note        text,
  added_at    timestamptz not null default now(),
  removed_at  timestamptz,
  unique (entity_kind, entity_id)
);

-- ------------------------------------------------------------ trade journal
create table if not exists public.user_trades (
  id             uuid primary key default gen_random_uuid(),
  token_id       uuid references public.tokens(id) on delete set null,
  candidate_id   uuid references public.research_candidates(id) on delete set null,
  side           text not null,
  size_usd       numeric,
  entry_price    numeric,
  entry_at       timestamptz,
  exit_price     numeric,
  exit_at        timestamptz,
  realized_pnl   numeric,
  reason         text,
  strategy       text,
  trader_influence text,
  social_influence text,
  outcome        text,
  notes          text,
  created_at     timestamptz not null default now()
);

-- --------------------------------------------------- providers, audit, config
create table if not exists public.provider_connections (
  provider_id  text primary key,
  status       text not null default 'NOT CONNECTED',
  auth_kind    text not null default 'NONE',
  account_label text,
  scopes       jsonb not null default '[]',
  /* OAuth tokens are stored server-side only and never returned to the browser. */
  token_ref    text,
  connected_at timestamptz,
  updated_at   timestamptz not null default now(),
  note         text
);

create table if not exists public.provider_health (
  provider_id     text primary key,
  status          text not null default 'NOT CONNECTED',
  configured      boolean not null default false,
  last_request_at timestamptz,
  last_ok_at      timestamptz,
  last_error_at   timestamptz,
  last_error      text,
  latency_ms      integer,
  rate_limit_note text,
  capabilities    jsonb not null default '[]',
  blocked_reason  text,
  updated_at      timestamptz not null default now()
);

create table if not exists public.audit_log (
  id         bigserial primary key,
  actor      text not null default 'SYSTEM',   -- SYSTEM | USER | AGENT
  action     text not null,
  component  text not null,
  detail     text,
  reason     text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_time_idx on public.audit_log (created_at desc);

create table if not exists public.system_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value) values
  ('meme_chains', '["solana","base","bsc","ethereum"]'::jsonb),
  ('discovery_queries', '["pump","bonk","wif","meme","cat","dog"]'::jsonb),
  ('poll_interval_seconds', '15'::jsonb),
  ('research_depth', '"STANDARD"'::jsonb),
  ('alert_cooldown_minutes', '15'::jsonb),
  ('execution_enabled', 'false'::jsonb)
on conflict (key) do nothing;

-- ------------------------------------------- future agent permission boundary
-- Data only. No execution path exists in this application; real-money trading
-- is hard-disabled and every level below EXECUTOR is read/propose only.
create table if not exists public.agent_permissions (
  id                uuid primary key default gen_random_uuid(),
  agent_label       text not null unique,
  level             text not null default 'OBSERVER',  -- OBSERVER | RESEARCHER | PROPOSER | PAPER_TRADER | HUMAN_APPROVED_EXECUTOR | AUTONOMOUS_EXECUTOR
  max_trade_usd     numeric not null default 0,
  max_daily_loss    numeric not null default 0,
  max_position_usd  numeric not null default 0,
  allowed_chains    jsonb not null default '[]',
  allowed_strategies jsonb not null default '[]',
  max_slippage_bps  integer not null default 0,
  execution_enabled boolean not null default false,
  session_expires_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.trade_proposals (
  id            uuid primary key default gen_random_uuid(),
  token_id      uuid references public.tokens(id) on delete set null,
  candidate_id  uuid references public.research_candidates(id) on delete set null,
  agent_label   text,
  direction     text not null,
  size_usd      numeric,
  strategy      text,
  reason        text,
  risk_verdict  text,
  risk_reason   text,
  state         text not null default 'PROPOSED',  -- PROPOSED | APPROVED | REJECTED | EXPIRED
  /* Execution is never performed by this application. */
  executed      boolean not null default false,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz
);

-- ----------------------------------------------------------- least privilege
do $$
declare t text;
begin
  foreach t in array array[
    'tokens','token_snapshots','token_lifecycle','token_pairs','pair_snapshots',
    'stellaris_events','traders','trader_accounts','wallets','wallet_events',
    'wallet_relationships','x_accounts','x_posts','social_events','narratives',
    'narrative_events','research_candidates','stellaris_alerts','watchlist_items',
    'user_trades','provider_connections','provider_health','audit_log',
    'system_settings','agent_permissions','trade_proposals'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant all on all sequences in schema public to service_role;
