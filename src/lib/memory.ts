/**
 * PERSISTENT INTELLIGENCE MEMORY
 *
 * Stores what the system actually produced: observations, research jobs, agent
 * findings, evidence, hypotheses, contradictions, classifications, confidence
 * readings, state changes, research outcomes and system events.
 *
 * Every record carries timestamp, source, target, type, provenance chain and
 * confidence where a confidence value genuinely exists. Nothing is back-filled
 * and no historical record is ever synthesised.
 *
 * Records live in this browser only until a database is connected
 * (see INTEGRATIONS → SUPABASE: WAITING FOR SUPABASE).
 */

import { createStore, newId } from "./persist";
import { emitEvent } from "./events";
import type { Assessment } from "./dex-types";
import { contradictionsOf, hypothesesOf, minorityOf, statementsOf } from "./reasoning";

export type MemoryKind =
  | "OBSERVATION"
  | "RESEARCH_JOB"
  | "AGENT_FINDING"
  | "EVIDENCE"
  | "HYPOTHESIS"
  | "CONTRADICTION"
  | "CLASSIFICATION"
  | "CONFIDENCE"
  | "STATE_CHANGE"
  | "IMPORTANT_EVENT"
  | "RESEARCH_OUTCOME"
  | "SYSTEM_EVENT";

export type MemoryRecord = {
  id: string;
  t: number;
  kind: MemoryKind;
  source: string;
  targetKey: string | null;
  targetLabel: string | null;
  summary: string;
  /** ordered provenance chain: DATA SOURCE → OBSERVATION → ANALYSIS → AGENT → EVIDENCE → CONCLUSION */
  provenance: string[];
  confidence: number | null;
  detail: { label: string; value: string }[];
  jobId: string | null;
};

const MAX_RECORDS = 900;
const store = createStore<MemoryRecord[]>("dmi.memory.v1", []);

export const subscribeMemory = store.subscribe;
export const MEMORY_ENGINE_VERSION = "memory-engine v1.0";

export function remember(r: {
  kind: MemoryKind;
  source: string;
  targetKey?: string | null;
  targetLabel?: string | null;
  summary: string;
  provenance: string[];
  confidence?: number | null;
  detail?: { label: string; value: string }[];
  jobId?: string | null;
  /** identical summaries for the same target inside this window are not duplicated */
  dedupeMs?: number;
}): MemoryRecord | null {
  const now = Date.now();
  const list = store.get();
  const window = r.dedupeMs ?? 10 * 60_000;
  const dupe = list.find(
    (x) => x.kind === r.kind && x.targetKey === (r.targetKey ?? null) && x.summary === r.summary && now - x.t < window,
  );
  if (dupe) return null;

  const record: MemoryRecord = {
    id: newId("mem"),
    t: now,
    kind: r.kind,
    source: r.source,
    targetKey: r.targetKey ?? null,
    targetLabel: r.targetLabel ?? null,
    summary: r.summary,
    provenance: r.provenance,
    confidence: r.confidence ?? null,
    detail: r.detail ?? [],
    jobId: r.jobId ?? null,
  };
  store.set([record, ...list].slice(0, MAX_RECORDS));
  return record;
}

export function getMemory(): MemoryRecord[] {
  return store.get();
}

export function memoryFor(targetKey: string): MemoryRecord[] {
  return store.get().filter((r) => r.targetKey === targetKey);
}

export function memoryByKind(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of store.get()) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}

export function clearMemory() {
  store.clear();
}

/* --------------------------- agent memory recall ---------------------- */

export type Recall = {
  seenBefore: boolean;
  firstSeen: number | null;
  lastSeen: number | null
  ;
  recordCount: number;
  previousClassification: string | null;
  previousConfidence: number | null;
  previousEvidence: string[];
  changedSince: string[];
  note: string;
};

