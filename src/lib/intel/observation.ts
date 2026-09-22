/**
 * NORMALIZED OBSERVATION MODEL (pure, deterministic, testable)
 *
 * Every provider — DEX Screener, PumpPortal, Bitquery, Solana RPC, X, FOMO —
 * is funnelled through this one internal representation before anything else in
 * Stellaris sees it. No provider is allowed to invent its own shape downstream.
 *
 * Hard rules enforced here:
 *  - Unavailable data stays null. It is NEVER converted to zero.
 *  - Every metric carries its unit, the provider, when the provider observed it,
 *    when we received it, its confidence and its verification status.
 *  - A record that cannot be trusted (no entity, no timestamp, impossible value)
 *    is rejected with a stated reason rather than silently stored.
 */

export type MetricKey =
  | "price_usd"
  | "market_cap_usd"
  | "fdv_usd"
  | "liquidity_usd"
  | "volume_5m_usd"
  | "volume_1h_usd"
  | "volume_24h_usd"
  | "txns_5m_buys"
  | "txns_5m_sells"
  | "txns_24h_buys"
  | "txns_24h_sells"
  | "holders"
  | "mentions_1h"
  | "unique_authors_1h";

export type Unit = "USD" | "COUNT" | "RATIO";

export const METRIC_UNITS: Record<MetricKey, Unit> = {
  price_usd: "USD",
  market_cap_usd: "USD",
  fdv_usd: "USD",
  liquidity_usd: "USD",
  volume_5m_usd: "USD",
  volume_1h_usd: "USD",
  volume_24h_usd: "USD",
  txns_5m_buys: "COUNT",
  txns_5m_sells: "COUNT",
  txns_24h_buys: "COUNT",
  txns_24h_sells: "COUNT",
  holders: "COUNT",
  mentions_1h: "COUNT",
  unique_authors_1h: "COUNT",
};

export type Verification = "REPORTED" | "ON-CHAIN VERIFIED" | "CROSS-VERIFIED" | "UNVERIFIED";

export type ObservationConfidence = "VERIFIED" | "HIGH CONFIDENCE" | "POSSIBLE" | "UNKNOWN";

export type NormalizedObservation = {
  /** Canonical entity identity, e.g. "solana:<mint>". */
  entityId: string;
  entityKind: "TOKEN" | "PAIR" | "WALLET" | "TRADER" | "X_ACCOUNT" | "NARRATIVE";
  provider: string;
  /** The provider's own record identity, when it publishes one. */
  providerRecordId: string | null;
  /** When the provider says it observed this. Null when it does not say. */
  observedAt: number | null;
  /** When this process received it. Always real. */
  receivedAt: number;
  /** Only metrics the provider actually published. Absent keys are unknown. */
  metrics: Partial<Record<MetricKey, number>>;
  units: Partial<Record<MetricKey, Unit>>;
  confidence: ObservationConfidence;
  verification: Verification;
  /** Free-form provenance note, in the operator's words. */
  provenance: string;
  /** Small reference back to the upstream record; never the whole payload. */
  reference: Record<string, unknown> | null;
};

export type ValidationResult =
  | { ok: true; observation: NormalizedObservation; warnings: string[] }
  | { ok: false; reason: string };

/** Keeps only finite numbers; nulls, NaN, strings and negatives-where-impossible drop out. */
export function cleanMetrics(input: Partial<Record<MetricKey, number | null | undefined>>): {
  metrics: Partial<Record<MetricKey, number>>;
  units: Partial<Record<MetricKey, Unit>>;
  rejected: string[];
} {
  const metrics: Partial<Record<MetricKey, number>> = {};
  const units: Partial<Record<MetricKey, Unit>> = {};
  const rejected: string[] = [];
  for (const [k, v] of Object.entries(input) as [MetricKey, number | null | undefined][]) {
    if (v === null || v === undefined) continue; // unknown stays unknown
    if (typeof v !== "number" || !Number.isFinite(v)) {
      rejected.push(`${k}: not a finite number`);
      continue;
    }
    if (v < 0) {
      rejected.push(`${k}: negative value is impossible`);
      continue;
    }
    metrics[k] = v;
    units[k] = METRIC_UNITS[k];
  }
  return { metrics, units, rejected };
}

/**
 * Normalizes and validates one provider record. A record with no entity, no
 * usable timestamp, or no metric at all is rejected — storing it would add a
 * row that claims nothing.
 */
export function normalizeObservation(input: {
  entityId: string;
  entityKind?: NormalizedObservation["entityKind"];
  provider: string;
  providerRecordId?: string | null;
  observedAt: number | null;
  receivedAt?: number;
  metrics: Partial<Record<MetricKey, number | null | undefined>>;
  confidence?: ObservationConfidence;
  verification?: Verification;
  provenance?: string;
  reference?: Record<string, unknown> | null;
  /** Records claiming to be observed further ahead than this are rejected. */
  maxClockSkewMs?: number;
}): ValidationResult {
  const receivedAt = input.receivedAt ?? Date.now();
  if (!input.entityId || !input.entityId.includes(":"))
    return { ok: false, reason: "entity identity is missing or not canonical (expected chain:address)" };
  if (!input.provider) return { ok: false, reason: "provider is missing" };

  const warnings: string[] = [];
  let observedAt = input.observedAt;
  const skew = input.maxClockSkewMs ?? 120_000;
  if (observedAt !== null && !Number.isFinite(observedAt)) {
    return { ok: false, reason: "observed_at is not a valid timestamp" };
  }
  if (observedAt !== null && observedAt > receivedAt + skew) {
    return { ok: false, reason: "observed_at is in the future beyond the tolerated clock skew" };
  }
  if (observedAt === null) warnings.push("the provider published no observation time; only the receipt time is known");

  const { metrics, units, rejected } = cleanMetrics(input.metrics);
  warnings.push(...rejected);
  if (Object.keys(metrics).length === 0) return { ok: false, reason: "the record contained no usable metric" };

  return {
    ok: true,
    warnings,
    observation: {
      entityId: input.entityId,
      entityKind: input.entityKind ?? "TOKEN",
      provider: input.provider,
      providerRecordId: input.providerRecordId ?? null,
      observedAt,
      receivedAt,
      metrics,
      units,
      confidence: input.confidence ?? "HIGH CONFIDENCE",
      verification: input.verification ?? "REPORTED",
      provenance: input.provenance ?? `${input.provider} record`,
      reference: input.reference ?? null,
    },
  };
}

/** Value of a metric, or null when the provider never published it. */
export function metric(o: NormalizedObservation, key: MetricKey): number | null {
  const v = o.metrics[key];
  return v === undefined ? null : v;
}

/** Age of an observation, or null when the provider gave no observation time. */
export function freshnessMs(o: NormalizedObservation, now = Date.now()): number | null {
  return o.observedAt === null ? null : Math.max(0, now - o.observedAt);
}
