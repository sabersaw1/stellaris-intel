/**
 * WHAT CHANGED ENGINE (expanded)
 *
 * Compares the CURRENT state of a target against the PREVIOUS RECORDED state
 * across market metrics and intelligence state. Any metric that was never
 * recorded — or that this data source does not provide — is reported as
 * NOT AVAILABLE. Nothing is estimated or interpolated.
 */

import type { ObservationPoint } from "./local-store";

export type ChangeRow = {
  metric: string;
  previous: string;
  current: string;
  change: string;
  changePct: number | null;
  direction: "UP" | "DOWN" | "FLAT" | "NONE";
  state: "CHANGED" | "UNCHANGED" | "NOT AVAILABLE";
  note?: string;
};

const fmtNum = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? null : v.toLocaleString(undefined, { maximumFractionDigits: digits });

function row(metric: string, from: number | null | undefined, to: number | null | undefined, digits = 2, note?: string): ChangeRow {
  const a = fmtNum(from, digits);
  const b = fmtNum(to, digits);
  if (a === null || b === null) {
    return {
      metric,
      previous: a ?? "NOT AVAILABLE",
      current: b ?? "NOT AVAILABLE",
      change: "NOT AVAILABLE",
      changePct: null,
      direction: "NONE",
      state: "NOT AVAILABLE",
      ...(note ? { note } : {}),
    };
  }
  const f = from as number;
  const t = to as number;
  const diff = t - f;
  const pct = f === 0 ? null : (diff / Math.abs(f)) * 100;
  return {
    metric,
    previous: a,
    current: b,
    change: pct === null ? fmtNum(diff, digits) ?? "NOT AVAILABLE" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`,
    changePct: pct,
    direction: diff > 0 ? "UP" : diff < 0 ? "DOWN" : "FLAT",
    state: diff === 0 ? "UNCHANGED" : "CHANGED",
    ...(note ? { note } : {}),
  };
}

function unavailable(metric: string, note: string): ChangeRow {
  return {
    metric,
    previous: "NOT AVAILABLE",
    current: "NOT AVAILABLE",
    change: "NOT AVAILABLE",
    changePct: null,
    direction: "NONE",
    state: "NOT AVAILABLE",
    note,
  };
}

export type ChangeContext = {
  attentionNow?: number | null;
  attentionPrev?: number | null;
  researchStatePrev?: string | null;
  researchStateNow?: string | null;
  classificationPrev?: string | null;
  classificationNow?: string | null;
};

export function changeReport(
  history: ObservationPoint[],
  ctx: ChangeContext = {},
): { rows: ChangeRow[]; window: string | null; comparable: boolean } {
  if (history.length < 2) {
    return { rows: [], window: null, comparable: false };
  }
  const to = history[history.length - 1]!;
  const from = history[history.length - 2]!;
  const seconds = Math.max(1, Math.round((to.t - from.t) / 1000));
  const window = `${seconds}s between the two most recent recorded observations`;

  const rows: ChangeRow[] = [
    row("PRICE USD", from.priceUsd, to.priceUsd, 8),
    row("LIQUIDITY USD", from.liquidityUsd, to.liquidityUsd, 0),
    row("VOLUME 24H", from.volume24h, to.volume24h, 0),
    row("TRANSACTIONS 24H", from.txns24h, to.txns24h, 0),
    row("FDV", from.fdv, to.fdv, 0),
    row("MARKET CAP", from.marketCap, to.marketCap, 0),
    unavailable("HOLDERS", "Holder counts are not provided by the DEX Screener endpoints in use — UNSUPPORTED by this source"),
    unavailable("WALLET ACTIVITY", "Per-wallet activity is not provided by the DEX Screener endpoints in use — UNSUPPORTED by this source"),
    row("ATTENTION SCORE", ctx.attentionPrev ?? null, ctx.attentionNow ?? null, 0),
    row("OBSERVED RISK SCORE", from.riskScore, to.riskScore, 0),
    row("CONFIDENCE", from.confidence, to.confidence, 0),
    row("ANOMALY COUNT", from.anomalyCount, to.anomalyCount, 0),
  ];

  const classPrev = ctx.classificationPrev ?? null;
  const classNow = ctx.classificationNow ?? null;
  rows.push({
    metric: "AGENT CLASSIFICATION",
    previous: classPrev ?? "NOT AVAILABLE",
    current: classNow ?? "NOT AVAILABLE",
    change: !classPrev || !classNow ? "NOT AVAILABLE" : classPrev === classNow ? "UNCHANGED" : `${classPrev} → ${classNow}`,
    changePct: null,
    direction: "NONE",
    state: !classPrev || !classNow ? "NOT AVAILABLE" : classPrev === classNow ? "UNCHANGED" : "CHANGED",
  });

  const rPrev = ctx.researchStatePrev ?? null;
  const rNow = ctx.researchStateNow ?? null;
  rows.push({
    metric: "RESEARCH STATE",
    previous: rPrev ?? "NOT AVAILABLE",
    current: rNow ?? "NOT AVAILABLE",
    change: !rPrev || !rNow ? "NOT AVAILABLE" : rPrev === rNow ? "UNCHANGED" : `${rPrev} → ${rNow}`,
    changePct: null,
    direction: "NONE",
    state: !rPrev || !rNow ? "NOT AVAILABLE" : rPrev === rNow ? "UNCHANGED" : "CHANGED",
  });

  return { rows, window, comparable: true };
}

export const CHANGE_ENGINE_VERSION = "change-engine v2.0";