/** HAVE WE SEEN THIS BEFORE? Answered strictly from stored records. */
export function recallTarget(targetKey: string, current?: Assessment | null): Recall {
  const records = memoryFor(targetKey).sort((a, b) => a.t - b.t);
  if (!records.length) {
    return {
      seenBefore: false,
      firstSeen: null,
      lastSeen: null,
      recordCount: 0,
      previousClassification: null,
      previousConfidence: null,
      previousEvidence: [],
      changedSince: [],
      note: "No prior research recorded for this target in this store.",
    };
  }
  const classifications = records.filter((r) => r.kind === "CLASSIFICATION");
  const prev = classifications.length ? classifications[classifications.length - 1] : null;
  const evidence = records
    .filter((r) => r.kind === "EVIDENCE" || r.kind === "AGENT_FINDING")
    .slice(-6)
    .map((r) => r.summary);

  const changed: string[] = [];
  if (current && prev) {
    const prevBand = prev.detail.find((d) => d.label === "BAND")?.value ?? null;
    if (prevBand && prevBand !== current.risk.band) changed.push(`Classification moved from ${prevBand} to ${current.risk.band}`);
    const prevScore = Number(prev.detail.find((d) => d.label === "SCORE")?.value ?? NaN);
    if (Number.isFinite(prevScore) && current.risk.score !== null && Math.abs(prevScore - current.risk.score) >= 3)
      changed.push(`Risk score moved ${prevScore} → ${current.risk.score}`);
    if (prev.confidence !== null && Math.abs(prev.confidence - current.confidence.score) >= 5)
      changed.push(`Confidence moved ${prev.confidence} → ${current.confidence.score}`);
  }

  const first = records[0];
  const last = records[records.length - 1];
  return {
    seenBefore: true,
    firstSeen: first ? first.t : null,
    lastSeen: last ? last.t : null,
    recordCount: records.length,
    previousClassification: prev ? prev.summary : null,
    previousConfidence: prev ? prev.confidence : null,
    previousEvidence: evidence,
    changedSince: changed,
    note: prev
      ? "Prior conclusions are surfaced for review, not reused. The current pass re-derives its own classification."
      : "Prior records exist but no classification was recorded for this target.",
  };
}

