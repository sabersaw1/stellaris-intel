/**
 * The tracked asset universe.
 *
 * Configurable: set STELLARIS_ASSET_UNIVERSE (server) or
 * VITE_STELLARIS_ASSET_UNIVERSE (browser) to a comma-separated symbol list, or
 * edit the asset_universe table in the database (migration 0006). These ten are
 * the starting universe, not an assumption that nothing else matters — the
 * discovery pipeline keeps observing every market it sees.
 */

export const DEFAULT_UNIVERSE = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "BNB",
  "DOGE",
  "ADA",
  "AVAX",
  "LINK",
  "DOT",
] as const;

function parse(list: string | undefined | null): string[] | null {
  if (!list) return null;
  const out = list
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return out.length ? out : null;
}

/** Symbols used for market discovery queries. */
export function universeSymbols(override?: string | null): string[] {
  return parse(override) ?? [...DEFAULT_UNIVERSE];
}

/** Search terms sent to the market source for a given symbol. */
export function searchTermsFor(symbols: string[]): string[] {
  return symbols;
}
