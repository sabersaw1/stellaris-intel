# Market Intelligence OS — build roadmap

Foundation already shipped: DEX Screener ingestion (cache/dedup/retry/backoff/budget), normalization,
risk + confidence + anomaly engines, 8 agents, filter builder, market map, watchlist, alerts,
notes, local history, system health, keyboard shortcuts.

## Phase 1 — reasoning layer (in progress)
- [x] Attention Engine: scored, classified attention queue from real observations + local history
- [x] Research Job Manager: job records, statuses, priorities, budgets, agent assignment
- [x] Agent Room: agent statements, contradictions, minority opinion, consensus
- [x] Hypotheses + "what would change our mind" derived from real factors
- [x] What Changed / Why panels from stored observation deltas

## Phase 2 — memory + history
- [ ] Memory system (past cases, similarity matching over stored history)
- [ ] Expectation vs reality, mind-change engine, post-mortems
- [ ] Confidence calibration, agent performance center (needs persisted outcomes)
- [ ] Time machine / brain replay over stored observations

## Phase 3 — workspace + control
- [ ] Command palette + universal search
- [ ] Custom dashboards / workspaces, live system HUD
- [ ] Resource manager, priority scheduler, research budgets

## Phase 4 — integrations
- [ ] Integration command center, connection tester, health, credential vault
- [ ] Workflow studio (visual), validator, dry run, library, versioning
- [ ] Webhook center, event bus, data router, provenance

Blocked until a backend is connected: cross-device persistence, calibration statistics,
outcome tracking, third-party credentials, workflow execution.
