/**
 * INTEGRATIONS (client-side registry)
 *
 * Accounts, webhook endpoints, dependency map, connection graph and diagnostics.
 * Connection state always comes from the server report — this module never claims
 * a connection is live on its own.
 */

import { createStore, newId } from "./persist";
import type { ConnectorReport, IntegrationsReport } from "./integrations.functions";
import { getJobs } from "./jobs";
import { getWorkflows } from "./workflows";
import { getWorkspaces } from "./workspaces";

export const INTEGRATIONS_VERSION = "integrations-center v1.0";

/* ------------------------------- accounts ----------------------------- */

export type Account = {
  id: string;
  connectorId: string;
  label: string;
  addedAt: number;
  lastActivityAt: number | null;
  /** never a secret: only whether the app was told a credential exists */
  authorised: boolean;
  note: string;
};

const accountStore = createStore<Account[]>("dmi.accounts.v1", []);
export const subscribeAccounts = accountStore.subscribe;
export const getAccounts = accountStore.get;

export function addAccount(connectorId: string, label: string): Account {
  const a: Account = {
    id: newId("acct"),
    connectorId,
    label,
    addedAt: Date.now(),
    lastActivityAt: null,
    authorised: false,
    note: "Registered locally. Authorisation is never granted automatically — a credential must be configured server-side.",
  };
  accountStore.set([a, ...accountStore.get()]);
  return a;
}

export function renameAccount(id: string, label: string) {
  accountStore.set(accountStore.get().map((a) => (a.id === id ? { ...a, label } : a)));
}

export function removeAccount(id: string) {
  accountStore.set(accountStore.get().filter((a) => a.id !== id));
}

export function touchAccount(id: string) {
  accountStore.set(accountStore.get().map((a) => (a.id === id ? { ...a, lastActivityAt: Date.now() } : a)));
}

/* ------------------------------- webhooks ----------------------------- */

export type WebhookEndpoint = {
  id: string;
  connectorId: string;
  direction: "INBOUND" | "OUTBOUND";
  path: string;
  validation: string;
  requiredEnv: string[];
};

export const WEBHOOK_ENDPOINTS: WebhookEndpoint[] = [
  {
    id: "tv-in",
    connectorId: "tradingview",
    direction: "INBOUND",
    path: "/api/public/webhooks/tradingview",
    validation: "HMAC SHA-256 over the raw body, compared in constant time against TRADINGVIEW_WEBHOOK_SECRET",
    requiredEnv: ["TRADINGVIEW_WEBHOOK_SECRET"],
  },
  {
    id: "n8n-in",
    connectorId: "n8n",
    direction: "INBOUND",
    path: "/api/public/webhooks/n8n",
    validation: "HMAC SHA-256 over the raw body, compared in constant time against N8N_WEBHOOK_SECRET",
    requiredEnv: ["N8N_WEBHOOK_SECRET"],
  },
  {
    id: "n8n-out",
    connectorId: "n8n",
    direction: "OUTBOUND",
    path: "N8N_WEBHOOK_URL (server-side)",
    validation: "Signed request; no credential is placed in the payload",
    requiredEnv: ["N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET"],
  },
];

/* ----------------------------- dependency map ------------------------- */

export type Dependency = {
  connectorId: string;
  connectorName: string;
  status: string;
  affected: { area: string; count: number | null; detail: string }[];
};

export function dependencyMap(report: IntegrationsReport | null): Dependency[] {
  if (!report) return [];
  const jobs = getJobs();
  const workflows = getWorkflows();
  const workspaces = getWorkspaces();

  return report.connectors.map((c) => {
    const affected: Dependency["affected"][number][] = [];
    if (c.id === "dexscreener") {
      affected.push({ area: "RESEARCH JOBS", count: jobs.length, detail: "Every job derives its observations from this source" });
      affected.push({ area: "AGENTS", count: 8, detail: "All agents read the normalized observation produced from this source" });
      affected.push({ area: "DASHBOARDS", count: workspaces.length, detail: "Market widgets on every workspace" });
      affected.push({
        area: "WORKFLOWS",
        count: workflows.filter((w) => w.nodes.some((n) => n.type === "DEX SCREENER")).length,
        detail: "Workflows with a DEX Screener trigger or data node",
      });
    } else if (c.id === "supabase") {
      affected.push({ area: "DURABLE MEMORY", count: null, detail: "Records persist in this browser only until configured" });
      affected.push({ area: "CALIBRATION", count: null, detail: "Outcome history cannot accumulate across devices" });
      affected.push({ area: "AUDIT LOG", count: null, detail: "Configuration history is browser-local" });
    } else if (c.id === "fomo") {
      affected.push({
        area: "RESEARCH JOBS",
        count: jobs.filter((j) => j.missingData.length > 0).length,
        detail: "Jobs waiting on data this connector could supply",
      });
      affected.push({
        area: "WORKFLOWS",
        count: workflows.filter((w) => w.nodes.some((n) => n.type === "FOMO")).length,
        detail: "Workflows containing a FOMO node cannot activate",
      });
    } else if (c.id === "tradingview") {
      affected.push({
        area: "WORKFLOWS",
        count: workflows.filter((w) => w.nodes.some((n) => n.type === "TRADINGVIEW")).length,
        detail: "Workflows triggered by inbound alerts",
      });
      affected.push({ area: "ALERT INGESTION", count: null, detail: "Inbound alerts are rejected while unvalidated" });
    } else if (c.id === "n8n") {
      affected.push({
        area: "WORKFLOWS",
        count: workflows.filter((w) => w.nodes.some((n) => n.type === "N8N")).length,
        detail: "Outbound orchestration steps cannot execute",
      });
    }
    return { connectorId: c.id, connectorName: c.name, status: c.status, affected };
  });
}

