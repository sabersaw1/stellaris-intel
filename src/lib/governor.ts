/**
 * RESOURCE GOVERNOR
 *
 * Real accounting of the resources this application consumes: upstream request
 * budget, agent concurrency, research queue size, historical search depth and
 * local storage. Numbers come from actual counters — nothing is simulated. Where
 * a resource cannot be measured in the browser (host CPU, host memory) it reports
 * UNAVAILABLE rather than a fabricated figure.
 */

import { createStore } from "./persist";
import { storeFootprint } from "./persist";
import { getJobs } from "./jobs";
import { eventRate } from "./events";
import { duplicateResearch, DEPTH_PROFILES, type Depth } from "./research";

export const GOVERNOR_VERSION = "resource-governor v1.0";

export type GovernorSettings = {
  maxConcurrentJobs: number;
  maxScheduledPerCycle: number;
  defaultDepth: Depth;
  historicalDepth: number;
  apiBudgetPerMinute: number;
  fomoCreditBudget: number | null;
};

const DEFAULTS: GovernorSettings = {
  maxConcurrentJobs: 12,
  maxScheduledPerCycle: 12,
  defaultDepth: "STANDARD",
  historicalDepth: 60,
  apiBudgetPerMinute: 55,
  fomoCreditBudget: null,
};

const store = createStore<GovernorSettings>("dmi.governor.v1", DEFAULTS);
export const subscribeGovernor = store.subscribe;
export const getGovernor = store.get;

export function setGovernor(patch: Partial<GovernorSettings>) {
  store.update((cur) => ({ ...cur, ...patch }));
}

export function resetGovernor() {
  store.set(DEFAULTS);
}

export type ResourceRow = {
  resource: string;
  used: string;
  limit: string;
  utilisationPct: number | null;
  state: "OK" | "NEAR LIMIT" | "AT LIMIT" | "UNAVAILABLE";
  note: string;
};

export function resourceReport(api: { requests: number; cacheHits: number; rateLimitDeferrals: number } | null): ResourceRow[] {
  const s = store.get();
  const jobs = getJobs();
  const active = jobs.filter((j) => j.status !== "COMPLETE" && j.status !== "FAILED").length;
  const dupes = duplicateResearch().length;
  const bytes = storeFootprint().reduce((sum, r) => sum + r.bytes, 0);

  const pct = (used: number, limit: number) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null);
  const stateOf = (p: number | null): ResourceRow["state"] => (p === null ? "UNAVAILABLE" : p >= 100 ? "AT LIMIT" : p >= 80 ? "NEAR LIMIT" : "OK");

  const rows: ResourceRow[] = [];

  const jobPct = pct(active, s.maxConcurrentJobs);
  rows.push({
    resource: "ACTIVE RESEARCH JOBS",
    used: String(active),
    limit: String(s.maxConcurrentJobs),
    utilisationPct: jobPct,
    state: stateOf(jobPct),
    note: "Jobs beyond the limit stay queued rather than issuing extra upstream requests",
  });

  if (api) {
    const apiPct = pct(api.requests, s.apiBudgetPerMinute);
    rows.push({
      resource: "UPSTREAM REQUESTS (SERVER PROCESS)",
      used: String(api.requests),
      limit: `${s.apiBudgetPerMinute} / 60s window`,
      utilisationPct: apiPct,
      state: api.rateLimitDeferrals > 0 ? "NEAR LIMIT" : stateOf(apiPct),
      note: `${api.cacheHits} responses served from cache; ${api.rateLimitDeferrals} request(s) deferred by the rate-limit guard`,
    });
  } else {
    rows.push({
      resource: "UPSTREAM REQUESTS (SERVER PROCESS)",
      used: "UNAVAILABLE",
      limit: `${s.apiBudgetPerMinute} / 60s window`,
      utilisationPct: null,
      state: "UNAVAILABLE",
      note: "Server counters could not be read in this render",
    });
  }

  rows.push({
    resource: "DUPLICATE RESEARCH",
    used: String(dupes),
    limit: "0 preferred",
    utilisationPct: null,
    state: dupes ? "NEAR LIMIT" : "OK",
    note: dupes ? "Duplicate targets detected — merge to avoid repeating the same upstream work" : "No duplicate targets detected",
  });

  rows.push({
    resource: "LOCAL INTELLIGENCE STORE",
    used: `${(bytes / 1024).toFixed(1)} KB`,
    limit: "browser storage quota",
    utilisationPct: null,
    state: bytes > 4_000_000 ? "NEAR LIMIT" : "OK",
    note: "Records are held in this browser only — WAITING FOR SUPABASE for durable, cross-device storage",
  });

  rows.push({
    resource: "EVENT THROUGHPUT",
    used: `${eventRate(300_000)} events / 5m`,
    limit: "no configured cap",
    utilisationPct: null,
    state: "OK",
    note: "Counted from the event bus; only real events are recorded",
  });

  rows.push({
    resource: "HOST CPU / MEMORY",
    used: "UNAVAILABLE",
    limit: "UNAVAILABLE",
    utilisationPct: null,
    state: "UNAVAILABLE",
    note: "Host process metrics are not exposed to this runtime — no figure is displayed rather than an invented one",
  });

  rows.push({
    resource: "FOMO CREDITS",
    used: "UNAVAILABLE",
    limit: s.fomoCreditBudget === null ? "WAITING FOR CREDENTIAL" : String(s.fomoCreditBudget),
    utilisationPct: null,
    state: "UNAVAILABLE",
    note: "Credit usage can only be read once a FOMO credential is configured server-side",
  });

  return rows;
}

export function depthProfile(depth?: Depth) {
  return DEPTH_PROFILES[depth ?? store.get().defaultDepth];
}
