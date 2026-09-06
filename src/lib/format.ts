export const NA = "DATA UNAVAILABLE";

export function usd(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  if (v !== 0 && Math.abs(v) < 0.01) return `$${v.toPrecision(3)}`;
  if (Math.abs(v) >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(digits)}`;
}

export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  if (v >= 0.0001) return `$${v.toFixed(6)}`;
  return `$${v.toExponential(3)}`;
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function count(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return v.toLocaleString();
}

export function ratio(v: number | null | undefined, suffix = "x"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "INSUFFICIENT DATA";
  return `${v.toFixed(2)}${suffix}`;
}

export function ageFrom(ts: number | null | undefined): string {
  if (!ts) return NA;
  const h = (Date.now() - ts) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  if (h < 24 * 60) return `${(h / 24).toFixed(1)}d`;
  return `${(h / 24 / 30).toFixed(1)}mo`;
}

export function clockOf(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

export function secondsSince(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 90 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}
