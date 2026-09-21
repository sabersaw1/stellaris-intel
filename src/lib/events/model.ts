/**
 * EVENT MODEL (pure, deterministic, testable)
 *
 * Every provider observation is normalised into an internal event. Events are
 * the backbone of the system: the radar, timelines, alerts, research triggers
 * and the agent API all read from them.
 *
 * Two rules matter most:
 *  1. An event exists only when something ACTUALLY changed by a meaningful
 *     amount. Re-observing the same value never creates an event.
 *  2. Every event carries its source, timestamps, before/after values and a
 *     confidence. Nothing is invented; unknown stays null.
 */

export type EventKind =
  | "TOKEN_DISCOVERED"
  | "NEW_PAIR"
  | "LIQUIDITY_CHANGED"
  | "VOLUME_CHANGED"
  | "TRANSACTION_ACTIVITY_CHANGED"
  | "PRICE_CHANGED"
  | "HOLDER_CHANGED"
  | "WALLET_BOUGHT"
  | "WALLET_SOLD"
  | "TRADER_ENTERED"
  | "TRADER_EXITED"
  | "SOCIAL_MENTION_SPIKE"
  | "SOCIAL_ACCELERATION"
  | "NEW_NARRATIVE"
  | "NARRATIVE_ACCELERATION"
  | "TOKEN_RISK_CHANGED"
  | "TOKEN_DETERIORATION"
  | "TOKEN_ACCELERATION"
  | "LIFECYCLE_CHANGED"
  | "GRADUATED"
  | "PROVIDER_ERROR"
  | "DATA_STALE"
  | "RESEARCH_TRIGGERED";

export type EntityKind = "TOKEN" | "PAIR" | "TRADER" | "WALLET" | "X_ACCOUNT" | "NARRATIVE" | "PROVIDER" | "SYSTEM";

export type Confidence = "VERIFIED" | "HIGH CONFIDENCE" | "POSSIBLE" | "UNKNOWN";

export type StellarisEvent = {
  /** Stable dedup identity; see dedupKey(). */
  dedupKey: string;
  kind: EventKind;
  entityKind: EntityKind;
  /** Canonical entity identity, e.g. "solana:<mint>". */
  entityId: string;
  source: string;
  /** When the source observed it (null when the source does not say). */
  observedAt: number | null;
  /** When this process received it. Always real. */
  receivedAt: number;
  field: string | null;
  beforeValue: number | null;
  afterValue: number | null;
  /** Relative change, when both sides are known. */
  changePct: number | null;
  confidence: Confidence;
  /** Plain-English reason the event exists — powers "WHY AM I SEEING THIS?". */
  summary: string;
  severity: "INFO" | "NOTABLE" | "IMPORTANT" | "CRITICAL";
  reference: Record<string, unknown> | null;
};

/** Minimum relative move, per field, before a change counts as an event. */
export const CHANGE_THRESHOLDS: Record<string, number> = {
  liquidity_usd: 0.15,
  volume_24h_usd: 0.4,
  volume_5m_usd: 1.0,
  price_usd: 0.1,
  txns_5m: 0.5,
  holders: 0.1,
  mentions_1h: 0.75,
  unique_authors_1h: 0.5,
};

/** Bucket used so repeated similar moves within a minute collapse into one event. */
export function minuteBucket(t: number): number {
  return Math.floor(t / 60_000);
}

export function dedupKey(parts: {
  kind: EventKind;
  entityId: string;
  field?: string | null;
  at: number;
}): string {
  return [parts.kind, parts.entityId, parts.field ?? "-", String(minuteBucket(parts.at))].join("|");
}

export function relativeChange(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  if (before === 0) return after === 0 ? 0 : null; // growth from zero is not a ratio
  return (after - before) / Math.abs(before);
}

export function severityFor(changePct: number | null): StellarisEvent["severity"] {
  if (changePct === null) return "INFO";
  const m = Math.abs(changePct);
  if (m >= 2) return "CRITICAL";
  if (m >= 1) return "IMPORTANT";
  if (m >= 0.3) return "NOTABLE";
  return "INFO";
}

