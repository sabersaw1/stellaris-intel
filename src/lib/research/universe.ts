/**
 * The tracked asset universe — MEME COINS ONLY.
 *
 * Stellaris is a meme-coin intelligence system. Mainstream large caps
 * (BTC, ETH, XRP, BNB, ADA, AVAX, LINK, DOT) and stablecoins are deliberately
 * NOT part of the active research universe: they are excluded here and again by
 * the meme classifier, so they cannot reach radar, dossiers, alerts, the
 * watchlist, paper trading or any other user-facing surface.
 *
 * SOL appears only as infrastructure/context for Solana meme coins — never as a
 * tracked investment asset.
 *
 * Configurable: set STELLARIS_ASSET_UNIVERSE (server) to a comma-separated
 * symbol list, or edit the asset_universe table (migration 0006). Anything
 * configured is still passed through the meme classifier before it is shown.
 */

export const DEFAULT_UNIVERSE = [
  "DOGE",
  "SHIB",
  "PEPE",
  "BONK",
  "WIF",
  "FLOKI",
  "POPCAT",
  "BRETT",
  "MEW",
  "GIGA",
] as const;

/** Symbols that must never enter the active meme research universe. */
export const EXCLUDED_MAJORS = [
  "BTC",
  "WBTC",
  "ETH",
  "WETH",
  "SOL",
  "WSOL",
  "XRP",
  "BNB",
  "ADA",
  "AVAX",
  "LINK",
  "DOT",
  "TRX",
  "TON",
  "MATIC",
  "LTC",
  "BCH",
  "ATOM",
  "NEAR",
  "APT",
  "SUI",
  "ARB",
  "OP",
  "USDT",
  "USDC",
  "DAI",
  "FDUSD",
  "TUSD",
  "USDE",
] as const;

const EXCLUDED = new Set<string>(EXCLUDED_MAJORS);

/** True when a symbol is a mainstream/stable asset that Stellaris must not research. */
export function isExcludedMajor(symbol: string | null | undefined): boolean {
  return Boolean(symbol && EXCLUDED.has(symbol.trim().toUpperCase()));
}

function parse(list: string | undefined | null): string[] | null {
  if (!list) return null;
  const out = list
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .filter((s) => !EXCLUDED.has(s));
  return out.length ? out : null;
}

/** Symbols used for meme market discovery queries. Majors are always removed. */
export function universeSymbols(override?: string | null): string[] {
  return parse(override) ?? [...DEFAULT_UNIVERSE];
}

/** Search terms sent to the market source for a given symbol. */
export function searchTermsFor(symbols: string[]): string[] {
  return symbols;
}
