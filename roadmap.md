# Stellaris Intel — roadmap

## Done
- Live DEX Screener ingestion, normalization, risk / confidence / anomaly engines, agent suite.
- Reasoning layer: attention, research jobs, contradictions, questions, hypotheses, calibration, performance, memory, time machine, post-mortems, incidents, audit, workspaces, workflows, integrations.
- Stellaris intelligence layer (`src/lib/stellaris.ts`): research state, priority, evidence layers, source agreement, known/unknown/conflicting, next question, challenger review, historical comparison.
- Six primary surfaces: COMMAND, RAPID SCAN, WATCHLIST, INVESTIGATIONS, MEMORY, SYSTEM. All previous pages preserved under ADVANCED SURFACES and contextual panels.

## Waiting on configuration (never faked in the UI)
- SUPABASE — durable memory, outcomes, calibration history, webhook payload storage.
- GMGN — holder and developer/project research layers (currently UNKNOWN).
- FOMO — contract/security research layer (currently UNKNOWN).
- PUBLIC SOCIAL RESEARCH — social layer beyond profile presence and paid boosts.
- Background worker — continuous research currently runs only while the terminal is open.

## Phase A — own Supabase backend (done, awaiting migration run)
- [x] Service-role server client (`src/lib/supabase/admin.server.ts`), secrets read inside functions only
- [x] Schema + schedule SQL in `db/migrations/0001_stellaris_core.sql`, `0002_stellaris_schedule.sql`
- [x] DEX Screener -> Supabase ingestion with dedup + change detection (`ingest.server.ts`)
- [x] Signed scheduled endpoint `/api/public/cron/tick` (HMAC or bearer, 401 verified)
- [x] GMGN + FOMO adapters built, NOT CONFIGURED until keys provided
- [x] Truthful backend status panel on SYSTEM
- [ ] User applies 0001 + 0002 in their Supabase SQL Editor
- [ ] Phase B: move investigations, watchlist, unknowns, conflicts, hypotheses, outcomes, calibration reads/writes from browser store to Supabase

## Live layer (done)
- Event-driven ingestion: `pulseIngest` stores each fresh snapshot (server-side 30s throttle).
- Supabase Realtime browser client (publishable key fetched at runtime) → per-table query invalidation.
- Market snapshot polling 15s, pair 12s, health 30s; 5-min pg_cron is background maintenance only.
- `LiveBar` truthful freshness/connection line on every surface.
- Migration `db/migrations/0004_stellaris_realtime.sql` — user must apply (replica identity + publication + anon SELECT for Realtime).
