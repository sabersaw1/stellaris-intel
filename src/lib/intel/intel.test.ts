import { describe, expect, it } from "vitest";

import { assessActivity, baselineFor, isUnusual } from "./baseline";
import { canonicalKey, canonicalize, provenanceLine } from "./canonical";
import { collectionMode, describeGap, statusFromError } from "./gaps";
import { cleanMetrics, freshnessMs, normalizeObservation } from "./observation";
import { assessSignificance, eventCountsByEntity } from "./significance";
import type { StellarisEvent } from "../events/model";

const ev = (over: Partial<StellarisEvent>): StellarisEvent => ({
  dedupKey: "k",
  kind: "VOLUME_CHANGED",
  entityKind: "TOKEN",
  entityId: "solana:mint1",
  source: "dexscreener",
  observedAt: 1_000_000,
  receivedAt: 1_000_000,
  field: "volume_24h_usd",
  beforeValue: 100,
  afterValue: 300,
  changePct: 2,
  confidence: "HIGH CONFIDENCE",
  summary: "volume up",
  severity: "CRITICAL",
  reference: null,
  ...over,
});

describe("normalized observations", () => {
  it("keeps unknown metrics unknown instead of zero", () => {
    const { metrics } = cleanMetrics({ price_usd: 1.5, liquidity_usd: null, volume_24h_usd: undefined });
    expect(metrics).toEqual({ price_usd: 1.5 });
    expect("liquidity_usd" in metrics).toBe(false);
  });

  it("rejects impossible and non-numeric values", () => {
    const { metrics, rejected } = cleanMetrics({ liquidity_usd: -5, holders: Number.NaN });
    expect(metrics).toEqual({});
    expect(rejected).toHaveLength(2);
  });

  it("rejects a record with no entity identity", () => {
    const r = normalizeObservation({ entityId: "mint1", provider: "dexscreener", observedAt: null, metrics: { price_usd: 1 } });
    expect(r.ok).toBe(false);
  });

  it("rejects a record with no usable metric", () => {
    const r = normalizeObservation({ entityId: "solana:m", provider: "dexscreener", observedAt: null, metrics: { price_usd: null } });
    expect(r.ok).toBe(false);
  });

  it("rejects future observation times beyond tolerated skew", () => {
    const now = 1_000_000;
    const r = normalizeObservation({
      entityId: "solana:m",
      provider: "dexscreener",
      observedAt: now + 600_000,
      receivedAt: now,
      metrics: { price_usd: 1 },
    });
    expect(r.ok).toBe(false);
  });

  it("warns when the provider published no observation time", () => {
    const r = normalizeObservation({ entityId: "solana:m", provider: "x", observedAt: null, metrics: { mentions_1h: 4 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings.join(" ")).toContain("no observation time");
      expect(freshnessMs(r.observation)).toBeNull();
    }
  });
});

describe("canonical events and provenance", () => {
  it("gives the same canonical key to different providers observing one change", () => {
    expect(canonicalKey(ev({ source: "dexscreener" }))).toBe(canonicalKey(ev({ source: "bitquery" })));
  });

  it("collapses multi-provider observations into one event with provenance", () => {
    const out = canonicalize([ev({ source: "dexscreener" }), ev({ source: "bitquery", changePct: 3 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sourceCount).toBe(2);
    expect(out[0]!.verification).toBe("ON-CHAIN VERIFIED");
    expect(out[0]!.changePct).toBe(3); // strongest actually-observed statement survives
    expect(provenanceLine(out[0]!)).toContain("dexscreener");
  });

  it("leaves a single-source event REPORTED", () => {
    const out = canonicalize([ev({})]);
    expect(out[0]!.verification).toBe("REPORTED");
    expect(out[0]!.sourceCount).toBe(1);
  });

  it("does not merge different entities", () => {
    expect(canonicalize([ev({}), ev({ entityId: "solana:mint2" })])).toHaveLength(2);
  });
});

describe("significance", () => {
  it("promotes a large multi-source move to URGENT and triggers research", () => {
    const c = canonicalize([ev({ source: "dexscreener" }), ev({ source: "bitquery" })])[0]!;
    const s = assessSignificance(c, { baselineUnusual: true });
    expect(s.level).toBe("URGENT");
    expect(s.triggersResearch).toBe(true);
    expect(s.drivers.length).toBeGreaterThan(2);
  });

  it("ignores a marginal single-source move", () => {
    const c = canonicalize([ev({ changePct: 0.41, severity: "NOTABLE" })])[0]!;
    const s = assessSignificance(c, { baselineUnusual: false });
    expect(s.triggersAlert).toBe(false);
    expect(s.weight).toBeLessThan(45);
  });

  it("states plainly when a baseline could not be computed", () => {
    const c = canonicalize([ev({})])[0]!;
    expect(assessSignificance(c, {}).drivers.join(" ")).toContain("baseline comparison unavailable");
  });

  it("counts converging events per entity", () => {
    const counts = eventCountsByEntity(canonicalize([ev({ field: "a" }), ev({ field: "b" }), ev({ entityId: "solana:x" })]));
    expect(counts.get("solana:mint1")).toBe(2);
  });
});

describe("baselines and activity", () => {
  const point = (t: number, v: number) => ({ observedAt: t, values: { volume_24h_usd: v, liquidity_usd: v, price_usd: v } });

  it("refuses a baseline from too little history", () => {
    const b = baselineFor([point(1000, 10)], "volume_24h_usd", "1h", 2000);
    expect(b.state).toBe("INSUFFICIENT EVIDENCE");
    expect(isUnusual(b, 999)).toBeNull();
  });

  it("computes a baseline once enough observations exist", () => {
    const now = 3_600_000 * 2;
    const b = baselineFor([point(now - 1000, 10), point(now - 800, 12), point(now - 600, 11)], "volume_24h_usd", "1h", now);
    expect(b.state).toBe("AVAILABLE");
    if (b.state === "AVAILABLE") expect(b.samples).toBe(3);
  });

  it("returns INSUFFICIENT EVIDENCE with a single observation", () => {
    const a = assessActivity([point(1000, 10)]);
    expect(a.state).toBe("INSUFFICIENT EVIDENCE");
    expect(a.unknowns.length).toBeGreaterThan(0);
  });

  it("flags deterioration when liquidity collapses", () => {
    const now = 3_600_000 * 2;
    const history = [
      { observedAt: now - 2400, values: { liquidity_usd: 100_000, volume_24h_usd: 10, price_usd: 1 } },
      { observedAt: now - 1800, values: { liquidity_usd: 90_000, volume_24h_usd: 11, price_usd: 1 } },
      { observedAt: now - 600, values: { liquidity_usd: 20_000, volume_24h_usd: 12, price_usd: 1 } },
    ];
    const a = assessActivity(history, { now });
    expect(a.state).toBe("DETERIORATING");
    expect(a.contradictions.join(" ")).toContain("liquidity has fallen");
  });

  it("always reports unavailable evidence as unknown, never as absence of risk", () => {
    const now = 3_600_000 * 2;
    const a = assessActivity([point(now - 900, 10), point(now - 600, 10), point(now - 300, 10)], { now });
    expect(a.unknowns.join(" ")).toContain("social verification is unavailable");
  });
});

describe("collection truthfulness", () => {
  it("never claims monitoring for an unconfigured provider", () => {
    const g = describeGap({ provider: "x", lastSuccessAt: null, expectedIntervalMs: 60_000, configured: false });
    expect(g.statement).toContain("NOT CONNECTED");
  });

  it("states a gap when data stopped arriving", () => {
    const now = 1_000_000;
    const g = describeGap({ provider: "dexscreener", lastSuccessAt: now - 500_000, expectedIntervalMs: 60_000, configured: true, now });
    expect(g.gapped).toBe(true);
    expect(g.statement).toContain("was not monitored");
  });

  it("separates quota exhaustion from being offline", () => {
    expect(statusFromError({ configured: true, httpStatus: 429 })).toBe("QUOTA_EXHAUSTED");
    expect(statusFromError({ configured: true, httpStatus: 503 })).toBe("OFFLINE");
    expect(statusFromError({ configured: true, error: "fetch failed" })).toBe("OFFLINE");
    expect(statusFromError({ configured: false })).toBe("NOT_CONNECTED");
    expect(statusFromError({ configured: true })).toBe("CONNECTED");
  });

  it("describes hybrid collection without claiming continuous monitoring", () => {
    const m = collectionMode({ pollingActive: true, boundedWindowActive: true });
    expect(m.mode).toBe("HYBRID");
    expect(m.statement).toContain("not observed");
    expect(m.statement.toLowerCase()).not.toContain("24/7");
  });
});
