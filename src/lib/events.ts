/**
 * EVENT BUS
 *
 * One structured, traceable event architecture. Every subsystem publishes here;
 * the intelligence stream, incidents, audit log and neural visualisation all read
 * from this single log. Events are only emitted when something actually happened —
 * there is no synthetic traffic generator anywhere in this file.
 */

import { createStore, newId } from "./persist";

export type EventType =
  | "MARKET_CHANGED"
  | "ANOMALY_DETECTED"
  | "ATTENTION_RAISED"
  | "RESEARCH_CREATED"
  | "RESEARCH_PASS_COMPLETED"
  | "RESEARCH_WAITING_FOR_DATA"
  | "RESEARCH_RESUMED"
  | "RESEARCH_COMPLETED"
  | "AGENT_MESSAGE"
  | "AGENT_CONTRADICTION"
  | "CONFIDENCE_CHANGED"
  | "HYPOTHESIS_UPDATED"
  | "QUESTION_OPENED"
  | "QUESTION_RESOLVED"
  | "MEMORY_WRITTEN"
  | "MEMORY_RECALLED"
  | "INTEGRATION_CONNECTED"
  | "INTEGRATION_FAILED"
  | "INTEGRATION_NOT_CONFIGURED"
  | "WEBHOOK_RECEIVED"
  | "WORKFLOW_STARTED"
  | "WORKFLOW_COMPLETED"
  | "WORKFLOW_FAILED"
  | "WORKFLOW_DRY_RUN"
  | "DATA_STALE"
  | "RATE_LIMIT_GUARD"
  | "DUPLICATE_RESEARCH_MERGED"
  | "SYSTEM_EVENT";

export type EventSeverity = "INFO" | "NOTABLE" | "UNUSUAL" | "SEVERE";

export type SystemEvent = {
  id: string;
  t: number;
  type: EventType;
  source: string;
  target: string | null;
  targetKey: string | null;
  message: string;
  severity: EventSeverity;
  status: "RECORDED" | "OPEN" | "RESOLVED";
  confidence: number | null;
};

const MAX_EVENTS = 600;
const store = createStore<SystemEvent[]>("dmi.events.v1", []);

/** Collapse identical repeats inside this window so the stream stays honest. */
const DEDUPE_MS = 60_000;

export function emitEvent(e: {
  type: EventType;
  source: string;
  target?: string | null;
  targetKey?: string | null;
  message: string;
  severity?: EventSeverity;
  status?: SystemEvent["status"];
  confidence?: number | null;
}): SystemEvent | null {
  const now = Date.now();
  const list = store.get();
  const dupe = list.find(
    (x) => x.type === e.type && x.targetKey === (e.targetKey ?? null) && x.message === e.message && now - x.t < DEDUPE_MS,
  );
  if (dupe) return null;
  const event: SystemEvent = {
    id: newId("ev"),
    t: now,
    type: e.type,
    source: e.source,
    target: e.target ?? null,
    targetKey: e.targetKey ?? null,
    message: e.message,
    severity: e.severity ?? "INFO",
    status: e.status ?? "RECORDED",
    confidence: e.confidence ?? null,
  };
  store.set([event, ...list].slice(0, MAX_EVENTS));
  return event;
}

export function getEvents(): SystemEvent[] {
  return store.get();
}

export function eventsFor(targetKey: string): SystemEvent[] {
  return store.get().filter((e) => e.targetKey === targetKey);
}

export function eventsByType(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of store.get()) out[e.type] = (out[e.type] ?? 0) + 1;
  return out;
}

export function eventRate(windowMs = 300_000): number {
  const cut = Date.now() - windowMs;
  return store.get().filter((e) => e.t >= cut).length;
}

export const subscribeEvents = store.subscribe;
export const clearEvents = store.clear;
export const EVENT_BUS_VERSION = "event-bus v1.0";
