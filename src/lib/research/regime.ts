/**
 * REGIME ENGINE — documented, inspectable rules over real features.
 *
 * Classification is a reading, not a certainty: every result carries the rule
 * that fired and a confidence band. With insufficient features the regime is
 * UNKNOWN.
 */

import type { FeatureSet } from "./features";

export const REGIME_ENGINE_VERSION = "regime-engine v1.0";

export type Regime =
  | "TREND_UP"
  | "TREND_DOWN"
  | "SIDEWAYS"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "RISK_ON"
  | "RISK_OFF"
  | "UNKNOWN";

export type RegimeReading = {
  regime: Regime;
  basis: string;
  confidence: "LOW" | "MODERATE" | "HIGH" | "INSUFFICIENT DATA";
  secondary: Regime | null;
  determinedAt: number;
};

/** Documented thresholds, kept in one place so they can be reviewed. */
export const REGIME_RULES = {
  trendReturnPct: 1.5, // 20-observation return that counts as a trend
  sidewaysReturnPct: 0.4,
  highVolatilityPct: 1.2, // realized volatility per observation step
  lowVolatilityPct: 0.15,
  riskOnVolumeRatio: 1.5,
  riskOffVolumeRatio: 0.6,
} as const;

export function classifyRegime(f: FeatureSet, at = Date.now()): RegimeReading {
  const r20 = f.byKey["return_20"] ?? null;
  const vol = f.byKey["volatility"] ?? null;
  const volRatio = f.byKey["volume_ratio"] ?? null;
  const macd = f.byKey["macd"] ?? null;

  if (!f.sufficient || (r20 === null && vol === null)) {
    return {
      regime: "UNKNOWN",
      basis: `Only ${f.points} stored observation(s); the rules need at least 12`,
      confidence: "INSUFFICIENT DATA",
      secondary: null,
      determinedAt: at,
    };
  }

  let primary: Regime = "SIDEWAYS";
  let basis = "";

  if (r20 !== null && r20 >= REGIME_RULES.trendReturnPct) {
    primary = "TREND_UP";
    basis = `20-observation return ${r20.toFixed(2)}% >= ${REGIME_RULES.trendReturnPct}%`;
  } else if (r20 !== null && r20 <= -REGIME_RULES.trendReturnPct) {
    primary = "TREND_DOWN";
    basis = `20-observation return ${r20.toFixed(2)}% <= -${REGIME_RULES.trendReturnPct}%`;
  } else if (r20 !== null && Math.abs(r20) <= REGIME_RULES.sidewaysReturnPct) {
    primary = "SIDEWAYS";
    basis = `20-observation return ${r20.toFixed(2)}% inside +/-${REGIME_RULES.sidewaysReturnPct}%`;
  } else {
    primary = "SIDEWAYS";
    basis = r20 === null ? "No 20-observation return available; volatility used instead" : `20-observation return ${r20.toFixed(2)}% is directionally weak`;
  }

  if (macd !== null && (primary === "TREND_UP" || primary === "TREND_DOWN")) {
    basis += `, MACD ${macd > 0 ? "above" : "below"} zero`;
  }

  let secondary: Regime | null = null;
  if (vol !== null) {
    if (vol >= REGIME_RULES.highVolatilityPct) {
      secondary = "HIGH_VOLATILITY";
      basis += `, realized volatility ${vol.toFixed(2)}% per step`;
    } else if (vol <= REGIME_RULES.lowVolatilityPct) {
      secondary = "LOW_VOLATILITY";
      basis += `, realized volatility ${vol.toFixed(2)}% per step`;
    }
  }
  if (volRatio !== null && secondary === null) {
    if (volRatio >= REGIME_RULES.riskOnVolumeRatio) {
      secondary = "RISK_ON";
      basis += `, volume ${volRatio.toFixed(2)}x its recent average`;
    } else if (volRatio <= REGIME_RULES.riskOffVolumeRatio) {
      secondary = "RISK_OFF";
      basis += `, volume ${volRatio.toFixed(2)}x its recent average`;
    }
  }

  const confidence: RegimeReading["confidence"] =
    f.points >= 40 && r20 !== null && vol !== null ? "MODERATE" : "LOW";

  return { regime: primary, basis, confidence, secondary, determinedAt: at };
}
