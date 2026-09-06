/**
 * HYPOTHESIS ENGINE (persistent)
 *
 * Hypotheses derived by the reasoning layer are promoted into persistent objects
 * with supporting and opposing evidence, agent alignment, assumptions,
 * falsification criteria and a lifecycle status. Statuses only move when the
 * underlying observations move — never on a timer.
 *
 * "What would change our mind" is stored as a monitoring condition, so a later
 * observation can weaken, invalidate or reopen the hypothesis.
 */

import { createStore, newId } from "./persist";
import { emitEvent } from "./events";
import { hypothesesOf } from "./reasoning";
import type { Assessment } from "./dex-types";

export type HypothesisStatus = "ACTIVE" | "SUPPORTED" | "CONTESTED" | "WEAKENED" | "INVALIDATED" | "UNRESOLVED";

export type StoredHypothesis = {
  id: string;
  targetKey: string;
  targetLabel: string;
  statement: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  assumptions: string[];
  agentsSupporting: string[];
  agentsOpposing: string[];
  historicalEvidence: string[];
  wouldChangeOurMind: string[];
  confidence: number | null;
  status: HypothesisStatus;
  createdAt: number;
  updatedAt: number;
  passes: number;
  statusHistory: { t: number; status: HypothesisStatus; because: string }[];
};

const store = createStore<StoredHypothesis[]>("dmi.hypotheses.v1", []);
const MAX = 240;

export const subscribeHypotheses = store.subscribe;
export const HYPOTHESIS_ENGINE_VERSION = "hypothesis-engine v1.0";

export function getHypotheses(): StoredHypothesis[] {
  return store.get().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function hypothesesForTarget(targetKey: string): StoredHypothesis[] {
  return store.get().filter((h) => h.targetKey === targetKey);
}

function statusFrom(support: number, against: number, dataAvailable: boolean): HypothesisStatus {
  if (!dataAvailable) return "UNRESOLVED";
  if (support > 0 && against > 0) return "CONTESTED";
  if (support >= 2) return "SUPPORTED";
  if (support === 1) return "ACTIVE";
  if (against >= 2) return "INVALIDATED";
  if (against === 1) return "WEAKENED";
  return "UNRESOLVED";
}

/** Persist / refresh hypotheses for one assessment pass. */
export function syncHypotheses(a: Assessment, historyNote?: string): StoredHypothesis[] {
  const label = `${a.pair.baseSymbol}/${a.pair.quoteSymbol} · ${a.pair.chainId}/${a.pair.dexId}`;
  const derived = hypothesesOf(a);
  const now = Date.now();
  const existing = store.get();
  const out: StoredHypothesis[] = [];

  for (const h of derived) {
    const prior = existing.find((x) => x.targetKey === a.pair.key && x.statement === h.statement);
    const agentsSupporting = a.agents.filter((g) => g.vote === "ELEVATED").map((g) => `${g.agentNumber} ${g.name}`);
    const agentsOpposing = a.agents.filter((g) => g.vote === "CONTAINED").map((g) => `${g.agentNumber} ${g.name}`);
    const status = statusFrom(h.supportPoints, h.againstPoints, h.standing !== "INSUFFICIENT DATA");
    const historical = prior?.historicalEvidence ?? [];
    if (historyNote && !historical.includes(historyNote)) historical.push(historyNote);

    const next: StoredHypothesis = {
      id: prior?.id ?? newId("hyp"),
      targetKey: a.pair.key,
      targetLabel: label,
      statement: h.statement,
      supportingEvidence: h.supportedBy,
      opposingEvidence:
        h.againstPoints > 0
          ? a.agents.filter((g) => g.vote === "CONTAINED").flatMap((g) => g.observations.slice(0, 1))
          : [],
      assumptions: [
        "Peer baseline is representative of comparable markets in the current snapshot",
        "Reported liquidity, volume and transaction counts are accurate as returned by the source",
      ],
      agentsSupporting,
      agentsOpposing,
      historicalEvidence: historical.slice(-8),
      wouldChangeOurMind: h.wouldChangeOurMind,
      confidence: a.confidence.score,
      status,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      passes: (prior?.passes ?? 0) + 1,
      statusHistory: prior
        ? prior.status === status
          ? prior.statusHistory
          : [...prior.statusHistory, { t: now, status, because: `Support ${h.supportPoints}, opposition ${h.againstPoints} in this pass` }].slice(-12)
        : [{ t: now, status, because: "First recorded evaluation" }],
    };

    if (prior && prior.status !== status) {
      emitEvent({
        type: "HYPOTHESIS_UPDATED",
        source: HYPOTHESIS_ENGINE_VERSION,
        target: label,
        targetKey: a.pair.key,
        message: `Hypothesis moved ${prior.status} → ${status}: ${h.statement}`,
        severity: status === "INVALIDATED" ? "UNUSUAL" : "NOTABLE",
        confidence: a.confidence.score,
      });
    }
    out.push(next);
  }

  const keep = existing.filter((x) => !out.some((n) => n.id === x.id));
  store.set([...out, ...keep].slice(0, MAX));
  return out;
}

/** Monitoring conditions derived from "what would change our mind". */
export type MonitoringCondition = {
  hypothesisId: string;
  targetKey: string;
  targetLabel: string;
  condition: string;
  status: "MONITORING" | "TRIGGERED" | "NOT EVALUABLE";
  lastCheckedAt: number;
  note: string;
};

export function monitoringConditions(): MonitoringCondition[] {
  const now = Date.now();
  return getHypotheses().flatMap((h) =>
    h.wouldChangeOurMind.map((c) => ({
      hypothesisId: h.id,
      targetKey: h.targetKey,
      targetLabel: h.targetLabel,
      condition: c,
      status:
        h.status === "INVALIDATED" || h.status === "WEAKENED"
          ? ("TRIGGERED" as const)
          : h.confidence === null
            ? ("NOT EVALUABLE" as const)
            : ("MONITORING" as const),
      lastCheckedAt: h.updatedAt,
      note:
        h.status === "INVALIDATED"
          ? "Condition met — research reopened for reassessment"
          : `Evaluated on every recorded pass (last ${Math.max(0, Math.round((now - h.updatedAt) / 1000))}s ago)`,
    })),
  );
}

export function clearHypotheses() {
  store.clear();
}
