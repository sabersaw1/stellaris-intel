/**
 * FEATURE ENGINE — calculated only from data that genuinely exists.
 *
 * Input is the stored observation series for one market (oldest first). Each
 * feature reports whether its inputs were available; a feature whose inputs are
 * missing is returned as UNAVAILABLE with the reason, never as a zero or a
 * guess. Inputs this data source does not provide at all (funding, open
 * interest, liquidations, order book, true OHLC) are always UNAVAILABLE.
 */

export type SeriesPoint = {
  t: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  fdv?: number | null;
};

export type Feature = {
  key: string;
  label: string;
  value: number | null;
  unit: "PRICE" | "PCT" | "RATIO" | "SCORE" | "USD" | "NONE";
  available: boolean;
  basis: string;
};

export type FeatureSet = {
  features: Feature[];
  byKey: Record<string, number | null>;
  points: number;
  spanMinutes: number | null;
  /** Enough real history to say anything at all. */
  sufficient: boolean;
};

const UNAVAILABLE = (key: string, label: string, basis: string, unit: Feature["unit"] = "NONE"): Feature => ({
  key,
  label,
  value: null,
  unit,
  available: false,
  basis,
});

function prices(series: SeriesPoint[]): { t: number; p: number }[] {
  return series
    .filter((s): s is SeriesPoint & { priceUsd: number } => typeof s.priceUsd === "number" && s.priceUsd > 0)
    .map((s) => ({ t: s.t, p: s.priceUsd }));
}

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const slice = values.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

function ema(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const k = 2 / (n + 1);
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (const v of values.slice(n)) e = v * k + e * (1 - k);
  return e;
}

