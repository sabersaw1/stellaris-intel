-- ============================================================================
-- STELLARIS INTEL — 0008: research dossiers + wallet observation provenance
--
-- Apply AFTER 0007_stellaris_meme_core.sql. Every statement is idempotent and
-- non-destructive: it creates what is missing and never drops or rewrites data.
--
-- Privacy model is unchanged: RLS on, no anon/authenticated grants, service
-- role only. Missing values stay NULL — never 0.
-- ============================================================================

-- A dossier is the stored output of the multi-agent research pass. Supporting,
-- contradicting and unknown evidence are separate columns on purpose, so a
-- later read can never collapse them into a single score.
create table if not exists public.dossiers (
  id                   uuid primary key default gen_random_uuid(),
  token_id             uuid references public.tokens(id) on delete cascade,
  candidate_id         uuid references public.research_candidates(id) on delete set null,
  research_state       text not null,
  observation          text,
  supporting           jsonb not null default '[]',
  contradicting        jsonb not null default '[]',
  unknowns             jsonb not null default '[]',
  findings             jsonb not null default '[]',
  what_would_change_it jsonb not null default '[]',
  disagreement         boolean not null default false,
  funnel_stage         text,
  funnel_blocked_by    text,
  funnel_stages        jsonb not null default '[]',
  /* Provenance of the inputs this dossier was produced from. */
  sources              jsonb not null default '[]',
  inputs_observed_at   timestamptz,
  produced_at          timestamptz not null default now()
);

create index if not exists dossiers_token_idx on public.dossiers (token_id, produced_at desc);
create index if not exists dossiers_state_idx on public.dossiers (research_state, produced_at desc);

-- Wallet observations reported by a third party (for example a social trading
-- feed) are evidence, not truth, until an independent on-chain read confirms
-- them. These columns record that distinction explicitly.
alter table public.wallet_events add column if not exists reported_by text;
alter table public.wallet_events add column if not exists verified boolean not null default false;
alter table public.wallet_events add column if not exists verified_at timestamptz;
alter table public.wallet_events add column if not exists verification_source text;
alter table public.wallet_events add column if not exists tx_signature text;
alter table public.wallet_events add column if not exists source_confidence text;

create index if not exists wallet_events_verified_idx on public.wallet_events (verified, observed_at desc);

-- Least privilege for the new table.
do $$
begin
  execute 'alter table public.dossiers enable row level security';
  execute 'revoke all on public.dossiers from anon, authenticated';
  execute 'grant all on public.dossiers to service_role';
end $$;