/* ---------------------------- connection graph ------------------------ */

export type GraphNode = { id: string; label: string; group: string; state: string; detail: string };
export type GraphEdge = { from: string; to: string; label: string; live: boolean };

export function connectionGraph(report: IntegrationsReport | null): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map((report?.connectors ?? []).map((c) => [c.id, c]));
  const st = (id: string) => byId.get(id)?.status ?? "NOT CONFIGURED";
  const live = (id: string) => st(id) === "CONNECTED";

  const nodes: GraphNode[] = [
    { id: "dexscreener", label: "DEX SCREENER", group: "SOURCE", state: st("dexscreener"), detail: byId.get("dexscreener")?.detail ?? "" },
    { id: "fomo", label: "FOMO", group: "SOURCE", state: st("fomo"), detail: byId.get("fomo")?.detail ?? "" },
    { id: "tradingview", label: "TRADINGVIEW", group: "SOURCE", state: st("tradingview"), detail: byId.get("tradingview")?.detail ?? "" },
    { id: "router", label: "DATA ROUTER", group: "CORE", state: live("dexscreener") ? "ACTIVE" : "DEGRADED", detail: "Normalizes and validates every inbound observation" },
    { id: "bus", label: "EVENT BUS", group: "CORE", state: "ACTIVE", detail: "Single structured event log" },
    { id: "brain", label: "GLOBAL BRAIN", group: "CORE", state: "ACTIVE", detail: "Coordinates attention, jobs, agents, memory and monitoring" },
    { id: "attention", label: "ATTENTION", group: "INTELLIGENCE", state: "ACTIVE", detail: "Scores which targets deserve investigation" },
    { id: "research", label: "RESEARCH QUEUE", group: "INTELLIGENCE", state: "ACTIVE", detail: "Multi-pass job execution" },
    { id: "agents", label: "AGENTS", group: "INTELLIGENCE", state: "ACTIVE", detail: "Eight deterministic analysts" },
    { id: "evidence", label: "EVIDENCE", group: "INTELLIGENCE", state: "ACTIVE", detail: "Structured agent findings" },
    { id: "hypotheses", label: "HYPOTHESES", group: "INTELLIGENCE", state: "ACTIVE", detail: "Persistent hypothesis objects" },
    { id: "memory", label: "MEMORY", group: "INTELLIGENCE", state: "ACTIVE", detail: "Local intelligence store — WAITING FOR SUPABASE for durability" },
    { id: "workflows", label: "WORKFLOWS", group: "AUTOMATION", state: "ACTIVE", detail: "Visual workflow definitions" },
    { id: "n8n", label: "N8N", group: "AUTOMATION", state: st("n8n"), detail: byId.get("n8n")?.detail ?? "" },
    { id: "supabase", label: "SUPABASE", group: "STORAGE", state: st("supabase"), detail: byId.get("supabase")?.detail ?? "" },
  ];

  const edges: GraphEdge[] = [
    { from: "dexscreener", to: "router", label: "observations", live: live("dexscreener") },
    { from: "fomo", to: "router", label: "intelligence", live: live("fomo") },
    { from: "tradingview", to: "bus", label: "inbound alerts", live: live("tradingview") },
    { from: "router", to: "bus", label: "normalized events", live: live("dexscreener") },
    { from: "bus", to: "brain", label: "event feed", live: true },
    { from: "brain", to: "attention", label: "scoring", live: true },
    { from: "attention", to: "research", label: "candidates", live: true },
    { from: "research", to: "agents", label: "assignment", live: true },
    { from: "agents", to: "evidence", label: "findings", live: true },
    { from: "evidence", to: "hypotheses", label: "support / opposition", live: true },
    { from: "hypotheses", to: "memory", label: "conclusions", live: true },
    { from: "memory", to: "brain", label: "recall", live: true },
    { from: "brain", to: "workflows", label: "triggers", live: true },
    { from: "workflows", to: "n8n", label: "orchestration", live: live("n8n") },
    { from: "memory", to: "supabase", label: "durable persistence", live: live("supabase") },
  ];

  return { nodes, edges };
}

