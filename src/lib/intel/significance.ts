/**
 * SIGNIFICANCE ENGINE (pure, deterministic, cheap)
 *
 * Sits between the event engine and anything expensive. Deep research, alerts
 * and watchlist updates are only worth spending on a change that is actually
 * unusual, so this layer decides — locally, with no network call and no model —
 * whether a canonical event deserves more processing.
 *
 * It is explainable by construction: every decision returns the exact drivers
 * that produced it, so the interface can always answer "why am I seeing this?".
 */

import type { CanonicalEvent } from "./canonical";

export type SignificanceLevel = "IGNORED" | "NOTED" | "SIGNIFICANT" | "URGENT";

export type Significance = {
  level: SignificanceLevel;
  /** 0..100, derived only from the drivers below. Not a hidden "AI score". */
  weight: number;
  drivers: string[];
  /** True when the significance engine wants a research pass. */
  triggersResearch: boolean;
  /** True when the operator should be interrupted. */
  triggersAlert: boolean;
};

/** Kinds that are meaningful the first time they happen, regardless of size. */
const INHERENTLY_SIGNIFICANT = new Set([
  "TOKEN_DISCOVERED",
  "NEW_PAIR",
  "GRADUATED",
  "TOKEN_RISK_CHANGED",
  "TOKEN_DETERIORATION",
]);

/** Kinds that only matter when the magnitude is unusual. */
const MAGNITUDE_DRIVEN = new Set([
  "VOLUME_CHANGED",
  "LIQUIDITY_CHANGED",
  "PRICE_CHANGED",
  "TRANSACTION_ACTIVITY_CHANGED",
  "HOLDER_CHANGED",
  "SOCIAL_MENTION_SPIKE",
  "SOCIAL_ACCELERATION",
  "NARRATIVE_ACCELERATION",
]);

export type SignificanceContext = {
  /** How many canonical events this entity produced in the current window. */
  entityEventCount?: number;
  /** Baseline comparison result, when enough history exists. */
  baselineUnusual?: boolean | null;
  /** True when the entity is on the operator's watchlist. */
  watched?: boolean;
};

export function assessSignificance(e: CanonicalEvent, ctx: SignificanceContext = {}): Significance {
  const drivers: string[] = [];
  let weight = 0;

  if (INHERENTLY_SIGNIFICANT.has(e.kind)) {
    weight += 45;
    drivers.push(`${e.kind.replaceAll("_", " ").toLowerCase()} is meaningful on first observation`);
  }

  const magnitude = Math.abs(e.changePct ?? 0);
  if (MAGNITUDE_DRIVEN.has(e.kind) && magnitude > 0) {
    if (magnitude >= 2) {
      weight += 45;
      drivers.push(`${e.field ?? "value"} moved ${Math.round(magnitude * 100)}% — far outside its threshold`);
    } else if (magnitude >= 1) {
      weight += 30;
      drivers.push(`${e.field ?? "value"} moved ${Math.round(magnitude * 100)}%`);
    } else if (magnitude >= 0.4) {
      weight += 18;
      drivers.push(`${e.field ?? "value"} moved ${Math.round(magnitude * 100)}%`);
    } else {
      weight += 6;
      drivers.push(`${e.field ?? "value"} moved ${Math.round(magnitude * 100)}%, just past its threshold`);
    }
  }

  if (e.severity === "CRITICAL") {
    weight += 20;
    drivers.push("the event engine graded this CRITICAL");
  } else if (e.severity === "IMPORTANT") {
    weight += 10;
    drivers.push("the event engine graded this IMPORTANT");
  }

  if (e.sourceCount > 1) {
    weight += 15;
    drivers.push(`${e.sourceCount} independent providers observed the same change`);
  }
  if (e.verification === "ON-CHAIN VERIFIED") {
    weight += 10;
    drivers.push("an on-chain source confirmed it");
  }

  const count = ctx.entityEventCount ?? 0;
  if (count >= 3) {
    weight += 12;
    drivers.push(`${count} separate changes converged on this entity in the same cycle`);
  }

  if (ctx.baselineUnusual === true) {
    weight += 20;
    drivers.push("the move is unusual against this token's own recent baseline");
  } else if (ctx.baselineUnusual === null || ctx.baselineUnusual === undefined) {
    drivers.push("baseline comparison unavailable — not enough stored history yet");
  }

  if (ctx.watched) {
    weight += 10;
    drivers.push("the operator is watching this entity");
  }

  if (e.kind === "PROVIDER_ERROR" || e.kind === "DATA_STALE") {
    weight = Math.max(weight, 35);
    drivers.push("a provider problem affects data quality and must be visible");
  }

  weight = Math.max(0, Math.min(100, weight));
  const level: SignificanceLevel =
    weight >= 70 ? "URGENT" : weight >= 45 ? "SIGNIFICANT" : weight >= 20 ? "NOTED" : "IGNORED";

  return {
    level,
    weight,
    drivers,
    triggersResearch: level === "SIGNIFICANT" || level === "URGENT",
    triggersAlert: level === "URGENT",
  };
}

/** Counts canonical events per entity, used as significance context. */
export function eventCountsByEntity(events: CanonicalEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) out.set(e.entityId, (out.get(e.entityId) ?? 0) + 1);
  return out;
}
