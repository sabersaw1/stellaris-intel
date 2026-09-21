/**
 * RISK ENGINE — independent of every strategy.
 *
 * A strategy proposes; the risk engine decides. A rejection here cannot be
 * overridden by a strategy, a signal or an AI answer. Live execution is not
 * implemented at all: the highest state the pipeline can reach without explicit
 * human approval is paper trading.
 */

export type RiskLimits = {
  maxPositionUsd: number;
  maxPortfolioExposure: number;
  maxAssetExposure: number;
  maxDailyLoss: number;
  maxDrawdownPct: number;
  maxOpenPositions: number;
  maxVolatilityPct: number;
  minLiquidityUsd: number;
  emergencyStop: boolean;
};

export const DEFAULT_LIMITS: RiskLimits = {
  maxPositionUsd: 1000,
  maxPortfolioExposure: 5000,
  maxAssetExposure: 2000,
  maxDailyLoss: 250,
  maxDrawdownPct: 20,
  maxOpenPositions: 5,
  maxVolatilityPct: 25,
  minLiquidityUsd: 250_000,
  emergencyStop: false,
};

export type Portfolio = {
  exposure: number;
  assetExposure: number;
  openPositions: number;
  dailyLoss: number;
  drawdownPct: number;
};

export type Proposal = {
  asset: string;
  notionalUsd: number;
  volatilityPct: number | null;
  liquidityUsd: number | null;
};

export type RiskVerdict = {
  verdict: "ACCEPTED" | "REJECTED";
  reason: string;
  approvedNotional: number;
  checks: { rule: string; passed: boolean; detail: string }[];
};

export function checkRisk(limits: RiskLimits, p: Proposal, port: Portfolio): RiskVerdict {
  const checks: { rule: string; passed: boolean; detail: string }[] = [];
  const add = (rule: string, passed: boolean, detail: string) => checks.push({ rule, passed, detail });

  add("EMERGENCY STOP", !limits.emergencyStop, limits.emergencyStop ? "Emergency stop is engaged" : "Not engaged");
  add("MAX POSITION", p.notionalUsd <= limits.maxPositionUsd, `${p.notionalUsd} vs limit ${limits.maxPositionUsd}`);
  add(
    "MAX PORTFOLIO EXPOSURE",
    port.exposure + p.notionalUsd <= limits.maxPortfolioExposure,
    `${port.exposure + p.notionalUsd} vs limit ${limits.maxPortfolioExposure}`,
  );
  add(
    "MAX ASSET EXPOSURE",
    port.assetExposure + p.notionalUsd <= limits.maxAssetExposure,
    `${p.asset}: ${port.assetExposure + p.notionalUsd} vs limit ${limits.maxAssetExposure}`,
  );
  add("MAX OPEN POSITIONS", port.openPositions < limits.maxOpenPositions, `${port.openPositions} open vs limit ${limits.maxOpenPositions}`);
  add("MAX DAILY LOSS", port.dailyLoss <= limits.maxDailyLoss, `${port.dailyLoss} vs limit ${limits.maxDailyLoss}`);
  add("MAX DRAWDOWN", port.drawdownPct <= limits.maxDrawdownPct, `${port.drawdownPct}% vs limit ${limits.maxDrawdownPct}%`);
  add(
    "VOLATILITY LIMIT",
    p.volatilityPct === null ? false : p.volatilityPct <= limits.maxVolatilityPct,
    p.volatilityPct === null ? "Volatility unavailable — cannot size safely" : `${p.volatilityPct.toFixed(2)}% vs limit ${limits.maxVolatilityPct}%`,
  );
  add(
    "LIQUIDITY LIMIT",
    p.liquidityUsd === null ? false : p.liquidityUsd >= limits.minLiquidityUsd,
    p.liquidityUsd === null ? "Liquidity unavailable — cannot size safely" : `${Math.round(p.liquidityUsd)} vs minimum ${limits.minLiquidityUsd}`,
  );

  const failed = checks.filter((c) => !c.passed);
  return {
    verdict: failed.length ? "REJECTED" : "ACCEPTED",
    reason: failed.length ? failed.map((f) => `${f.rule}: ${f.detail}`).join("; ") : "All risk rules satisfied",
    approvedNotional: failed.length ? 0 : p.notionalUsd,
    checks,
  };
}

/** Execution assumptions used consistently by paper trading and backtests. */
export const EXECUTION_ASSUMPTIONS = {
  feeBps: 10, // 0.10% per side
  slippageBps: 15, // 0.15% adverse fill
  note: "Fees and slippage are explicit assumptions, not observed fills. Spread is applied only where the source provides it.",
} as const;