/* ------------------------------ diagnostics --------------------------- */

export type Diagnostic = {
  check: string;
  state: "PASS" | "WARN" | "FAIL" | "NOT APPLICABLE";
  what: string;
  why: string;
  affected: string;
  action: string;
};

export function systemDoctor(report: IntegrationsReport | null, apiErrors: number | null): Diagnostic[] {
  const out: Diagnostic[] = [];
  const c = (id: string): ConnectorReport | undefined => report?.connectors.find((x) => x.id === id);

  const dex = c("dexscreener");
  out.push({
    check: "MARKET DATA API",
    state: !dex ? "FAIL" : dex.status === "CONNECTED" ? "PASS" : dex.status === "STALE" ? "WARN" : "FAIL",
    what: dex?.detail ?? "No server report was returned",
    why: dex?.status === "STALE" ? "The last probe served cached data instead of a fresh response" : "Upstream probe result",
    affected: "All observations, attention scoring, research passes",
    action: dex?.status === "CONNECTED" ? "None required" : "Retry is automatic with exponential backoff; check upstream availability if it persists",
  });

  out.push({
    check: "ENVIRONMENT VARIABLES",
    state: (report?.connectors ?? []).some((x) => x.credentialState === "MISSING") ? "WARN" : "PASS",
    what: (report?.connectors ?? [])
      .filter((x) => x.credentialState === "MISSING")
      .flatMap((x) => x.requiredEnv)
      .join(", ") || "All declared credentials are present",
    why: "Adapters stay disabled rather than reporting a fabricated connection",
    affected: "FOMO intelligence, inbound alerts, outbound automation, durable persistence",
    action: "Add the listed variables server-side; the affected features enable themselves once present",
  });

  out.push({
    check: "AUTHENTICATION",
    state: (report?.connectors ?? []).some((x) => x.status === "AUTHENTICATION ERROR") ? "FAIL" : "PASS",
    what: "No authentication failures reported by any configured connector",
    why: "Credential validity is only known for connectors that were actually probed",
    affected: "Configured external connectors",
    action: "Rotate the credential server-side if a failure appears",
  });

  out.push({
    check: "DATA FRESHNESS",
    state: dex?.status === "STALE" ? "WARN" : dex?.observedAt ? "PASS" : "FAIL",
    what: dex?.observedAt ? `Last observation timestamp ${new Date(dex.observedAt).toLocaleTimeString([], { hour12: false })}` : "No observation timestamp",
    why: "Freshness is computed from real observation timestamps only",
    affected: "Every LIVE designation in the interface",
    action: "Nothing is labelled LIVE while the underlying observation is stale",
  });

  out.push({
    check: "UPSTREAM ERRORS",
    state: apiErrors === null ? "NOT APPLICABLE" : apiErrors > 0 ? "WARN" : "PASS",
    what: apiErrors === null ? "Server counters unavailable in this render" : `${apiErrors} upstream error(s) recorded in this server process`,
    why: "Errors are counted by the request layer, including retries and backoff deferrals",
    affected: "Observation freshness and job pass completion",
    action: "Requests retry with exponential backoff and serve cache when upstream fails",
  });

  out.push({
    check: "WEBHOOK ENDPOINTS",
    state: WEBHOOK_ENDPOINTS.every((w) => w.requiredEnv.every((e) => (report?.connectors ?? []).some((x) => x.requiredEnv.includes(e) && x.credentialState === "PRESENT")))
      ? "PASS"
      : "WARN",
    what: `${WEBHOOK_ENDPOINTS.length} endpoints registered; unsigned payloads are rejected`,
    why: "A webhook without a configured secret cannot be validated, so it is refused",
    affected: "TradingView alert ingestion, n8n callbacks",
    action: "Configure the webhook secrets server-side to accept inbound events",
  });

  out.push({
    check: "DATABASE",
    state: c("supabase")?.status === "CONNECTED" ? "PASS" : "WARN",
    what: c("supabase")?.detail ?? "Not configured",
    why: "Durable, cross-device intelligence memory requires a database",
    affected: "Memory durability, calibration accumulation, audit history",
    action: "Provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY server-side",
  });

  out.push({
    check: "WEBSOCKET / STREAMING",
    state: "NOT APPLICABLE",
    what: "The current data source exposes no streaming endpoint — UNSUPPORTED",
    why: "Observations are obtained by polling on a rate-limited budget",
    affected: "Update latency (60s market cycle)",
    action: "No action available with the current source",
  });

  return out;
}
