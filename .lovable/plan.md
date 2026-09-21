# STELLARIS — meme-coin intelligence system

Refocus of the existing app: same six-surface shell, same Supabase-only backend, but the research universe becomes meme coins only. Nothing mainstream (BTC/ETH/majors) stays in the user-facing surfaces.

## What changes first

**Universe swap.** The tracked-majors list is replaced by a meme universe driven by discovery, not a hard-coded symbol list. A classifier keeps a token in the universe only when it looks like a meme market (Solana/Base/BNB meme pairs, Pump.fun origin, tiny-cap new pairs) and filters majors and stablecoins out.

**Discovery source: Pump.fun.** There is no official Pump.fun API. The legitimate real-data path is the public PumpPortal data stream (free, documented, websocket + REST) for new-token, trade and migration events, with Moralis or Bitquery as a paid alternative if you want richer history later. I will build a `PumpFunProvider` interface with the PumpPortal adapter as the default implementation, so it can be swapped.

**Market source: DEX Screener.** Already built — reused for pairs, liquidity, volume, transactions, price. Works today with no credentials.

**On-chain source: Solana.** A provider interface for holders, transfers, wallet activity and liquidity movement. Requires an RPC/indexer key (Helius free tier is enough to start). NOT CONNECTED until you add one.

**X.** Real OAuth2 connect flow. This needs an X developer app; I'll check whether Lovable's X connector can supply it before asking you for anything.

**FOMO.** I will verify what FOMO actually publishes before writing a line of adapter code. If there is no supported API or OAuth, the provider stays NOT CONNECTED with the exact missing requirement named — no scraping, no password.

**News/web research + AI.** Provider abstractions; AI only fires on meaningful events, never for arithmetic.

## Data model (new migrations, service-role only, RLS on)

`tokens`, `token_snapshots`, `pairs`, `pair_snapshots`, `token_lifecycle`, `events`, `traders`, `trader_accounts`, `wallets`, `wallet_events`, `wallet_relationships`, `x_accounts`, `x_posts`, `social_events`, `narratives`, `narrative_events`, `research_candidates`, `dossiers`, `alerts`, `provider_connections`, `provider_health`, `watchlist_items`, `user_trades`, `audit_log`, `agent_permissions`, `system_settings`. Existing prediction/outcome/calibration/paper/strategy/risk tables are reused, re-pointed at tokens.

Every observation row carries source, observed_at, received_at, confidence and provenance. Missing values stay null — never zero.

## Engine

Event-driven: collectors normalise provider data into deduplicated events (`TOKEN_DISCOVERED`, `VOLUME_CHANGED`, `WALLET_BOUGHT`, `SOCIAL_ACCELERATION`, `PROVIDER_ERROR`, …) with before/after values. Cheap statistical rules run on every event; a research pass (including AI synthesis) is triggered only by meaningful events. Funnel: discovered → validated → risk filter → market filter → social/trader analysis → deep research → watchlist → paper trade → your decision.

Signals stay split into market / on-chain / social / trader / token / momentum / risk / historical-analog dimensions. No single hidden score.

## Surfaces

Command centre home (live status, rapid radar, new, accelerating, trader activity, social, opportunities, deteriorating, daily brief), token dossier (what / why / evidence / risk / contradictions / unknowns / history / what would change the assessment / timeline), traders, wallets, narratives, market map, watchlist, paper trading, learning dashboard, connections, provider health, audit log, help directory with EXPLAIN on every metric, command bar, emergency stop. Cards over tables; mobile keeps radar, alerts, dossier, trader activity, status.

## Agent API

Read-only JSON endpoints under `/api/intelligence/*` and `/api/research/*` plus `POST /research/analyze` and `POST /trade/propose` (proposal only). Permission levels OBSERVER → AUTONOMOUS EXECUTOR exist as data with limits and an audit trail; execution stays hard-disabled.

## Build order

1. Provider abstraction + migrations + event model + audit + settings + meme classifier.
2. Pump.fun (PumpPortal) + DEX Screener meme ingestion, provider health, connections screen.
3. Event engine, trader/wallet graph, social + narrative engines, risk engine.
4. Dossiers, evidence, historical analogs, predictions/outcomes/calibration re-pointed at tokens.
5. Paper trading + backtesting on meme data.
6. Command centre UI, radar, market map, timeline, alerts, daily brief, help, command bar.
7. Agent API + permissions.
8. Execution interfaces only, disabled.

## What I need from you (only when I reach it)

- Solana RPC/indexer key (Helius free tier) — enables holders, wallets, clusters.
- X access — I'll try the built-in connector first and tell you if it can't cover it.
- FOMO — I'll report what its real integration options are before asking for anything.

Everything else runs on free public data. Phases 1–2 start immediately without any new credential.
