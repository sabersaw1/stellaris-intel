/**
 * DATA FRESHNESS
 *
 * Freshness is derived only from real timestamps. Nothing is labelled LIVE unless
 * the underlying observation is genuinely recent.
 */

export type Freshness = "LIVE" | "RECENT" | "DELAYED" | "STALE" | "HISTORICAL" | "UNAVAILABLE";

export const FRESHNESS_TONE: Record<Freshness, string> = {
  LIVE: "border-signal-low/50 text-signal-low",
  RECENT: "border-cyan/45 text-cyan",
  DELAYED: "border-signal-mid/50 text-signal-mid",
  STALE: "border-signal-high/50 text-signal-high",
  HISTORICAL: "border-violet/45 text-violet",
  UNAVAILABLE: "border-border text-unknown",
};

export function freshnessOf(observedAt: number | null | undefined, opts: { historical?: boolean } = {}): Freshness {
  if (opts.historical) return "HISTORICAL";
  if (!observedAt || !Number.isFinite(observedAt)) return "UNAVAILABLE";
  const s = (Date.now() - observedAt) / 1000;
  if (s < 0) return "UNAVAILABLE";
  if (s <= 60) return "LIVE";
  if (s <= 180) return "RECENT";
  if (s <= 600) return "DELAYED";
  if (s <= 86_400) return "STALE";
  return "HISTORICAL";
}

export function freshnessDetail(observedAt: number | null | undefined): string {
  if (!observedAt) return "no observation timestamp recorded";
  const s = Math.max(0, Math.round((Date.now() - observedAt) / 1000));
  return s < 90 ? `observed ${s}s ago` : `observed ${Math.round(s / 60)}m ago`;
}
