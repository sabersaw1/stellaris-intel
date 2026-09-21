# Stellaris Intel — roadmap

## Done
- Six primary surfaces (COMMAND, RAPID SCAN, WATCHLIST, INVESTIGATIONS, MEMORY, SYSTEM) plus preserved advanced surfaces.
- DEX Screener pipeline: caching, retries, backoff, dedup, truthful timestamps.
- Supabase persistence (own project): migrations 0001-0006 in `db/migrations/`.
- Privacy: research/market tables are service-role only. 0004 grants nothing; 0005 revokes any earlier public grants. Browser Realtime disabled by design (`REALTIME_ENABLED = false`); live UI uses 10-15s revalidation.
- Tracked universe configurable (BTC ETH SOL XRP BNB DOGE ADA AVAX LINK DOT) via `asset_universe` table or `STELLARIS_ASSET_UNIVERSE`.
- Research engine: features (available/unavailable only), regime rules, versioned strategies, recorded predictions, horizon-based outcome resolution, calibration from resolved outcomes only, signals, independent risk engine, paper simulation, backtest + walk-forward.
- Engine wired into the background/cron tick; RESEARCH ENGINE and PROVIDERS screens added.
- Tests: `src/lib/research/research.test.ts` (16 passing).

## Waiting on Johnny
- Apply migrations 0004, 0005, 0006 in the Supabase SQL Editor.
- Schedule the signed `/api/public/cron/tick` endpoint with pg_cron (migration 0002).

## Optional
- GMGN / FOMO credentials (adapters built, NOT CONFIGURED).
- Derivatives venue for funding / open interest / liquidations (currently UNAVAILABLE).
- AI research assistant surface over stored data (architecture available through engine read functions).

## New direction (meme-coin refocus, requested 2026-09-21)
- Research universe becomes MEME COINS ONLY; mainstream majors filtered out of user-facing surfaces.
- Providers: Pump.fun (discovery), DEX Screener (market), Solana on-chain, X (real OAuth), FOMO (only if a supported auth path exists), news/web research, AI abstraction.
- New entities: tokens, traders, wallets, x_accounts, social/narrative events, dossiers, alerts, audit log, provider connections, user trade journal, agent permissions.
- Event-driven engine with dedup; cheap rules first, AI only on meaningful events.
- Agent-ready JSON API for future local Jarvis; execution stays disabled.
- Connections + provider health + help system + command bar + radar + market map + timeline + daily brief.

## Meme build — phases 1-3 (done)
- Provider abstraction (`src/lib/providers/*`): DEX Screener (no key), Pump.fun via documented third-party backend (PumpPortal or Bitquery), Solana JSON-RPC, X API v2, FOMO API. Each declares per-capability SUPPORTED / REQUIRES_CREDENTIAL / UNSUPPORTED and truthful health; registry resolves capability -> provider.
- Meme-only classifier with MEME / NOT MEME / UNKNOWN verdicts and stated reasons.
- Event engine: thresholds, minute-bucket dedup, discovery events, research triggers.
- Migration `db/migrations/0007_stellaris_meme_core.sql` (service-role only, RLS on, no anon grants).
- Persistence layer `src/lib/stellaris/store.server.ts` (tokens, snapshots, pairs, lifecycle, events, alerts with cooldown, audit, settings, provider health).
- Collection pipeline `src/lib/stellaris/pipeline.server.ts`, wired into the background tick.
- Surface `/meme` + server functions `src/lib/meme.functions.ts`.
- 32 tests pass; typecheck clean.

### Blocked, awaiting credentials
- Pump.fun launch discovery: needs `PUMPPORTAL_API_KEY` or `BITQUERY_API_TOKEN` (Pump.fun has no official public data API).
- X social evidence: connect the X connector or set `X_BEARER_TOKEN` (recent search needs a paid X tier).
- FOMO trader intelligence: needs `FOMO_API_KEY` from fomoapi.io (fomo.family ships no public API).
- Holders / mint authority / on-chain transfers: needs `STELLARIS_SOLANA_RPC_URL`.
- Migration 0007 must be applied in Supabase before meme data can be stored.

## Audit pass — analyst roles, agent API, connections screen

Done
- Independent analyst roles (market, on-chain, trader, social, token risk, historical) that may disagree; unavailable evidence stays unavailable. 53 tests pass.
- Explainable funnel from discovery to human decision, plus permission levels with real execution hard-disabled.
- One shared research path (`src/lib/agents/analyze.server.ts`) used by the UI and the machine API; dossiers persist to `dossiers` when requested.
- Bearer-protected machine API: /api/public/intelligence/status, /api/public/intelligence/events, /api/public/research/analyze, /api/public/trade/propose (proposals only, never executed).
- New CONNECTIONS screen: per-source state, what it supplies / does not supply, credential needed, last success, last error, capability coverage.
- db/migrations/0008_stellaris_dossiers.sql (private, service-role only, idempotent).

Blocked on values only you can provide
- Apply db/migrations/0007 and 0008 in Supabase — meme tables are still missing, so meme collection stores nothing.
- PUMPPORTAL_API_KEY or BITQUERY_API_TOKEN — Pump.fun launch discovery.
- STELLARIS_SOLANA_RPC_URL — holders, mint authority, transfers.
- X connector or X_BEARER_TOKEN — social evidence.
- FOMO_API_KEY — trader/wallet intelligence.
- STELLARIS_AGENT_TOKEN — opens the machine API for your local LLM.

## RECONCILIATION PASS — completed without credentials or SQL

Verified: 4 test files / 69 tests pass, typecheck clean, production build OK,
no console or page errors on any screen, no sideways scrolling on a 390px phone
across all 18 primary and advanced screens.

Finished in this pass:
- Narrative engine (`src/lib/meme/narrative.ts`) — explicit theme grouping,
  minimum three tokens, acceleration only when two social windows exist.
- Entity graph (`src/lib/meme/graph.ts`) — X account -> trader -> wallet ->
  token -> pair -> narrative, observed edges only, source on every edge, no
  duplicate edges.
- FOMO evidence normalisation (`src/lib/meme/fomo-normalize.ts`) — reported
  trades are never marked verified, missing fields stay null and are named,
  duplicates and unplaceable reports are discarded.
- Explain directory (`src/lib/explain.ts`) + `/help` screen — every metric with
  meaning, calculation, source, freshness, limitations and what it does NOT mean.
- Wallet provenance now flows into dossiers: `verified` comes from the stored
  on-chain verification flag, `reported_by` from the reporting source.
- Keyboard shortcuts de-duplicated (meme/engine/providers/connections/help now
  G 1-5); stale "Realtime" comment corrected — live refresh is polling only.
- Mobile/desktop layout containment fixes in shared components (metric tiles,
  label/value rows, table scroller, command layout grids).

Still requires the user, and only the user:
1. Apply `db/migrations/0007_stellaris_meme_core.sql` then
   `0008_stellaris_dossiers.sql` in Supabase. Until then the meme screens
   truthfully report SCHEMA MISSING.
2. Optional data connections, each of which unlocks specific evidence:
   PumpPortal or Bitquery (Pump.fun launches), Solana RPC URL (on-chain
   verification), X API credentials (social), `FOMO_API_KEY` (trader activity),
   `STELLARIS_AGENT_TOKEN` (machine/Jarvis API access).
