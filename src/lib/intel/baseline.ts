/**
 * BASELINE + ACTIVITY INTELLIGENCE (pure, deterministic)
 *
 * A token is compared against ITS OWN recent history, not against a global
 * score. When there is not enough stored history to compare, the answer is
 * INSUFFICIENT EVIDENCE — a baseline is never fabricated from one observation.
 *
 * "Activity intelligence" here is not an AI score: it is a statement plus the
 * exact drivers, contradictions and unknowns that produced it.
 */

export type WindowKey = "5m" | "15m" | "30m" | "1h" | "4h" | "24h";

export const WINDOW_MS: Record<WindowKey, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

/** Minimum observations inside a window before a baseline is allowed to exist. */
export const MIN_SAMPLES = 3;

export type HistoryPoint = {
  observedAt: number;
  values: Partial<Record<string, number | null>>;
};

export type Baseline =
  | { state: "AVAILABLE"; window: WindowKey; metric: string; samples: number; mean: number; min: number; max: number; stdDev: number }
  | { state: "INSUFFICIENT EVIDENCE"; window: WindowKey; metric: string; samples: number; reason: string };

export function baselineFor(history: HistoryPoint[], metric: string, window: WindowKey, now = Date.now()): Baseline {
  const cutoff = now - WINDOW_MS[window];
  const values = history
    .filter((p) => p.observedAt >= cutoff)
    .map((p) => p.values[metric])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (values.length < MIN_SAMPLES)
    return {
      state: "INSUFFICIENT EVIDENCE",
      window,
      metric,
      samples: values.length,
      reason: `only ${values.length} stored observation(s) in the last ${window}; ${MIN_SAMPLES} are required before a baseline means anything`,
    };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return {
    state: "AVAILABLE",
    window,
    metric,
    samples: values.length,
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    stdDev: Math.sqrt(variance),
  };
}

/**
 * Is the current value unusual against the baseline? Returns null (UNKNOWN)
 * when no baseline exists — callers must not treat null as "normal".
 */
export function isUnusual(baseline: Baseline, current: number | null, sigma = 2): boolean | null {
  if (baseline.state !== "AVAILABLE") return null;
  if (current === null || !Number.isFinite(current)) return null;
  if (baseline.stdDev === 0) return current !== baseline.mean;
  return Math.abs(current - baseline.mean) >= sigma * baseline.stdDev;
}

export type ActivityState =
  | "INCREASING"
  | "UNUSUAL"
  | "DECREASING"
  | "PERSISTENT"
  | "DETERIORATING"
  | "INSUFFICIENT EVIDENCE";

export type ActivityAssessment = {
  state: ActivityState;
  drivers: string[];
  contradictions: string[];
  unknowns: string[];
  /** Which windows actually had enough history to contribute. */
  windowsUsed: WindowKey[];
};

const pct = (before: number, after: number): number => (before === 0 ? 0 : (after - before) / Math.abs(before));

/**
 * Transparent activity assessment from stored history only. Every sentence it
 * returns is traceable to an observation that exists.
 */
export function assessActivity(
  history: HistoryPoint[],
  opts: { now?: number; socialAvailable?: boolean; walletAvailable?: boolean; holdersAvailable?: boolean } = {},
): ActivityAssessment {
  const now = opts.now ?? Date.now();
  const drivers: string[] = [];
  const contradictions: string[] = [];
  const unknowns: string[] = [];
  const windowsUsed: WindowKey[] = [];

  const ordered = [...history].sort((a, b) => a.observedAt - b.observedAt);
  const latest = ordered[ordered.length - 1];
  if (!latest || ordered.length < 2) {
    return {
      state: "INSUFFICIENT EVIDENCE",
      drivers: [],
      contradictions: [],
      unknowns: ["fewer than two stored observations exist for this token, so no trend can be stated"],
      windowsUsed: [],
    };
  }

  let up = 0;
  let down = 0;

  const check = (metric: string, label: string, window: WindowKey) => {
    const base = baselineFor(ordered, metric, window, now);
    const current = latest.values[metric];
    if (base.state !== "AVAILABLE") {
      unknowns.push(`${label} baseline over ${window}: ${base.reason}`);
      return;
    }
    if (!windowsUsed.includes(window)) windowsUsed.push(window);
    if (typeof current !== "number") {
      unknowns.push(`${label} is not published by any connected provider for the latest observation`);
      return;
    }
    const change = pct(base.mean, current);
    const unusual = isUnusual(base, current);
    if (change >= 0.25) {
      up++;
      drivers.push(`${label} is ${Math.round(change * 100)}% above its ${window} average`);
    } else if (change <= -0.25) {
      down++;
      drivers.push(`${label} is ${Math.round(Math.abs(change) * 100)}% below its ${window} average`);
    } else {
      drivers.push(`${label} is stable against its ${window} average`);
    }
    if (unusual) drivers.push(`${label} is outside two standard deviations of its ${window} baseline`);
  };

  check("volume_24h_usd", "volume", "1h");
  check("liquidity_usd", "liquidity", "1h");
  check("price_usd", "price", "1h");
  check("txns_5m_buys", "buy transactions", "30m");
  check("txns_5m_sells", "sell transactions", "30m");

  const liq = latest.values["liquidity_usd"];
  const firstLiq = ordered.find((p) => typeof p.values["liquidity_usd"] === "number")?.values["liquidity_usd"];
  if (typeof liq === "number" && typeof firstLiq === "number" && firstLiq > 0 && liq < firstLiq * 0.6) {
    contradictions.push(
      `liquidity has fallen ${Math.round((1 - liq / firstLiq) * 100)}% since the first stored observation`,
    );
  }

  const buys = latest.values["txns_5m_buys"];
  const sells = latest.values["txns_5m_sells"];
  if (typeof buys === "number" && typeof sells === "number" && buys + sells >= 10) {
    if (sells > buys * 2) contradictions.push(`sells outnumber buys ${sells} to ${buys} in the latest window`);
  }

  if (opts.socialAvailable !== true) unknowns.push("social verification is unavailable — no X credential is connected");
  if (opts.walletAvailable !== true) unknowns.push("wallet-level activity is unavailable — no trader or on-chain provider is connected");
  if (opts.holdersAvailable !== true) unknowns.push("holder counts are unavailable — no Solana RPC is connected");

  let state: ActivityState;
  if (windowsUsed.length === 0) state = "INSUFFICIENT EVIDENCE";
  else if (contradictions.some((c) => c.startsWith("liquidity has fallen"))) state = "DETERIORATING";
  else if (up >= 2 && down === 0) state = "INCREASING";
  else if (down >= 2 && up === 0) state = "DECREASING";
  else if (up > 0 && down > 0) state = "UNUSUAL";
  else state = "PERSISTENT";

  return { state, drivers, contradictions, unknowns, windowsUsed };
}