export type ChangeCandidate = {
  kind: EventKind;
  entityKind: EntityKind;
  entityId: string;
  source: string;
  field: string;
  before: number | null;
  after: number | null;
  observedAt: number | null;
  receivedAt?: number;
  confidence?: Confidence;
  label?: string;
  reference?: Record<string, unknown> | null;
};

/**
 * Turns an observed value change into an event, or null when the change is not
 * meaningful. This is the guard that stops the database filling with noise.
 */
export function changeEvent(c: ChangeCandidate): StellarisEvent | null {
  const receivedAt = c.receivedAt ?? Date.now();
  const changePct = relativeChange(c.before, c.after);
  const threshold = CHANGE_THRESHOLDS[c.field] ?? 0.2;

  if (c.after === null) return null; // nothing observed: never an event
  if (c.before === null) return null; // first observation is a discovery, not a change
  if (changePct === null) return null;
  if (Math.abs(changePct) < threshold) return null;

  const dir = changePct > 0 ? "increased" : "decreased";
  const label = c.label ?? c.field.replace(/_/g, " ");
  return {
    dedupKey: dedupKey({ kind: c.kind, entityId: c.entityId, field: c.field, at: c.observedAt ?? receivedAt }),
    kind: c.kind,
    entityKind: c.entityKind,
    entityId: c.entityId,
    source: c.source,
    observedAt: c.observedAt,
    receivedAt,
    field: c.field,
    beforeValue: c.before,
    afterValue: c.after,
    changePct,
    confidence: c.confidence ?? "HIGH CONFIDENCE",
    summary: `${label} ${dir} ${Math.abs(Math.round(changePct * 100))}% (${c.before} -> ${c.after}) per ${c.source}`,
    severity: severityFor(changePct),
    reference: c.reference ?? null,
  };
}

export function discoveryEvent(c: {
  entityKind: EntityKind;
  entityId: string;
  source: string;
  observedAt: number | null;
  summary: string;
  kind?: EventKind;
  confidence?: Confidence;
  reference?: Record<string, unknown> | null;
}): StellarisEvent {
  const receivedAt = Date.now();
  const kind = c.kind ?? "TOKEN_DISCOVERED";
  return {
    dedupKey: dedupKey({ kind, entityId: c.entityId, field: null, at: c.observedAt ?? receivedAt }),
    kind,
    entityKind: c.entityKind,
    entityId: c.entityId,
    source: c.source,
    observedAt: c.observedAt,
    receivedAt,
    field: null,
    beforeValue: null,
    afterValue: null,
    changePct: null,
    confidence: c.confidence ?? "VERIFIED",
    summary: c.summary,
    severity: "NOTABLE",
    reference: c.reference ?? null,
  };
}

/** Collapses a batch so one dedup key yields at most one event. */
export function dedupe(events: StellarisEvent[]): StellarisEvent[] {
  const seen = new Map<string, StellarisEvent>();
  for (const e of events) {
    const prev = seen.get(e.dedupKey);
    if (!prev) seen.set(e.dedupKey, e);
    else if (Math.abs(e.changePct ?? 0) > Math.abs(prev.changePct ?? 0)) seen.set(e.dedupKey, e);
  }
  return [...seen.values()];
}

/** Events that justify spending expensive reasoning. */
export const RESEARCH_TRIGGERS: EventKind[] = [
  "TOKEN_DISCOVERED",
  "NEW_PAIR",
  "TOKEN_ACCELERATION",
  "VOLUME_CHANGED",
  "LIQUIDITY_CHANGED",
  "SOCIAL_ACCELERATION",
  "SOCIAL_MENTION_SPIKE",
  "TRADER_ENTERED",
  "WALLET_BOUGHT",
  "GRADUATED",
  "TOKEN_RISK_CHANGED",
  "NARRATIVE_ACCELERATION",
];

export function shouldTriggerResearch(e: StellarisEvent): boolean {
  if (!RESEARCH_TRIGGERS.includes(e.kind)) return false;
  if (e.kind === "TOKEN_DISCOVERED" || e.kind === "NEW_PAIR" || e.kind === "GRADUATED") return true;
  return e.severity === "IMPORTANT" || e.severity === "CRITICAL";
}