/** Similar past cases, matched on recorded classification and chain — never invented. */
export function similarCases(a: Assessment, limit = 5): { record: MemoryRecord; basis: string }[] {
  const chain = a.pair.chainId;
  const band = a.risk.band;
  return getMemory()
    .filter((r) => r.kind === "CLASSIFICATION" && r.targetKey !== a.pair.key)
    .map((r) => {
      const sameBand = r.detail.find((d) => d.label === "BAND")?.value === band;
      const sameChain = r.detail.find((d) => d.label === "CHAIN")?.value === chain;
      const basis = [sameBand ? "same recorded classification" : null, sameChain ? "same chain" : null]
        .filter(Boolean)
        .join(" · ");
      return { record: r, basis, score: (sameBand ? 2 : 0) + (sameChain ? 1 : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || y.record.t - x.record.t)
    .slice(0, limit)
    .map(({ record, basis }) => ({ record, basis }));
}

/* --------------------------- write-through API ------------------------ */

const CHAIN_BASE = ["DEX SCREENER API", "RAW OBSERVATION"];

/** Persist the full intelligence result of one assessment pass. */
export function commitAssessment(a: Assessment, opts: { jobId?: string | null; source?: string } = {}): number {
  const source = opts.source ?? "ASSESSMENT PASS";
  const label = `${a.pair.baseSymbol}/${a.pair.quoteSymbol} · ${a.pair.chainId}/${a.pair.dexId}`;
  const jobId = opts.jobId ?? null;
  let written = 0;
  const bump = (r: MemoryRecord | null) => {
    if (r) written++;
  };

  bump(
    remember({
      kind: "OBSERVATION",
      source,
      targetKey: a.pair.key,
      targetLabel: label,
      summary: `Observation recorded at price ${a.pair.priceUsd ?? "DATA UNAVAILABLE"}`,
      provenance: [...CHAIN_BASE],
      confidence: a.confidence.score,
      detail: [
        { label: "LIQUIDITY USD", value: String(a.pair.liquidityUsd ?? "NOT AVAILABLE") },
        { label: "VOLUME 24H", value: String(a.pair.volume.h24 ?? "NOT AVAILABLE") },
        { label: "CHAIN", value: a.pair.chainId },
      ],
      jobId,
      dedupeMs: 4 * 60_000,
    }),
  );

  bump(
    remember({
      kind: "CLASSIFICATION",
      source: a.risk.engineVersion,
      targetKey: a.pair.key,
      targetLabel: label,
      summary: a.risk.score === null ? "Risk not classifiable — INSUFFICIENT DATA" : `${a.risk.band} (${a.risk.score}/100)`,
      provenance: [...CHAIN_BASE, "RISK ENGINE", "CONCLUSION"],
      confidence: a.confidence.score,
      detail: [
        { label: "BAND", value: a.risk.band },
        { label: "SCORE", value: String(a.risk.score ?? "NOT AVAILABLE") },
        { label: "CHAIN", value: a.pair.chainId },
        { label: "SCORED DIMENSIONS", value: String(a.risk.factors.filter((f) => f.dataAvailable).length) },
      ],
      jobId,
      dedupeMs: 15 * 60_000,
    }),
  );

  bump(
    remember({
      kind: "CONFIDENCE",
      source: "CONFIDENCE ENGINE",
      targetKey: a.pair.key,
      targetLabel: label,
      summary: `Confidence ${a.confidence.band} (${a.confidence.score}/100)`,
      provenance: [...CHAIN_BASE, "CONFIDENCE ENGINE"],
      confidence: a.confidence.score,
      detail: [
        { label: "COMPLETENESS", value: `${a.confidence.completeness}%` },
        { label: "FRESHNESS", value: `${a.confidence.freshnessSeconds}s` },
      ],
      jobId,
      dedupeMs: 15 * 60_000,
    }),
  );

  for (const st of statementsOf(a).slice(0, 8)) {
    bump(
      remember({
        kind: "AGENT_FINDING",
        source: `${st.agentNumber} ${st.name}`,
        targetKey: a.pair.key,
        targetLabel: label,
        summary: `${st.vote} — ${st.claims[0] ?? "no observation returned"}`,
        provenance: [...CHAIN_BASE, "ANALYSIS", `${st.agentNumber} ${st.name}`, "EVIDENCE"],
        confidence: st.confidence,
        detail: st.support.slice(0, 4),
        jobId,
        dedupeMs: 20 * 60_000,
      }),
    );
    for (const claim of st.claims.slice(0, 2)) {
      bump(
        remember({
          kind: "EVIDENCE",
          source: `${st.agentNumber} ${st.name}`,
          targetKey: a.pair.key,
          targetLabel: label,
          summary: claim,
          provenance: [...CHAIN_BASE, "ANALYSIS", `${st.agentNumber} ${st.name}`, "EVIDENCE"],
          confidence: st.confidence,
          detail: st.support.slice(0, 3),
          jobId,
          dedupeMs: 30 * 60_000,
        }),
      );
    }
  }

  for (const c of contradictionsOf(a)) {
    bump(
      remember({
        kind: "CONTRADICTION",
        source: "CONTRADICTION ENGINE",
        targetKey: a.pair.key,
        targetLabel: label,
        summary: `${c.topic}: ${c.sideA.vote} vs ${c.sideB.vote}`,
        provenance: [...CHAIN_BASE, "ANALYSIS", "AGENT SUITE", "CONTRADICTION ENGINE"],
        confidence: null,
        detail: [
          { label: c.sideA.vote, value: c.sideA.agents.join(", ") },
          { label: c.sideB.vote, value: c.sideB.agents.join(", ") },
        ],
        jobId,
        dedupeMs: 30 * 60_000,
      }),
    );
  }

  for (const h of hypothesesOf(a)) {
    bump(
      remember({
        kind: "HYPOTHESIS",
        source: "HYPOTHESIS ENGINE",
        targetKey: a.pair.key,
        targetLabel: label,
        summary: h.statement,
        provenance: [...CHAIN_BASE, "ANALYSIS", "AGENT SUITE", "EVIDENCE", "HYPOTHESIS"],
        confidence: null,
        detail: [{ label: "STANDING", value: h.standing }],
        jobId,
        dedupeMs: 30 * 60_000,
      }),
    );
  }

  const minority = minorityOf(a);
  if (minority) {
    bump(
      remember({
        kind: "IMPORTANT_EVENT",
        source: "MINORITY OPINION",
        targetKey: a.pair.key,
        targetLabel: label,
        summary: `Minority view preserved: ${minority.vote} (${minority.share})`,
        provenance: [...CHAIN_BASE, "AGENT SUITE", "MINORITY OPINION"],
        confidence: null,
        detail: [{ label: "AGENTS", value: minority.agents.join(", ") }],
        jobId,
        dedupeMs: 30 * 60_000,
      }),
    );
  }

  if (written) {
    emitEvent({
      type: "MEMORY_WRITTEN",
      source: "MEMORY ENGINE",
      target: label,
      targetKey: a.pair.key,
      message: `${written} intelligence records persisted from this pass`,
      confidence: a.confidence.score,
    });
  }
  return written;
}