function rsi(values: number[], n = 14): number | null {
  if (values.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - n; i < values.length; i += 1) {
    const prev = values[i - 1];
    const cur = values[i];
    if (prev === undefined || cur === undefined) return null;
    const d = cur - prev;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  const rs = gain / n / (loss / n);
  return 100 - 100 / (1 + rs);
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export const FEATURE_ENGINE_VERSION = "feature-engine v1.0";

export function computeFeatures(series: SeriesPoint[]): FeatureSet {
  const pts = prices(series);
  const p = pts.map((x) => x.p);
  const last = p.at(-1) ?? null;
  const span = pts.length > 1 ? Math.round(((pts.at(-1)!.t - pts[0]!.t) / 60_000) * 10) / 10 : null;

  const retAt = (back: number): number | null => {
    if (last === null || p.length <= back) return null;
    const ref = p[p.length - 1 - back];
    if (ref === undefined || ref === 0) return null;
    return ((last - ref) / ref) * 100;
  };

  const returns: number[] = [];
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1]!;
    const b = p[i]!;
    if (a > 0) returns.push((b - a) / a);
  }

  const vols = series
    .map((s) => s.volume24h)
    .filter((v): v is number => typeof v === "number");
  const liq = series
    .map((s) => s.liquidityUsd)
    .filter((v): v is number => typeof v === "number");

  const features: Feature[] = [];
  const push = (f: Feature) => features.push(f);
  const num = (
    key: string,
    label: string,
    value: number | null,
    unit: Feature["unit"],
    basis: string,
    missing: string,
  ) => push(value === null ? UNAVAILABLE(key, label, missing, unit) : { key, label, value, unit, available: true, basis });

  const need = (n: number) => `Needs at least ${n} stored observations for this market`;

  num("price", "PRICE", last, "PRICE", "Latest stored observation", "No priced observation stored yet");
  num("return_1", "RETURN (1 OBS)", retAt(1), "PCT", "Change vs previous stored observation", need(2));
  num("return_5", "RETURN (5 OBS)", retAt(5), "PCT", "Change over the last 5 stored observations", need(6));
  num("return_20", "RETURN (20 OBS)", retAt(20), "PCT", "Change over the last 20 stored observations", need(21));
  num("momentum", "MOMENTUM", retAt(10), "PCT", "Rate of change over 10 observations", need(11));
  num("rsi_14", "RSI (14)", rsi(p, 14), "SCORE", "Wilder RSI on stored closes", need(15));
  num("ema_12", "EMA (12)", ema(p, 12), "PRICE", "12-period EMA of stored closes", need(12));
  num("ema_26", "EMA (26)", ema(p, 26), "PRICE", "26-period EMA of stored closes", need(26));
  const e12 = ema(p, 12);
  const e26 = ema(p, 26);
  num(
    "macd",
    "MACD",
    e12 !== null && e26 !== null ? e12 - e26 : null,
    "PRICE",
    "EMA(12) - EMA(26) of stored closes",
    need(26),
  );
  num("sma_20", "SMA (20)", sma(p, 20), "PRICE", "20-period simple average", need(20));
  const sd = stdev(returns.slice(-30));
  num(
    "volatility",
    "REALIZED VOLATILITY",
    sd === null ? null : sd * 100,
    "PCT",
    "Standard deviation of the last 30 observation-to-observation returns",
    need(4),
  );
  const high = p.length ? Math.max(...p.slice(-50)) : null;
  const low = p.length ? Math.min(...p.slice(-50)) : null;
  num("rolling_high", "ROLLING HIGH (50)", high, "PRICE", "Highest stored close in the last 50 observations", need(2));
  num("rolling_low", "ROLLING LOW (50)", low, "PRICE", "Lowest stored close in the last 50 observations", need(2));
  num(
    "drawdown",
    "DRAWDOWN FROM HIGH",
    high !== null && last !== null && high > 0 ? ((last - high) / high) * 100 : null,
    "PCT",
    "Distance below the rolling high",
    need(2),
  );
  num("liquidity", "LIQUIDITY", liq.at(-1) ?? null, "USD", "Latest stored liquidity", "Source reported no liquidity");
  num("volume_24h", "VOLUME 24H", vols.at(-1) ?? null, "USD", "Latest stored 24h volume", "Source reported no volume");
  const volPrev = vols.length > 1 ? vols[vols.length - 2]! : null;
  const volNow = vols.at(-1) ?? null;
  num(
    "volume_change",
    "VOLUME CHANGE",
    volNow !== null && volPrev !== null && volPrev > 0 ? ((volNow - volPrev) / volPrev) * 100 : null,
    "PCT",
    "24h volume vs previous stored observation",
    need(2),
  );
  const volAvg = sma(vols, Math.min(20, vols.length || 1));
  num(
    "volume_ratio",
    "VOLUME / AVERAGE",
    volNow !== null && volAvg ? volNow / volAvg : null,
    "RATIO",
    "Current 24h volume divided by its recent average",
    need(2),
  );
  num(
    "volume_to_liquidity",
    "VOLUME / LIQUIDITY",
    volNow !== null && (liq.at(-1) ?? 0) > 0 ? volNow / liq.at(-1)! : null,
    "RATIO",
    "Turnover relative to pool depth",
    "Liquidity or volume unavailable",
  );

  // Inputs this source does not provide. Reported UNAVAILABLE, never estimated.
  push(UNAVAILABLE("atr", "ATR", "Needs true high/low/close candles; the source provides snapshot prices only", "PRICE"));
  push(UNAVAILABLE("vwap", "VWAP", "Needs per-trade price and size; not provided by this source", "PRICE"));
  push(UNAVAILABLE("vwap_distance", "DISTANCE FROM VWAP", "Depends on VWAP, which is unavailable", "PCT"));
  push(UNAVAILABLE("correlation", "CROSS-ASSET CORRELATION", "Requires aligned series across assets; enabled once each asset has 30+ stored observations", "RATIO"));
  push(UNAVAILABLE("funding", "FUNDING RATE", "Derivatives venue not connected", "PCT"));
  push(UNAVAILABLE("open_interest", "OPEN INTEREST", "Derivatives venue not connected", "USD"));
  push(UNAVAILABLE("liquidations", "LIQUIDATIONS", "Derivatives venue not connected", "USD"));
  push(UNAVAILABLE("orderbook_imbalance", "ORDER-BOOK IMBALANCE", "No order-book feed connected", "RATIO"));

  const byKey: Record<string, number | null> = {};
  for (const f of features) byKey[f.key] = f.available ? f.value : null;

  return {
    features,
    byKey,
    points: pts.length,
    spanMinutes: span,
    sufficient: pts.length >= 12,
  };
}
