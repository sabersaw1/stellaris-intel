# Market Intelligence OS — build roadmap

## Phase 1 — reasoning layer (done)
- [x] Attention engine, research job manager, agent room, hypotheses, what-changed / why panels

## Phase 2 — memory + history (done)
- [x] Memory system with provenance, recall and similar-case matching (`/memory`)
- [x] Historical time machine with LIVE / HISTORICAL separation (`/timemachine`)
- [x] Change engine v2 with NOT AVAILABLE states
- [x] Post-mortems (`/postmortems`), confidence calibration (`/calibration`), agent performance (`/performance`)
- [x] Curiosity engine / open questions (`/questions`), hypothesis store (`/hypotheses`), contradiction store (`/contradictions`)

## Phase 3 — workspace + control (done)
- [x] Command palette + universal search (CTRL/⌘ K)
- [x] Custom workspaces, widgets, preferences (`/workspaces`)
- [x] Neural link + live telemetry (`/neural`), intelligence stream (`/stream`)
- [x] Resource governor, research budgets, priority scheduling

## Phase 4 — integrations + automation (done)
- [x] Integrations command center, accounts, permissions, dependency map, connection graph, system doctor (`/integrations`)
- [x] Workflow studio with validation, dry run, execution records, versioning, templates (`/workflows`)
- [x] Webhook receivers with HMAC verification (`/api/public/webhooks/tradingview`, `/api/public/webhooks/n8n`)
- [x] Event bus, incidents (`/incidents`), audit log (`/audit`)

## Marked dependencies (built, waiting on external connection)
- WAITING FOR SUPABASE — durable cross-device memory, stored webhook payloads, calibration history beyond this browser
- WAITING FOR CREDENTIAL — FOMO intelligence probe, TradingView + n8n webhook secrets, outbound n8n URL
- INSUFFICIENT OUTCOME DATA — calibration and agent performance percentages until 20 resolved cases exist
- UNAVAILABLE — host CPU/memory and websocket metrics cannot be measured from the browser
