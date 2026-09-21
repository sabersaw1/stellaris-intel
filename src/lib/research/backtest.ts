/**
 * BACKTEST + WALK-FORWARD ENGINE (pure, look-ahead safe).
 *
 * Rules enforced here:
 *  - a decision at bar i may only read data up to bar i (no future values)
 *  - fees, slippage and position sizing are applied on entry and exit
 *  - stop loss and take profit are evaluated on the following bars only
 *  - every run is labelled IN SAMPLE / OUT OF SAMPLE / WALK FORWARD / PAPER
 *
 * Backtest output describes the past under stated assumptions. It is never a
 * forecast and must not be presented as expected future performance.
 */

import { computeFeatures, type SeriesPoint } from "./features";
import { classifyRegime } from "./regime";
import { predict, type StrategyDef } from "./strategy";
import { EXECUTION_ASSUMPTIONS } from "./risk";

export type RunKind = "IN SAMPLE" | "OUT OF SAMPLE" | "WALK FORWARD" | "PAPER TRADING";

export type Trade = {
  side: "LONG" | "SHORT";
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  fees: number;
  slippage: number;
  pnl: number;
  reason: string;
};

export type BacktestResult = {
  kind: RunKind;
  strategy: string;
  version: string;
  bars: number;
  trades: Trade[];
  grossPnl: number;
  netPnl: number;
  fees: number;
  wins: number;
  losses: number;
  winRate: number | null;
  maxDrawdown: number | null;
  sufficient: boolean;
  note: string;
};

export type BacktestConfig = {
  kind: RunKind;
  positionUsd: number;
  stopLossPct: number;
  takeProfitPct: number;
  minBars: number;
};

export const DEFAULT_BACKTEST: BacktestConfig = {
  kind: "IN SAMPLE",
  positionUsd: 1000,
  stopLossPct: 2,
  takeProfitPct: 3,
  minBars: 40,
};

export function backtest(series: SeriesPoint[], def: StrategyDef, cfg: BacktestConfig = DEFAULT_BACKTEST): BacktestResult {
  const closes = series.filter((s) => typeof s.priceUsd === "number" && s.priceUsd! > 0);
  const base: BacktestResult = {
    kind: cfg.kind,
    strategy: def.name,
    version: def.version,
    bars: closes.length,
    trades: [],
    grossPnl: 0,
    netPnl: 0,
    fees: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    maxDrawdown: null,
    sufficient: false,
    note: "",
  };
  if (closes.length < cfg.minBars) {
    return { ...base, note: `INSUFFICIENT DATA — ${closes.length} stored bars, need ${cfg.minBars}` };
  }

  const feeRate = EXECUTION_ASSUMPTIONS.feeBps / 10_000;
  const slipRate = EXECUTION_ASSUMPTIONS.slippageBps / 10_000;
  const trades: Trade[] = [];
  let open: { side: "LONG" | "SHORT"; i: number; price: number } | null = null;

  for (let i = 20; i < closes.length; i += 1) {
    // Look-ahead guard: only bars up to and including i are visible.
    const visible = closes.slice(0, i + 1);
    const price = visible.at(-1)!.priceUsd!;

    if (open) {
      const move = ((price - open.price) / open.price) * (open.side === "LONG" ? 1 : -1) * 100;
      const hitStop = move <= -cfg.stopLossPct;
      const hitTarget = move >= cfg.takeProfitPct;
      if (hitStop || hitTarget || i === closes.length - 1) {
        const qty = cfg.positionUsd / open.price;
        const entryFill = open.price * (1 + (open.side === "LONG" ? slipRate : -slipRate));
        const exitFill = price * (1 - (open.side === "LONG" ? slipRate : -slipRate));
        const gross = (exitFill - entryFill) * qty * (open.side === "LONG" ? 1 : -1);
        const fees = (entryFill + exitFill) * qty * feeRate;
        trades.push({
          side: open.side,
          entryIndex: open.i,
          exitIndex: i,
          entryPrice: entryFill,
          exitPrice: exitFill,
          fees,
          slippage: Math.abs(entryFill - open.price) * qty + Math.abs(exitFill - price) * qty,
          pnl: gross - fees,
          reason: hitStop ? "STOP LOSS" : hitTarget ? "TAKE PROFIT" : "END OF WINDOW",
        });
        open = null;
      }
      continue;
    }

    const f = computeFeatures(visible);
    const regime = classifyRegime(f, visible.at(-1)!.t);
    const p = predict(def, f, regime.regime);
    if (p.sufficient && p.direction !== "FLAT") {
      open = { side: p.direction === "UP" ? "LONG" : "SHORT", i, price };
    }
  }

  const netPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const fees = trades.reduce((a, t) => a + t.fees, 0);
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, equity - peak);
  }
  const wins = trades.filter((t) => t.pnl > 0).length;

  return {
    ...base,
    trades,
    grossPnl: netPnl + fees,
    netPnl,
    fees,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? Math.round((wins / trades.length) * 1000) / 10 : null,
    maxDrawdown: trades.length ? Math.round(maxDd * 100) / 100 : null,
    sufficient: true,
    note: `${trades.length} simulated trade(s) under stated fee and slippage assumptions. Past behaviour only — not a forecast.`,
  };
}

export type WalkForwardWindow = {
  index: number;
  from: number;
  to: number;
  result: BacktestResult;
};

/** Sequential non-overlapping windows, each tested out of sample. */
export function walkForward(series: SeriesPoint[], def: StrategyDef, windows = 4, cfg: BacktestConfig = DEFAULT_BACKTEST): WalkForwardWindow[] {
  const closes = series.filter((s) => typeof s.priceUsd === "number");
  if (closes.length < cfg.minBars * 2) return [];
  const size = Math.floor(closes.length / windows);
  const out: WalkForwardWindow[] = [];
  for (let w = 0; w < windows; w += 1) {
    const slice = closes.slice(w * size, (w + 1) * size);
    if (slice.length < cfg.minBars) continue;
    out.push({
      index: w + 1,
      from: slice[0]!.t,
      to: slice.at(-1)!.t,
      result: backtest(slice, def, { ...cfg, kind: "WALK FORWARD" }),
    });
  }
  return out;
}
