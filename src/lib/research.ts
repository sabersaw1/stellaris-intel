/**
 * RESEARCH DEPTH, MULTI-PASS EXECUTION, CONTINUITY, DATA WAITING
 *
 * A job's pass state is stored alongside the job record. A pass only advances
 * when the work of that pass actually ran against available data; a pass whose
 * required inputs are missing sets WAITING FOR DATA with the exact source, field,
 * target and reason, and resumes automatically once the field appears.
 */

import { createStore, newId } from "./persist";
import { emitEvent } from "./events";
import { getJobs, type ResearchJob } from "./jobs";
import type { Assessment } from "./dex-types";

export const RESEARCH_ENGINE_VERSION = "research-engine v2.0";

export type Depth = "QUICK" | "STANDARD" | "DEEP" | "EXTREME / LAB";

export type DepthProfile = {
  depth: Depth;
  agentCount: number;
  historicalDepth: number;
  passes: number;
  dataSources: string[];
  budgetApiCalls: number;
  description: string;
};

export const DEPTH_PROFILES: Record<Depth, DepthProfile> = {
  QUICK: {
    depth: "QUICK",
    agentCount: 3,
    historicalDepth: 2,
    passes: 2,
    dataSources: ["DEX SCREENER"],
    budgetApiCalls: 2,
    description: "Minimal analysis: discovery and evidence only.",
  },
  STANDARD: {
    depth: "STANDARD",
    agentCount: 5,
    historicalDepth: 10,
    passes: 4,
    dataSources: ["DEX SCREENER", "LOCAL OBSERVATION HISTORY"],
    budgetApiCalls: 5,
    description: "Normal analysis: discovery, evidence, contradiction, synthesis.",
  },
  DEEP: {
    depth: "DEEP",
    agentCount: 8,
    historicalDepth: 60,
    passes: 6,
    dataSources: ["DEX SCREENER", "LOCAL OBSERVATION HISTORY", "MEMORY"],
    budgetApiCalls: 12,
    description: "All agents plus historical review and monitoring.",
  },
  "EXTREME / LAB": {
    depth: "EXTREME / LAB",
    agentCount: 8,
    historicalDepth: 500,
    passes: 6,
    dataSources: ["DEX SCREENER", "LOCAL OBSERVATION HISTORY", "MEMORY", "FOMO (WAITING FOR CREDENTIAL)"],
    budgetApiCalls: 25,
    description: "Maximum configured depth. External sources that are not configured are skipped and marked.",
  },
};

export const PASS_PLAN = [
  { n: 1, name: "DISCOVERY", why: "Establish the raw observation and which required fields are present" },
  { n: 2, name: "EVIDENCE", why: "Run the agent suite and record structured evidence" },
  { n: 3, name: "CONTRADICTION", why: "Detect and record disagreement between agent readings" },
  { n: 4, name: "HISTORICAL", why: "Compare against recorded observations and prior research" },
  { n: 5, name: "SYNTHESIS", why: "Consolidate classification, confidence and hypotheses" },
  { n: 6, name: "MONITORING", why: "Watch the conditions that would change the conclusion" },
] as const;

export type WaitingFor = {
  source: string;
  field: string;
  target: string;
  reason: string;
};

export type JobMeta = {
  jobId: string;
  targetKey: string;
  depth: Depth;
  passIndex: number;
  totalPasses: number;
  passName: string;
  passWhy: string;
  remaining: string[];
  waitingFor: WaitingFor[];
  continuedFrom: string | null;
  mergedFrom: string[];
  createdAt: number;
  updatedAt: number;
  history: { t: number; pass: number; name: string; outcome: string }[];
};

const store = createStore<Record<string, JobMeta>>("dmi.jobmeta.v1", {});
export const subscribeResearch = store.subscribe;

export function getMeta(jobId: string): JobMeta | null {
  return store.get()[jobId] ?? null;
}

