/**
 * INCIDENTS + AUDIT LOG
 *
 * Incidents are opened from real failures observed by the running system: upstream
 * API failures, connector failures, missing data, workflow failures and agent
 * errors. The audit log records configuration changes the user actually made.
 * Neither ever stores a secret value.
 */

import { createStore, newId } from "./persist";
import { emitEvent } from "./events";

export const INCIDENT_VERSION = "incident-system v1.0";

export type IncidentKind =
  | "API FAILURE"
  | "INTEGRATION FAILURE"
  | "DATA FAILURE"
  | "WORKFLOW FAILURE"
  | "AGENT FAILURE"
  | "SYSTEM FAILURE";

export type Incident = {
  id: string;
  kind: IncidentKind;
  title: string;
  what: string;
  why: string;
  affected: string;
  action: string;
  openedAt: number;
  lastSeenAt: number;
  occurrences: number;
  status: "OPEN" | "RESOLVED";
  source: string;
};

const store = createStore<Incident[]>("dmi.incidents.v1", []);
export const subscribeIncidents = store.subscribe;

export function getIncidents(): Incident[] {
  return store.get().sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function openIncident(i: {
  kind: IncidentKind;
  title: string;
  what: string;
  why: string;
  affected: string;
  action: string;
  source: string;
}): Incident {
  const list = store.get();
  const prior = list.find((x) => x.title === i.title && x.status === "OPEN");
  const now = Date.now();
  if (prior) {
    const next = { ...prior, lastSeenAt: now, occurrences: prior.occurrences + 1, what: i.what };
    store.set(list.map((x) => (x.id === prior.id ? next : x)));
    return next;
  }
  const inc: Incident = { ...i, id: newId("inc"), openedAt: now, lastSeenAt: now, occurrences: 1, status: "OPEN" };
  store.set([inc, ...list].slice(0, 200));
  emitEvent({
    type: "SYSTEM_EVENT",
    source: i.source,
    message: `INCIDENT OPENED — ${i.title}`,
    severity: "UNUSUAL",
    status: "OPEN",
  });
  return inc;
}

export function resolveIncident(id: string) {
  store.set(store.get().map((x) => (x.id === id ? { ...x, status: "RESOLVED", lastSeenAt: Date.now() } : x)));
}

export function clearIncidents() {
  store.clear();
}

/* -------------------------------- audit ------------------------------- */

export type AuditEntry = {
  id: string;
  t: number;
  area: "INTEGRATION" | "ACCOUNT" | "WORKFLOW" | "PERMISSIONS" | "SETTINGS" | "ALERTS" | "SYSTEM" | "WORKSPACE";
  action: string;
  detail: string;
  actor: "LOCAL ANALYST";
};

const auditStore = createStore<AuditEntry[]>("dmi.audit.v1", []);
export const subscribeAudit = auditStore.subscribe;

const SECRETISH = /(key|secret|token|password|bearer)/i;

export function audit(area: AuditEntry["area"], action: string, detail: string) {
  // Never store a secret value: redact anything that names a credential with a value.
  const safe = SECRETISH.test(detail) ? detail.replace(/[:=]\s*\S+/g, ": [REDACTED]") : detail;
  auditStore.set(
    [{ id: newId("aud"), t: Date.now(), area, action, detail: safe, actor: "LOCAL ANALYST" as const }, ...auditStore.get()].slice(0, 300),
  );
}

export function getAudit(): AuditEntry[] {
  return auditStore.get();
}

export function clearAudit() {
  auditStore.clear();
}
