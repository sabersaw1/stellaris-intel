/**
 * AGENT PERFORMANCE CENTER
 *
 * ACTIVITY and PERFORMANCE are reported separately. Activity is measurable now
 * (runs, findings, contradictions identified, unavailable-data events, processing
 * time). Performance requires resolved outcomes; until enough exist, it reports
 * INSUFFICIENT OUTCOME DATA. An active agent is never presented as a good agent.
 */

import { createStore } from "./persist";
import { getMemory } from "./memory";
import { getContradictions } from "./contradictions";
import { calibrationOverview, MIN_RESOLVED_CASES } from "./calibration";
import type { Assessment } from "./dex-types";

export const PERFORMANCE_ENGINE_VERSION = "agent-performance v1.0";

export type AgentActivityRow = {
  agentId: string;
  agentNumber: string;
  name: string;
  runs: number;
  jobsTouched: number;
  findings: number;
  evidence: number;
  contradictionsIdentified: number;
  unavailableDataEvents: number;
  errors: number;
  meanConfidence: number | null;
  meanProcessingMs: number | null;
  researchCategories: string[];
  lastRanAt: number | null;
};

type Timing = Record<string, { runs: number; totalMs: number; errors: number }>;
const timingStore = createStore<Timing>("dmi.agent-timing.v1", {});
export const subscribeTiming = timingStore.subscribe;

/** Record real per-agent processing time for one assessment pass. */
export function recordAgentTiming(a: Assessment, elapsedMs: number) {
  const per = a.agents.length ? elapsedMs / a.agents.length : 0;
  timingStore.update((cur) => {
    const next: Timing = { ...cur };
    for (const g of a.agents) {
      const prev = next[g.agentId] ?? { runs: 0, totalMs: 0, errors: 0 };
      next[g.agentId] = {
        runs: prev.runs + 1,
        totalMs: prev.totalMs + per,
        errors: prev.errors + (g.status === "ERROR" ? 1 : 0),
      };
    }
    return next;
  });
}

export function agentActivity(agents: { agentId: string; agentNumber: string; name: string }[]): AgentActivityRow[] {
  const mem = getMemory();
  const timing = timingStore.get();
  const cons = getContradictions();

  return agents.map((def) => {
    const tag = `${def.agentNumber} ${def.name}`;
    const own = mem.filter((r) => r.source === tag);
    const findings = own.filter((r) => r.kind === "AGENT_FINDING");
    const evidence = own.filter((r) => r.kind === "EVIDENCE");
    const t = timing[def.agentId] ?? null;
    const confidences = own.map((r) => r.confidence).filter((c): c is number => c !== null);
    const identified = cons.filter((c) => c.agentsA.includes(tag) || c.agentsB.includes(tag)).length;
    const unavailable = own.filter((r) => /NOT AVAILABLE|INSUFFICIENT|UNAVAILABLE/i.test(r.summary)).length;

    return {
      agentId: def.agentId,
      agentNumber: def.agentNumber,
      name: def.name,
      runs: t?.runs ?? 0,
      jobsTouched: new Set(own.map((r) => r.jobId).filter(Boolean)).size,
      findings: findings.length,
      evidence: evidence.length,
      contradictionsIdentified: identified,
      unavailableDataEvents: unavailable,
      errors: t?.errors ?? 0,
      meanConfidence: confidences.length ? Math.round(confidences.reduce((s, c) => s + c, 0) / confidences.length) : null,
      meanProcessingMs: t && t.runs ? Math.round(t.totalMs / t.runs) : null,
      researchCategories: [...new Set(own.map((r) => r.kind))],
      lastRanAt: own.length ? Math.max(...own.map((r) => r.t)) : null,
    };
  });
}

export type AgentPerformanceRow = {
  agent: string;
  resolvedCases: number;
  consistent: number;
  inconsistent: number;
  unresolved: number;
  consistencyPct: number | null;
  state: "INSUFFICIENT OUTCOME DATA" | "MEASURED";
};

export function agentPerformance(): AgentPerformanceRow[] {
  return calibrationOverview().byAgent.map((s) => ({
    agent: s.label,
    resolvedCases: s.resolved,
    consistent: s.consistent,
    inconsistent: s.inconsistent,
    unresolved: s.unresolved,
    consistencyPct: s.observedConsistencyPct,
    state: s.state,
  }));
}

/**
 * FUTURE SCHEDULING WEIGHT
 *
 * Measured performance may bias allocation only once outcomes exist. Agreement
 * with the majority is never rewarded. Until then every agent is weighted 1.
 */
export function schedulingWeights(): { agent: string; weight: number; basis: string }[] {
  return agentPerformance().map((p) => {
    if (p.state !== "MEASURED" || p.consistencyPct === null)
      return {
        agent: p.agent,
        weight: 1,
        basis: `INSUFFICIENT OUTCOME DATA — ${p.resolvedCases}/${MIN_RESOLVED_CASES} resolved cases; equal allocation`,
      };
    const weight = Math.round((0.75 + (p.consistencyPct / 100) * 0.5) * 100) / 100;
    return { agent: p.agent, weight, basis: `${p.consistencyPct}% classification consistency over ${p.resolvedCases} resolved cases` };
  });
}

export function clearTiming() {
  timingStore.clear();
}
