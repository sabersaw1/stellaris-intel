/**
 * CONTRADICTION ENGINE (persistent)
 *
 * Records meaningful disagreement between agents as a durable object: claim A,
 * claim B, supporting evidence, opposing evidence, missing evidence, confidence,
 * agents involved and resolution status.
 *
 * A minority view is never deleted because it disagrees with the majority. It is
 * preserved with its own record and remains visible after resolution.
 */

import { createStore, newId } from "./persist";
import { emitEvent } from "./events";
import { contradictionsOf, minorityOf } from "./reasoning";
import type { Assessment } from "./dex-types";

export type ContradictionStatus = "OPEN" | "UNRESOLVED — INSUFFICIENT DATA" | "RESOLVED BY EVIDENCE" | "PERSISTENT";

export type StoredContradiction = {
  id: string;
  targetKey: string;
  targetLabel: string;
  topic: string;
  claimA: string;
  claimB: string;
  agentsA: string[];
  agentsB: string[];
  supportingEvidence: string[];
  opposingEvidence: string[];
  missingEvidence: string[];
  confidence: number | null;
  status: ContradictionStatus;
  minorityPreserved: string | null;
  createdAt: number;
  updatedAt: number;
  occurrences: number;
};

const store = createStore<StoredContradiction[]>("dmi.contradictions.v1", []);
const MAX = 240;

export const subscribeContradictions = store.subscribe;
export const CONTRADICTION_ENGINE_VERSION = "contradiction-engine v1.0";

export function getContradictions(): StoredContradiction[] {
  return store.get().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function contradictionsForTarget(targetKey: string): StoredContradiction[] {
  return store.get().filter((c) => c.targetKey === targetKey);
}

export function syncContradictions(a: Assessment): StoredContradiction[] {
  const label = `${a.pair.baseSymbol}/${a.pair.quoteSymbol} · ${a.pair.chainId}/${a.pair.dexId}`;
  const derived = contradictionsOf(a);
  const minority = minorityOf(a);
  const now = Date.now();
  const existing = store.get();
  const out: StoredContradiction[] = [];

  const missing: string[] = [];
  if (!a.peerContext.available) missing.push("PEER BASELINE — fewer than the required comparable observations");
  if (a.pair.pairCreatedAt === null) missing.push("PAIR CREATION TIME — not returned by the source");
  if (a.pair.txns.h24 === null) missing.push("TRANSACTIONS 24H — not returned by the source");
  if (a.confidence.completeness < 70) missing.push(`FIELD COMPLETENESS — only ${a.confidence.completeness}% of fields present`);

  for (const c of derived) {
    const prior = existing.find((x) => x.targetKey === a.pair.key && x.topic === c.topic);
    const status: ContradictionStatus = missing.length >= 2
      ? "UNRESOLVED — INSUFFICIENT DATA"
      : prior && prior.occurrences >= 3
        ? "PERSISTENT"
        : "OPEN";

    const next: StoredContradiction = {
      id: prior?.id ?? newId("con"),
      targetKey: a.pair.key,
      targetLabel: label,
      topic: c.topic,
      claimA: `${c.sideA.vote}: ${c.sideA.basis[0] ?? "no basis returned"}`,
      claimB: `${c.sideB.vote}: ${c.sideB.basis[0] ?? "no basis returned"}`,
      agentsA: c.sideA.agents,
      agentsB: c.sideB.agents,
      supportingEvidence: c.sideA.basis,
      opposingEvidence: c.sideB.basis,
      missingEvidence: missing,
      confidence: a.confidence.score,
      status,
      minorityPreserved: minority ? `${minority.vote} (${minority.share}) — ${minority.agents.join(", ")}` : prior?.minorityPreserved ?? null,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      occurrences: (prior?.occurrences ?? 0) + 1,
    };

    if (!prior) {
      emitEvent({
        type: "AGENT_CONTRADICTION",
        source: CONTRADICTION_ENGINE_VERSION,
        target: label,
        targetKey: a.pair.key,
        message: `${c.topic}: ${c.sideA.vote} vs ${c.sideB.vote}`,
        severity: "NOTABLE",
        status: "OPEN",
        confidence: a.confidence.score,
      });
    }
    out.push(next);
  }

  const keep = existing.filter((x) => !out.some((n) => n.id === x.id));
  store.set([...out, ...keep].slice(0, MAX));
  return out;
}

export function resolveContradiction(id: string, because: string) {
  store.set(
    store.get().map((c) =>
      c.id === id
        ? {
            ...c,
            status: "RESOLVED BY EVIDENCE",
            updatedAt: Date.now(),
            supportingEvidence: [...c.supportingEvidence, `RESOLUTION: ${because}`],
          }
        : c,
    ),
  );
}

export function clearContradictions() {
  store.clear();
}
