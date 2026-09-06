/**
 * LIVE TELEMETRY
 *
 * Every value here is read from real application state: store sizes, event
 * counters, job states, agent runs and server API counters. Anything that cannot
 * be measured from this runtime reports UNAVAILABLE.
 */

import { storeFootprint } from "./persist";
import { eventRate, getEvents } from "./events";
import { getJobs } from "./jobs";
import { getMemory } from "./memory";
import { getHypotheses } from "./hypotheses";
import { getContradictions } from "./contradictions";
import { getQuestions } from "./questions";
import { getCases } from "./calibration";
import { getExecutions, getWorkflows } from "./workflows";
import { getIncidents } from "./incidents";
import { getAlerts } from "./local-store";
import { freshnessOf, type Freshness } from "./freshness";

export type TelemetryRow = { label: string; value: string; detail: string; state: "MEASURED" | "UNAVAILABLE" };

export function telemetry(observedAt: number | null, api: { requests: number; cacheHits: number; errors: number } | null): TelemetryRow[] {
  const jobs = getJobs();
  const events = getEvents();
  const bytes = storeFootprint().reduce((s, r) => s + r.bytes, 0);

  const rows: TelemetryRow[] = [
    { label: "EVENTS RECORDED", value: String(events.length), detail: `${eventRate(300_000)} in the last 5 minutes`, state: "MEASURED" },
    {
      label: "ACTIVE JOBS",
      value: String(jobs.filter((j) => j.status !== "COMPLETE" && j.status !== "FAILED").length),
      detail: `${jobs.filter((j) => j.status === "WAITING_FOR_DATA").length} waiting for data`,
      state: "MEASURED",
    },
    { label: "MEMORY RECORDS", value: String(getMemory().length), detail: "Stored in this browser", state: "MEASURED" },
    { label: "HYPOTHESES", value: String(getHypotheses().length), detail: `${getHypotheses().filter((h) => h.status === "CONTESTED").length} contested`, state: "MEASURED" },
    { label: "CONTRADICTIONS", value: String(getContradictions().length), detail: `${getContradictions().filter((c) => c.status !== "RESOLVED BY EVIDENCE").length} unresolved`, state: "MEASURED" },
    { label: "OPEN QUESTIONS", value: String(getQuestions().filter((q) => q.status === "OPEN").length), detail: `${getQuestions().length} recorded in total`, state: "MEASURED" },
    { label: "CALIBRATION CASES", value: String(getCases().length), detail: `${getCases().filter((c) => c.outcome).length} resolved`, state: "MEASURED" },
    { label: "WORKFLOWS", value: String(getWorkflows().length), detail: `${getWorkflows().filter((w) => w.active).length} active, ${getExecutions().length} executions recorded`, state: "MEASURED" },
    { label: "INCIDENTS OPEN", value: String(getIncidents().filter((i) => i.status === "OPEN").length), detail: "Opened from real failures only", state: "MEASURED" },
    { label: "ALERTS", value: String(getAlerts().length), detail: `${getAlerts().filter((a) => !a.acknowledged).length} unacknowledged`, state: "MEASURED" },
    { label: "LOCAL STORE SIZE", value: `${(bytes / 1024).toFixed(1)} KB`, detail: "WAITING FOR SUPABASE for durable storage", state: "MEASURED" },
    {
      label: "OBSERVATION FRESHNESS",
      value: freshnessOf(observedAt),
      detail: observedAt ? new Date(observedAt).toLocaleTimeString([], { hour12: false }) : "no timestamp",
      state: observedAt ? "MEASURED" : "UNAVAILABLE",
    },
    api
      ? { label: "UPSTREAM REQUESTS", value: String(api.requests), detail: `${api.cacheHits} cache hits, ${api.errors} errors`, state: "MEASURED" as const }
      : { label: "UPSTREAM REQUESTS", value: "UNAVAILABLE", detail: "Server counters not available in this render", state: "UNAVAILABLE" as const },
    { label: "HOST CPU", value: "UNAVAILABLE", detail: "Not exposed to this runtime", state: "UNAVAILABLE" },
    { label: "HOST MEMORY", value: "UNAVAILABLE", detail: "Not exposed to this runtime", state: "UNAVAILABLE" },
    { label: "WEBSOCKET CONNECTIONS", value: "UNAVAILABLE", detail: "The current data source exposes no stream — UNSUPPORTED", state: "UNAVAILABLE" },
  ];
  return rows;
}

export function freshnessBuckets(observations: { observedAt: number }[]): Record<Freshness, number> {
  const out: Record<Freshness, number> = { LIVE: 0, RECENT: 0, DELAYED: 0, STALE: 0, HISTORICAL: 0, UNAVAILABLE: 0 };
  for (const o of observations) out[freshnessOf(o.observedAt)]++;
  return out;
}
