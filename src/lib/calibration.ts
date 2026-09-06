/**
 * CONFIDENCE CALIBRATION ARCHITECTURE
 *
 * Records the confidence attached to each classification, then waits for a later
 * observation of the same target to evaluate it. Until enough resolved cases
 * exist, every statistic reports INSUFFICIENT OUTCOME DATA — accuracy figures are
 * never manufactured.
 *
 * A case is resolvable only when the system later recorded an observation that
 * actually bears on the original classification.
 */

import { createStore, newId } from "./persist";
import type { Assessment } from "./dex-types";
import { getMemory } from "./memory";

export const CALIBRATION_ENGINE_VERSION = "calibration-engine v1.0";
/** Minimum resolved cases before any calibration percentage may be displayed. */
export const MIN_RESOLVED_CASES = 20;

export type CalibrationCase = {
  id: string;
  targetKey: string;
  targetLabel: string;
  recordedAt: number;
  classification: string;
  riskScore: number | null;
  confidence: number;
  confidenceBand: "LOW" | "MODERATE" | "HIGH";
  agents: string[];
  regime: string;
  researchType: string;
  /** filled only when a later recorded observation permits evaluation */
  outcome: {
    evaluatedAt: number;
    laterClassification: string;
    verdict: "CONSISTENT" | "INCONSISTENT" | "UNRESOLVED";
    basis: string;
  } | null;
};

const store = createStore<CalibrationCase[]>("dmi.calibration.v1", []);
const MAX = 400;

export const subscribeCalibration = store.subscribe;

export function getCases(): CalibrationCase[] {
  return store.get().sort((a, b) => b.recordedAt - a.recordedAt);
}

/** Market regime, derived from the peer snapshot the classification was made in. */
export function regimeOf(a: Assessment): string {
  if (!a.peerContext.available) return "REGIME NOT DETERMINABLE";
  const p = a.peerContext.vlRatioPercentile;
  if (p === null) return "REGIME NOT DETERMINABLE";
  if (p >= 80) return "HIGH TURNOVER REGIME";
  if (p >= 40) return "MIXED TURNOVER REGIME";
  return "LOW TURNOVER REGIME";
}

export function recordCalibrationCase(a: Assessment, researchType: string): CalibrationCase | null {
  if (a.risk.score === null) return null; // nothing to calibrate against
  const label = `${a.pair.baseSymbol}/${a.pair.quoteSymbol} · ${a.pair.chainId}/${a.pair.dexId}`;
  const list = store.get();
  const recent = list.find((c) => c.targetKey === a.pair.key && Date.now() - c.recordedAt < 30 * 60_000);
  if (recent) return recent;

  const c: CalibrationCase = {
    id: newId("cal"),
    targetKey: a.pair.key,
    targetLabel: label,
    recordedAt: Date.now(),
    classification: a.risk.band,
    riskScore: a.risk.score,
    confidence: a.confidence.score,
    confidenceBand: a.confidence.band,
    agents: a.agents.map((g) => `${g.agentNumber} ${g.name}`),
    regime: regimeOf(a),
    researchType,
    outcome: null,
  };
  store.set([c, ...list].slice(0, MAX));
  return c;
}

/**
 * Evaluate open cases against later stored classifications of the same target.
 * A case stays UNRESOLVED unless a strictly later classification record exists.
 */
export function evaluateOpenCases(): number {
  const mem = getMemory().filter((r) => r.kind === "CLASSIFICATION");
  let resolved = 0;
  const next = store.get().map((c) => {
    if (c.outcome) return c;
    const later = mem
      .filter((r) => r.targetKey === c.targetKey && r.t > c.recordedAt + 60_000)
      .sort((x, y) => y.t - x.t)[0];
    if (!later) return c;
    const laterBand = later.detail.find((d) => d.label === "BAND")?.value ?? null;
    if (!laterBand) return c;
    resolved++;
    return {
      ...c,
      outcome: {
        evaluatedAt: Date.now(),
        laterClassification: laterBand,
        verdict: laterBand === c.classification ? ("CONSISTENT" as const) : ("INCONSISTENT" as const),
        basis: `Later observation at ${new Date(later.t).toLocaleTimeString([], { hour12: false })} classified ${laterBand}`,
      },
    };
  });
  if (resolved) store.set(next);
  return resolved;
}

export type CalibrationSlice = {
  label: string;
  cases: number;
  resolved: number;
  consistent: number;
  inconsistent: number;
  unresolved: number;
  meanConfidence: number | null;
  /** null until MIN_RESOLVED_CASES resolved cases exist for this slice */
  observedConsistencyPct: number | null;
  state: "INSUFFICIENT OUTCOME DATA" | "MEASURED";
};

function slice(label: string, cases: CalibrationCase[]): CalibrationSlice {
  const resolved = cases.filter((c) => c.outcome && c.outcome.verdict !== "UNRESOLVED");
  const consistent = resolved.filter((c) => c.outcome?.verdict === "CONSISTENT").length;
  const enough = resolved.length >= MIN_RESOLVED_CASES;
  return {
    label,
    cases: cases.length,
    resolved: resolved.length,
    consistent,
    inconsistent: resolved.length - consistent,
    unresolved: cases.length - resolved.length,
    meanConfidence: cases.length ? Math.round(cases.reduce((s, c) => s + c.confidence, 0) / cases.length) : null,
    observedConsistencyPct: enough ? Math.round((consistent / resolved.length) * 100) : null,
    state: enough ? "MEASURED" : "INSUFFICIENT OUTCOME DATA",
  };
}

export function calibrationOverview() {
  const cases = getCases();
  return {
    overall: slice("ALL RECORDED CASES", cases),
    byBand: (["HIGH", "MODERATE", "LOW"] as const).map((b) => slice(`CONFIDENCE ${b}`, cases.filter((c) => c.confidenceBand === b))),
    byAgent: uniq(cases.flatMap((c) => c.agents)).map((agent) => slice(agent, cases.filter((c) => c.agents.includes(agent)))),
    byRegime: uniq(cases.map((c) => c.regime)).map((r) => slice(r, cases.filter((c) => c.regime === r))),
    byResearchType: uniq(cases.map((c) => c.researchType)).map((r) => slice(r, cases.filter((c) => c.researchType === r))),
    minResolvedRequired: MIN_RESOLVED_CASES,
    engineVersion: CALIBRATION_ENGINE_VERSION,
  };
}

/** Confidence movement for one target, from stored confidence records only. */
export function confidenceTrail(targetKey: string) {
  return getMemory()
    .filter((r) => r.kind === "CONFIDENCE" && r.targetKey === targetKey && r.confidence !== null)
    .sort((a, b) => a.t - b.t)
    .map((r) => ({ t: r.t, confidence: r.confidence as number }));
}

function uniq(v: string[]): string[] {
  return [...new Set(v)];
}

export function clearCalibration() {
  store.clear();
}
