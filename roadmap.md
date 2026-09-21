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
