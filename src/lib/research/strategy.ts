/**
 * STRATEGY SYSTEM — versioned, declarative and immutable.
 *
 * Every strategy is a versioned record. A rule change means a NEW version: the
 * old version keeps its historical predictions, signals and paper results. The
 * registry below is seeded into strategy_versions so results always point at the
 * exact ruleset that produced them.
 */

import type { FeatureSet } from "./features";
import type { Regime } from "./regime";

export type StrategyDef = {
  name: string;
  version: string;
  description: string;
  timeframe: string;
  features: string[];
  entryRules: string[];
  exitRules: string[];
  riskRules: string[];
  parameters: Record<string, number>;
  status: "RESEARCH" | "PAPER" | "RETIRED";
};

export const STRATEGIES: StrategyDef[] = [
  {
    name: "momentum-continuation",
    version: "1.0.0",
    description:
      "Follows established short-horizon momentum while volatility is not extreme. Research and paper only.",
    timeframe: "15m horizon on stored observation cadence",
    features: ["return_5", "return_20", "momentum", "rsi_14", "macd", "volatility", "volume_ratio"],
    entryRules: [
      "20-observation return >= +1.5% (regime TREND_UP)",
      "MACD above zero",
      "RSI(14) between 50 and 75 (not already exhausted)",
      "Realized volatility <= 3% per observation step",
    ],
    exitRules: ["Horizon reached (15 minutes)", "MACD crosses below zero", "RSI(14) above 80"],
    riskRules: ["Risk engine decides size and rejection independently of this strategy"],
    parameters: { horizonMinutes: 15, minReturn20: 1.5, maxVolatility: 3, rsiFloor: 50, rsiCeiling: 75 },
    status: "PAPER",
  },
  {
    name: "mean-reversion",
    version: "1.0.0",
    description:
      "Expects short-horizon reversion after a stretched move against a quiet backdrop. Research and paper only.",
    timeframe: "30m horizon on stored observation cadence",
    features: ["return_5", "rsi_14", "drawdown", "volatility", "volume_ratio"],
    entryRules: [
      "RSI(14) below 30 (expect UP) or above 70 (expect DOWN)",
      "Realized volatility <= 2% per observation step",
      "Regime is SIDEWAYS or LOW_VOLATILITY",
    ],
    exitRules: ["Horizon reached (30 minutes)", "RSI(14) returns through 50"],
    riskRules: ["Risk engine decides size and rejection independently of this strategy"],
    parameters: { horizonMinutes: 30, rsiLow: 30, rsiHigh: 70, maxVolatility: 2 },
    status: "PAPER",
  },
];

export type Prediction = {
  strategyName: string;
  strategyVersion: string;
  direction: "UP" | "DOWN" | "FLAT";
  probability: number;
  horizonMinutes: number;
  entryLogic: string;
  invalidation: string;
  riskNote: string;
  sufficient: boolean;
  reason: string;
};

/**
 * Produces one prediction per strategy from real features only. When the inputs
 * a strategy needs are unavailable, `sufficient` is false and no prediction is
 * recorded — the system never manufactures a direction.
 */
export function predict(def: StrategyDef, f: FeatureSet, regime: Regime): Prediction {
  const base = {
    strategyName: def.name,
    strategyVersion: def.version,
    horizonMinutes: def.parameters["horizonMinutes"] ?? 15,
    riskNote: "Research observation only. No order is placed by this record.",
  };

  const r20 = f.byKey["return_20"];
  const rsi = f.byKey["rsi_14"];
  const macd = f.byKey["macd"];
  const vol = f.byKey["volatility"];

  if (def.name === "momentum-continuation") {
    if (r20 === null || rsi === null || macd === null || vol === null) {
      return {
        ...base,
        direction: "FLAT",
        probability: 0,
        entryLogic: "",
        invalidation: "",
        sufficient: false,
        reason: "INSUFFICIENT DATA — return, RSI, MACD or volatility unavailable for this market",
      };
    }
    const maxVol = def.parameters["maxVolatility"]!;
    const minRet = def.parameters["minReturn20"]!;
    if (vol > maxVol) {
      return { ...base, direction: "FLAT", probability: 0.5, entryLogic: `Volatility ${vol.toFixed(2)}% above the ${maxVol}% ceiling`, invalidation: "Volatility falls back inside the ceiling", sufficient: false, reason: "Volatility outside the strategy's operating range" };
    }
    const up = r20 >= minRet && macd > 0 && rsi >= def.parameters["rsiFloor"]! && rsi <= def.parameters["rsiCeiling"]!;
    const down = r20 <= -minRet && macd < 0 && rsi <= 50 && rsi >= 25;
    if (!up && !down) {
      return { ...base, direction: "FLAT", probability: 0.5, entryLogic: `20-observation return ${r20.toFixed(2)}%, RSI ${rsi.toFixed(0)}, MACD ${macd > 0 ? "positive" : "negative"}`, invalidation: "Entry conditions become satisfied", sufficient: true, reason: "No directional condition met — FLAT prediction recorded" };
    }
    const strength = Math.min(1, Math.abs(r20) / (minRet * 3));
    return {
      ...base,
      direction: up ? "UP" : "DOWN",
      probability: Math.round((0.5 + strength * 0.2) * 100) / 100,
      entryLogic: `Regime ${regime}; 20-observation return ${r20.toFixed(2)}%, RSI ${rsi.toFixed(0)}, MACD ${macd.toFixed(6)}`,
      invalidation: up ? "MACD crosses below zero or RSI above 80" : "MACD crosses above zero or RSI below 20",
      sufficient: true,
      reason: "Momentum conditions satisfied",
    };
  }

  // mean-reversion
  if (rsi === null || vol === null) {
    return { ...base, direction: "FLAT", probability: 0, entryLogic: "", invalidation: "", sufficient: false, reason: "INSUFFICIENT DATA — RSI or volatility unavailable for this market" };
  }
  if (vol > (def.parameters["maxVolatility"] ?? 2)) {
    return { ...base, direction: "FLAT", probability: 0.5, entryLogic: `Volatility ${vol.toFixed(2)}% above the strategy ceiling`, invalidation: "Volatility settles", sufficient: false, reason: "Volatility outside the strategy's operating range" };
  }
  const low = def.parameters["rsiLow"]!;
  const high = def.parameters["rsiHigh"]!;
  if (rsi <= low || rsi >= high) {
    const dir = rsi <= low ? "UP" : "DOWN";
    const stretch = rsi <= low ? (low - rsi) / low : (rsi - high) / (100 - high);
    return {
      ...base,
      direction: dir,
      probability: Math.round((0.5 + Math.min(0.2, stretch * 0.3)) * 100) / 100,
      entryLogic: `Regime ${regime}; RSI(14) ${rsi.toFixed(0)} is stretched, volatility ${vol.toFixed(2)}%`,
      invalidation: "RSI returns through 50 before the horizon",
      sufficient: true,
      reason: "Reversion conditions satisfied",
    };
  }
  return { ...base, direction: "FLAT", probability: 0.5, entryLogic: `RSI(14) ${rsi.toFixed(0)} is mid-range`, invalidation: "RSI becomes stretched", sufficient: true, reason: "No directional condition met — FLAT prediction recorded" };
}
