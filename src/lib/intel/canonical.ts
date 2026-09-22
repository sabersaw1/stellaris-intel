/**
 * CANONICAL EVENTS + CROSS-PROVIDER PROVENANCE (pure, deterministic)
 *
 * The problem this solves: PumpPortal, DEX Screener and Bitquery can all observe
 * the SAME underlying change. Three providers must not produce three unrelated
 * events and three alerts.
 *
 * Instead we compute a canonical identity that deliberately EXCLUDES the
 * provider, collapse matching events into one, and keep every provider that
 * observed it as provenance. When an independent source confirms a reported
 * observation, the canonical event is promoted to CROSS-VERIFIED.
 */

import type { StellarisEvent } from "../events/model";
import { minuteBucket } from "../events/model";

export type ProvenanceEntry = {
  provider: string;
  observedAt: number | null;
  receivedAt: number;
  beforeValue: number | null;
  afterValue: number | null;
  changePct: number | null;
  confidence: StellarisEvent["confidence"];
  /** True when this provider's view is independent on-chain confirmation. */
  independent: boolean;
};

export type CanonicalEvent = StellarisEvent & {
  /** Identity of the underlying real-world change, independent of provider. */
  canonicalKey: string;
  /** Every provider that observed this same change, in receipt order. */
  provenance: ProvenanceEntry[];
  /** Distinct provider count — 2+ means independent agreement. */
  sourceCount: number;
  verification: "REPORTED" | "CROSS-VERIFIED" | "ON-CHAIN VERIFIED";
};

/** Providers whose data is independent on-chain truth rather than a report. */
export const INDEPENDENT_PROVIDERS = new Set(["solana", "bitquery"]);

/**
 * Canonical identity: kind + entity + field + minute bucket. The provider is
 * intentionally absent, which is what allows cross-provider collapse.
 */
export function canonicalKey(e: StellarisEvent): string {
  const at = e.observedAt ?? e.receivedAt;
  return [e.kind, e.entityId, e.field ?? "-", String(minuteBucket(at))].join("|");
}

function toProvenance(e: StellarisEvent): ProvenanceEntry {
  return {
    provider: e.source,
    observedAt: e.observedAt,
    receivedAt: e.receivedAt,
    beforeValue: e.beforeValue,
    afterValue: e.afterValue,
    changePct: e.changePct,
    confidence: e.confidence,
    independent: INDEPENDENT_PROVIDERS.has(e.source),
  };
}

function verificationFor(provenance: ProvenanceEntry[]): CanonicalEvent["verification"] {
  const providers = new Set(provenance.map((p) => p.provider));
  const independent = provenance.some((p) => p.independent);
  if (independent && providers.size > 1) return "ON-CHAIN VERIFIED";
  if (providers.size > 1) return "CROSS-VERIFIED";
  return "REPORTED";
}

/**
 * Collapses a batch of provider events into canonical events with merged
 * provenance. The event that reported the largest magnitude of change becomes
 * the canonical representative, so the surviving summary is the strongest
 * actually-observed statement — never an average of guesses.
 */
export function canonicalize(events: StellarisEvent[]): CanonicalEvent[] {
  const byKey = new Map<string, CanonicalEvent>();
  for (const e of events) {
    const key = canonicalKey(e);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...e,
        canonicalKey: key,
        provenance: [toProvenance(e)],
        sourceCount: 1,
        verification: verificationFor([toProvenance(e)]),
      });
      continue;
    }
    const already = existing.provenance.some(
      (p) => p.provider === e.source && p.observedAt === e.observedAt && p.afterValue === e.afterValue,
    );
    const provenance = already ? existing.provenance : [...existing.provenance, toProvenance(e)];
    const stronger = Math.abs(e.changePct ?? 0) > Math.abs(existing.changePct ?? 0);
    const base = stronger ? { ...e } : {};
    const merged: CanonicalEvent = {
      ...existing,
      ...base,
      canonicalKey: key,
      provenance,
      sourceCount: new Set(provenance.map((p) => p.provider)).size,
      verification: verificationFor(provenance),
    };
    /* The dedup key follows the surviving representative so the database row
       stays consistent with the summary the operator reads. */
    merged.dedupKey = existing.dedupKey;
    byKey.set(key, merged);
  }
  return [...byKey.values()];
}

/** Human-readable provenance line, e.g. "observed by dexscreener, bitquery". */
export function provenanceLine(e: CanonicalEvent): string {
  const providers = [...new Set(e.provenance.map((p) => p.provider))];
  const verified = e.verification === "REPORTED" ? "" : ` — ${e.verification}`;
  return `observed by ${providers.join(", ")}${verified}`;
}

/** Reference payload stored alongside the event row; no migration required. */
export function canonicalReference(e: CanonicalEvent): Record<string, unknown> {
  return {
    ...(e.reference ?? {}),
    canonical_key: e.canonicalKey,
    verification: e.verification,
    source_count: e.sourceCount,
    provenance: e.provenance.map((p) => ({
      provider: p.provider,
      observed_at: p.observedAt,
      received_at: p.receivedAt,
      change_pct: p.changePct,
      independent: p.independent,
    })),
  };
}