export function allMeta(): JobMeta[] {
  return Object.values(store.get()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function setDepth(jobId: string, depth: Depth) {
  const meta = getMeta(jobId);
  if (!meta) return;
  const profile = DEPTH_PROFILES[depth];
  store.update((cur) => ({
    ...cur,
    [jobId]: { ...meta, depth, totalPasses: profile.passes, updatedAt: Date.now() },
  }));
}

function missingFields(a: Assessment): WaitingFor[] {
  const target = `${a.pair.baseSymbol}/${a.pair.quoteSymbol} · ${a.pair.chainId}`;
  const out: WaitingFor[] = [];
  if (a.pair.priceUsd === null)
    out.push({ source: "DEX SCREENER", field: "priceUsd", target, reason: "Price is required before any valuation-related pass can run" });
  if (a.pair.liquidityUsd === null)
    out.push({ source: "DEX SCREENER", field: "liquidity.usd", target, reason: "Liquidity depth is required for turnover and thinness analysis" });
  if (a.pair.txns.h24 === null)
    out.push({ source: "DEX SCREENER", field: "txns.h24", target, reason: "Transaction counts are required for order-flow analysis" });
  if (a.pair.pairCreatedAt === null)
    out.push({ source: "DEX SCREENER", field: "pairCreatedAt", target, reason: "Creation time is required to assess market age" });
  if (!a.peerContext.available)
    out.push({ source: "PEER SNAPSHOT", field: "peer baseline", target, reason: "Anomaly detection requires enough comparable observations in the same snapshot" });
  return out;
}

/**
 * Advance the pass state of a job for one completed assessment pass.
 * Returns the updated meta. Never advances past available data.
 */
export function advancePass(job: ResearchJob, a: Assessment, historyPoints: number, depth: Depth = "STANDARD"): JobMeta {
  const now = Date.now();
  const existing = getMeta(job.id);
  const profile = DEPTH_PROFILES[existing?.depth ?? depth];
  const waiting = missingFields(a);

  const plannedIndex = Math.min(profile.passes, (existing?.passIndex ?? 0) + 1);
  // HISTORICAL pass cannot run without recorded history; hold at the previous pass.
  const historicalBlocked = plannedIndex >= 4 && historyPoints < 2;
  const blocked = waiting.length >= 3 || historicalBlocked;
  const passIndex = blocked ? Math.max(1, existing?.passIndex ?? 1) : plannedIndex;
  const plan = PASS_PLAN[Math.min(passIndex, PASS_PLAN.length) - 1]!;

  if (historicalBlocked)
    waiting.push({
      source: "LOCAL OBSERVATION HISTORY",
      field: "recorded observations",
      target: job.targetLabel,
      reason: `Historical pass requires at least 2 recorded observations; ${historyPoints} recorded so far`,
    });

  const remaining = PASS_PLAN.filter((p) => p.n > passIndex && p.n <= profile.passes).map((p) => `PASS ${p.n} ${p.name} — ${p.why}`);

  const meta: JobMeta = {
    jobId: job.id,
    targetKey: job.targetKey,
    depth: existing?.depth ?? depth,
    passIndex,
    totalPasses: profile.passes,
    passName: blocked ? "WAITING FOR DATA" : plan.name,
    passWhy: blocked ? "Required inputs are not present; the pass is held rather than estimated" : plan.why,
    remaining,
    waitingFor: waiting,
    continuedFrom: existing?.continuedFrom ?? null,
    mergedFrom: existing?.mergedFrom ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    history: [
      ...(existing?.history ?? []),
      {
        t: now,
        pass: passIndex,
        name: blocked ? "WAITING FOR DATA" : plan.name,
        outcome: blocked
          ? `Held: ${waiting.map((w) => w.field).join(", ")} unavailable`
          : `Completed against ${a.risk.score === null ? "unclassifiable" : `${a.risk.band} (${a.risk.score})`} at confidence ${a.confidence.score}`,
      },
    ].slice(-24),
  };

  store.update((cur) => ({ ...cur, [job.id]: meta }));

  if (blocked && (!existing || existing.passName !== "WAITING FOR DATA")) {
    emitEvent({
      type: "RESEARCH_WAITING_FOR_DATA",
      source: RESEARCH_ENGINE_VERSION,
      target: job.targetLabel,
      targetKey: job.targetKey,
      message: `Pass held — missing ${waiting.map((w) => `${w.source}:${w.field}`).join(", ")}`,
      severity: "NOTABLE",
      status: "OPEN",
    });
  } else if (!blocked && existing?.passName === "WAITING FOR DATA") {
    emitEvent({
      type: "RESEARCH_RESUMED",
      source: RESEARCH_ENGINE_VERSION,
      target: job.targetLabel,
      targetKey: job.targetKey,
      message: `Required data became available — resumed at PASS ${passIndex} ${plan.name}`,
      severity: "INFO",
    });
  } else if (!blocked) {
    emitEvent({
      type: "RESEARCH_PASS_COMPLETED",
      source: RESEARCH_ENGINE_VERSION,
      target: job.targetLabel,
      targetKey: job.targetKey,
      message: `PASS ${passIndex}/${profile.passes} ${plan.name} completed`,
    });
  }
  return meta;
}

/* --------------------------- research continuity ---------------------- */

export function priorJobsFor(targetKey: string): ResearchJob[] {
  return getJobs().filter((j) => j.targetKey === targetKey);
}

/** Mark a job as continuing a previous investigation of the same target. */
export function continueInvestigation(jobId: string, previousJobId: string) {
  const meta = getMeta(jobId);
  if (!meta) return;
  store.update((cur) => ({ ...cur, [jobId]: { ...meta, continuedFrom: previousJobId, updatedAt: Date.now() } }));
}

/* --------------------------- duplicate research ----------------------- */

export type DuplicateGroup = { targetKey: string; targetLabel: string; jobIds: string[]; note: string };

export function duplicateResearch(): DuplicateGroup[] {
  const byTarget = new Map<string, ResearchJob[]>();
  for (const j of getJobs()) {
    byTarget.set(j.targetKey, [...(byTarget.get(j.targetKey) ?? []), j]);
  }
  return [...byTarget.entries()]
    .filter(([, jobs]) => jobs.length > 1)
    .map(([targetKey, jobs]) => ({
      targetKey,
      targetLabel: jobs[0]!.targetLabel,
      jobIds: jobs.map((j) => j.id),
      note: `${jobs.length} jobs address the same target — passes are coordinated so the data source is queried once per cycle`,
    }));
}

export function mergeDuplicates(group: DuplicateGroup) {
  const [keep, ...rest] = group.jobIds;
  if (!keep) return;
  const meta = getMeta(keep);
  if (meta) store.update((cur) => ({ ...cur, [keep]: { ...meta, mergedFrom: [...new Set([...meta.mergedFrom, ...rest])], updatedAt: Date.now() } }));
  emitEvent({
    type: "DUPLICATE_RESEARCH_MERGED",
    source: RESEARCH_ENGINE_VERSION,
    target: group.targetLabel,
    targetKey: group.targetKey,
    message: `${rest.length} duplicate job(s) merged into ${keep}`,
  });
}

export function newMetaId() {
  return newId("meta");
}

export function clearResearchMeta() {
  store.clear();
}
