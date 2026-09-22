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

## Final pass — meme-only universe, Connections control center, Radar (2026-09-22)
- Active universe is meme coins only: `src/lib/research/universe.ts` now ships meme symbols, exports `EXCLUDED_MAJORS` / `isExcludedMajor`, and strips BTC/ETH/SOL/XRP/BNB/ADA/AVAX/LINK/DOT/stables from any override. Every discovery query that uses `universeSymbols` (dex, backend, research engine) is therefore meme-only, and the classifier filters again.
- `src/lib/providers/catalog.ts`: browser-safe setup facts per connection (purpose, why needed, credential type, exact env var, where to get it, free/paid, unlocks, does-not-unlock, how the test works, requirement class).
- `src/lib/connections.functions.ts`: `connectionCenterReport` (live state, presence of credential, last success/error, latency, checklist) and `testConnection` (real read-only probe per provider; unsupported vendor capability reported as CAPABILITY UNAVAILABLE).
- `/connections` rebuilt as the control center with per-card Test Connection, and added to primary navigation (G 4). `/radar` added (G 6) with NEW / ACCELERATING / TRENDING / TRADER ACTIVITY / SOCIAL / HIGH RISK / DETERIORATING built from stored observations and change events only.
- Verified: typecheck clean, build OK, 70 tests pass, no console errors, no horizontal overflow at 390px, DEX Screener test probe passed live (49 ms, 30 observations). Meme schema now reports APPLIED.

## Surfaces + live Pump.fun stream (2026-09-22)
- New mobile-first surfaces from stored Supabase data only:
  `/traders`, `/wallets`, `/narratives`, `/paper`, `/learning`, `/settings`, `/more`
  (`src/lib/surfaces.functions.ts` server-only readers + `src/components/surface.tsx`).
- `TerminalShell`: 13-item desktop nav, 5-item mobile bottom nav (HOME/RADAR/TRADERS/WATCH/MORE),
  duplicate keyboard shortcuts removed.
- Pump.fun is live: `PUMPPORTAL_API_KEY` configured; `drainPumpPortal` opens one
  short-lived websocket per cycle (subscribeNewToken), drains a bounded window and
  closes. Launches outside the window are not observed and never back-filled.
- Verified live: collection cycle stored 65 observations / 89 change events / 6 alerts
  from 93 meme-classified tokens; typecheck clean, 70 tests pass, build OK, zero
  horizontal overflow and zero console errors at 320/390/768/1440 across 12 screens.
- Still user-only: apply `db/migrations/0008_stellaris_dossiers.sql` (only missing table).
  Optional: Solana RPC URL, X credentials, FOMO_API_KEY, STELLARIS_AGENT_TOKEN.

## Root completion pass — intelligence layer (done)
- `src/lib/intel/observation.ts` — one normalized observation model for every provider; unknown stays null, impossible/future records rejected with a stated reason.
- `src/lib/intel/canonical.ts` — canonical events: one real-world change = one event, with every observing provider kept as provenance; REPORTED / CROSS-VERIFIED / ON-CHAIN VERIFIED.
- `src/lib/intel/significance.ts` — cheap, explainable gate before expensive research; returns level, weight and drivers.
- `src/lib/intel/baseline.ts` — per-token baselines and activity assessment; INSUFFICIENT EVIDENCE when history is too thin.
- `src/lib/intel/gaps.ts` — truthful collection gaps, OFFLINE vs QUOTA_EXHAUSTED, POLLING / BOUNDED_WINDOW / HYBRID statements. No continuous-monitoring claim.
- Pipeline wired: validation gate -> canonical events with provenance -> significance grading -> research queue. Verified live: 180 discovered, 90 memes, 64 snapshots, 27 canonical events, 7 significant, 6 alerts, 0 errors, mode HYBRID.
- 93 tests, typecheck clean, build OK.


## Final finish pass (verified)
- Radar cards can TRACK a token; Watchlist shows TRACKED MEME TOKENS from Supabase rows with dossier links.
- Alerts surface now shows MEME PIPELINE ALERTS from stellaris_alerts with WHY and WHAT WOULD CHANGE IT.
- Connections shows an honest DELIVERY mode per provider; optional Bitquery and Solana Tracker entries added (not connected, not required).
- Verified live: 180 listings -> 91 meme tokens, 64 readings, 26 canonical events, 7 significant, HYBRID mode, 0 errors.
- Stored totals: 78 tokens, 193 readings, 142 events, 12 alerts, 3 dossiers. Analyzer persisted a WATCH dossier with execution denied.
- Unsigned cron 401, unauthenticated agent API 503, no secret values in client code.
- 93 tests pass, typecheck clean, build OK, no console errors and no horizontal scroll at 390px and 1440px.
