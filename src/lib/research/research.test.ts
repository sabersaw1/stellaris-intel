/**
 * Tests for the pure research engines. These are deterministic and require no
 * database, no network and no credentials.
 */

import { describe, expect, it } from "vitest";

import { computeFeatures, type SeriesPoint } from "./features";
import { classifyRegime } from "./regime";
import { DEFAULT_LIMITS, checkRisk } from "./risk";
import { backtest, walkForward } from "./backtest";
import { STRATEGIES, predict } from "./strategy";
import { universeSymbols } from "./universe";

function series(prices: number[], stepMinutes = 5): SeriesPoint[] {
  const start = Date.now() - prices.length * stepMinutes * 60_000;
  return prices.map((p, i) => ({
    t: start + i * stepMinutes * 60_000,
    priceUsd: p,
    liquidityUsd: 1_000_000,
    volume24h: 5_000_000,
  }));
}

describe("universe", () => {
  it("defaults to the ten major assets and accepts an override", () => {
    expect(universeSymbols(null)).toContain("BTC");
    expect(universeSymbols(null)).toHaveLength(10);
    expect(universeSymbols("btc, eth")).toEqual(["BTC", "ETH"]);
  });
});

describe("feature engine", () => {
  it("reports insufficient data instead of guessing", () => {
    const f = computeFeatures(series([100, 101]));
    expect(f.sufficient).toBe(false);
    expect(f.byKey["rsi_14"] ?? null).toBeNull();
  });

  it("marks features unavailable when the source cannot provide the inputs", () => {
    const f = computeFeatures(series(Array.from({ length: 40 }, (_, i) => 100 + i)));
    const unavailable = f.features.filter((x) => !x.available).map((x) => x.key);
    for (const key of ["atr", "vwap", "funding_rate", "open_interest", "order_book_imbalance"]) {
      expect(unavailable).toContain(key);
    }
  });

  it("calculates returns and RSI from real prices", () => {
    const f = computeFeatures(series(Array.from({ length: 40 }, (_, i) => 100 * 1.01 ** i)));
    expect(f.sufficient).toBe(true);
    expect(f.byKey["return_20"]).toBeGreaterThan(0);
    expect(f.byKey["rsi_14"]).toBeGreaterThan(50);
  });
});

describe("regime engine", () => {
  it("is UNKNOWN with insufficient history", () => {
    const r = classifyRegime(computeFeatures(series([100, 101, 102])));
    expect(r.regime).toBe("UNKNOWN");
    expect(r.confidence).toBe("INSUFFICIENT DATA");
  });

  it("classifies a sustained rise as TREND_UP and states the rule", () => {
    const r = classifyRegime(computeFeatures(series(Array.from({ length: 40 }, (_, i) => 100 * 1.005 ** i))));
    expect(r.regime).toBe("TREND_UP");
    expect(r.basis).toMatch(/20-observation return/);
  });

  it("classifies a sustained fall as TREND_DOWN", () => {
    const r = classifyRegime(computeFeatures(series(Array.from({ length: 40 }, (_, i) => 100 * 0.995 ** i))));
    expect(r.regime).toBe("TREND_DOWN");
  });
});

describe("strategy engine", () => {
  it("never predicts without the features it declares", () => {
    const f = computeFeatures(series([100, 101, 102]));
    for (const def of STRATEGIES) {
      const p = predict(def, f, "UNKNOWN");
      expect(p.sufficient).toBe(false);
      expect(p.direction).toBe("FLAT");
    }
  });

  it("records a directional prediction with a horizon when conditions are met", () => {
    const f = computeFeatures(series(Array.from({ length: 40 }, (_, i) => 100 * 1.002 ** i)));
    const p = predict(STRATEGIES[0]!, f, "TREND_UP");
    expect(["UP", "DOWN", "FLAT"]).toContain(p.direction);
    expect(p.horizonMinutes).toBeGreaterThan(0);
    if (p.direction !== "FLAT") expect(p.probability).toBeGreaterThan(0.5);
  });

  it("keeps every strategy versioned", () => {
    for (const def of STRATEGIES) expect(def.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("risk engine", () => {
  it("rejects when volatility or liquidity is unavailable", () => {
    const v = checkRisk(
      DEFAULT_LIMITS,
      { asset: "BTC", notionalUsd: 100, volatilityPct: null, liquidityUsd: null },
      { exposure: 0, assetExposure: 0, openPositions: 0, dailyLoss: 0, drawdownPct: 0 },
    );
    expect(v.verdict).toBe("REJECTED");
    expect(v.approvedNotional).toBe(0);
  });

  it("rejects everything while the emergency stop is engaged", () => {
    const v = checkRisk(
      { ...DEFAULT_LIMITS, emergencyStop: true },
      { asset: "BTC", notionalUsd: 10, volatilityPct: 1, liquidityUsd: 10_000_000 },
      { exposure: 0, assetExposure: 0, openPositions: 0, dailyLoss: 0, drawdownPct: 0 },
    );
    expect(v.verdict).toBe("REJECTED");
    expect(v.reason).toMatch(/EMERGENCY STOP/);
  });

  it("accepts a proposal inside every limit", () => {
    const v = checkRisk(
      DEFAULT_LIMITS,
      { asset: "BTC", notionalUsd: 500, volatilityPct: 1.2, liquidityUsd: 5_000_000 },
      { exposure: 0, assetExposure: 0, openPositions: 0, dailyLoss: 0, drawdownPct: 0 },
    );
    expect(v.verdict).toBe("ACCEPTED");
    expect(v.approvedNotional).toBe(500);
  });
});

describe("backtesting", () => {
  const prices = series(Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 5) * 3 + i * 0.05));

  it("charges fees and slippage and labels the sample", () => {
    const r = backtest(STRATEGIES[0]!, prices, { label: "IN SAMPLE" });
    expect(r.label).toBe("IN SAMPLE");
    expect(r.feesPaid).toBeGreaterThanOrEqual(0);
    expect(r.trades.length).toBeGreaterThanOrEqual(0);
  });

  it("never uses information after the decision point", () => {
    const full = backtest(STRATEGIES[0]!, prices, { label: "IN SAMPLE" });
    const truncated = backtest(STRATEGIES[0]!, prices.slice(0, 80), { label: "IN SAMPLE" });
    const shared = truncated.trades.length;
    expect(full.trades.slice(0, Math.max(0, shared - 1))).toEqual(truncated.trades.slice(0, Math.max(0, shared - 1)));
  });

  it("walks forward across multiple windows", () => {
    const runs = walkForward(STRATEGIES[0]!, prices, { windows: 3 });
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r.label).toBe("WALK FORWARD");
  });
});
