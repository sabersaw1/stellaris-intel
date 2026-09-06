/**
 * RESEARCH JOB MANAGER
 *
 * A research job is a real unit of work: it re-runs the deterministic engines
 * (metrics, risk, confidence, anomaly, agent suite) over a target and records
 * the result it obtained, along with the reason the job was created.
 *
 * Job status reflects what actually happened. A job that could not obtain the
 * data it needs stays WAITING_FOR_DATA; it is never advanced for appearance.
 * Jobs live in this browser only until a backend is connected.
 */

import type { Assessment } from "./dex-types";
import type { AttentionItem } from "./attention";
import { contradictionsOf, hypothesesOf, minorityOf } from "./reasoning";

const KEY = "dmi.jobs.v1";
const MAX_JOBS = 120;

export type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_FOR_DATA"
  | "DEBATING"
  | "SYNTHESIZING"
  | "MONITORING"
  | "COMPLETE"
  | "FAILED";

export type JobOrigin =
  | "ATTENTION ENGINE"
  | "ANOMALY ENGINE"
  | "USER"
  | "CONTRADICTION ENGINE"
  | "HISTORICAL ENGINE";

export type ResearchJob = {
  id: string;
  targetKey: string;
  targetLabel: string;
  targetType: "PAIR";
  origin: JobOrigin;
  reason: string;
  priority: number;
  urgency: "ROUTINE" | "ELEVATED" | "IMMEDIATE";
  assignedAgents: string[];
  requiredData: string[];
  missingData: string[];
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  apiCalls: number;
  retries: number;
  findings: string[];
  contradictions: number;
  hypotheses: number;
  minorityVote: string | null;
  recurring: boolean;
};

const listeners = new Set<() => void>();

function read(): ResearchJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ResearchJob[]) : [];
  } catch {
    return [];
  }
}

function write(jobs: ResearchJob[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(jobs.slice(0, MAX_JOBS)));
  } catch {
    /* storage unavailable — jobs simply are not retained */
  }
  listeners.forEach((l) => l());
}

export function subscribeJobs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getJobs(): ResearchJob[] {
  return read().sort((a, b) => b.priority - a.priority || b.updatedAt - a.updatedAt);
}

export function jobFor(targetKey: string): ResearchJob | null {
  return read().find((j) => j.targetKey === targetKey) ?? null;
}

function requiredFields(a: Assessment) {
  const need: { label: string; present: boolean }[] = [
    { label: "PRICE USD", present: a.pair.priceUsd !== null },
    { label: "LIQUIDITY USD", present: a.pair.liquidityUsd !== null },
    { label: "VOLUME 24H", present: a.pair.volume.h24 !== null },
    { label: "TRANSACTIONS 24H", present: a.pair.txns.h24 !== null },
    { label: "PAIR CREATION TIME", present: a.pair.pairCreatedAt !== null },
    { label: "PEER BASELINE", present: a.peerContext.available },
  ];
  return {
    required: need.map((n) => n.label),
    missing: need.filter((n) => !n.present).map((n) => n.label),
  };
}

/**
 * Creates a job for an attention item, or updates the existing one for that
 * target with the result of the current pass.
 */
export function upsertJob(
  item: AttentionItem,
  origin: JobOrigin,
  reason: string,
  opts: { recurring?: boolean } = {},
): ResearchJob {
  const a = item.assessment;
  const { required, missing } = requiredFields(a);
  const contradictions = contradictionsOf(a);
  const hypotheses = hypothesesOf(a);
  const minority = minorityOf(a);

  const findings: string[] = [];
  if (a.risk.score !== null) findings.push(`${a.risk.band} — ${a.risk.score}/100 (${a.risk.engineVersion})`);
  else findings.push("Risk not classifiable: fewer than four scored dimensions");
  findings.push(`Confidence ${a.confidence.band} (${a.confidence.score}/100)`);
  findings.push(
    `Agent consensus: ${a.consensus.agree} aligned, ${a.consensus.disagree} dissenting, ${a.consensus.unresolved} unresolved`,
  );
  for (const an of a.anomalies.slice(0, 4)) findings.push(`${an.severity}: ${an.what}`);

  const status: JobStatus = missing.length >= 3
    ? "WAITING_FOR_DATA"
    : contradictions.length
      ? "DEBATING"
      : a.anomalies.length
        ? "SYNTHESIZING"
        : "MONITORING";

  const now = Date.now();
  const jobs = read();
  const existing = jobs.find((j) => j.targetKey === a.pair.key);

  const next: ResearchJob = {
    id: existing?.id ?? `job-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    targetKey: a.pair.key,
    targetLabel: `${a.pair.baseSymbol}/${a.pair.quoteSymbol} · ${a.pair.chainId}/${a.pair.dexId}`,
    targetType: "PAIR",
    origin,
    reason,
    priority: item.score ?? 0,
    urgency: item.klass === "CRITICAL" ? "IMMEDIATE" : item.klass === "HIGH PRIORITY" ? "ELEVATED" : "ROUTINE",
    assignedAgents: a.agents.map((g) => `${g.agentNumber} ${g.name}`),
    requiredData: required,
    missingData: missing,
    status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    completedAt: status === "MONITORING" ? now : null,
    apiCalls: (existing?.apiCalls ?? 0) + 1,
    retries: existing?.retries ?? 0,
    findings,
    contradictions: contradictions.length,
    hypotheses: hypotheses.length,
    minorityVote: minority ? `${minority.vote} (${minority.share})` : null,
    recurring: opts.recurring ?? existing?.recurring ?? true,
  };

  write([next, ...jobs.filter((j) => j.targetKey !== a.pair.key)]);
  return next;
}

export function cancelJob(id: string) {
  write(read().filter((j) => j.id !== id));
}

export function clearJobs() {
  write([]);
}

export const JOB_ENGINE_VERSION = "research-job-manager v1.0";
