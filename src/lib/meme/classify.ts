/**
 * MEME UNIVERSE CLASSIFIER (pure, deterministic, testable)
 *
 * STELLARIS researches meme coins only. Infrastructure inevitably encounters
 * majors, stablecoins, wrapped assets and liquid-staking tokens; this module
 * keeps them out of the user-facing research universe.
 *
 * Rules are explicit and reported, so every inclusion/exclusion is explainable.
 * When the input lacks the fields needed to decide, the verdict is UNKNOWN —
 * never a guess, never a silent include.
 */

export type MemeVerdict = "MEME" | "NOT MEME" | "UNKNOWN";

export type MemeClassification = {
  verdict: MemeVerdict;
  /** Rules that fired, in plain English. */
  reasons: string[];
  /** Fields that were missing and limited the decision. */
  missing: string[];
};

export type ClassifierInput = {
  chainId: string | null;
  dexId: string | null;
  baseSymbol: string | null;
  baseName: string | null;
  /** Pump.fun mint origin, when a discovery source confirmed it. */
  pumpfunOrigin?: boolean;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  /** Epoch ms the pair was created, when the source supplied it. */
  pairCreatedAt: number | null;
  /** Reference time for age maths. */
  now?: number;
};

/** Chains where the meme market actually lives. Others are out of universe. */
export const MEME_CHAINS = new Set(["solana", "base", "bsc", "ethereum", "abstract", "tron", "sui"]);

/** Never meme coins. Matched on exact symbol. */
export const EXCLUDED_SYMBOLS = new Set([
  "BTC", "WBTC", "CBBTC", "TBTC", "ETH", "WETH", "STETH", "WSTETH", "RETH", "CBETH", "WEETH",
  "SOL", "WSOL", "MSOL", "JITOSOL", "BSOL", "JUPSOL", "INF",
  "BNB", "WBNB", "XRP", "ADA", "AVAX", "WAVAX", "LINK", "DOT", "MATIC", "POL", "TRX", "TON",
  "LTC", "BCH", "XLM", "XMR", "ATOM", "NEAR", "APT", "SUI", "SEI", "TIA", "INJ", "ARB", "OP",
  "USDC", "USDT", "DAI", "FDUSD", "TUSD", "USDE", "SUSDE", "PYUSD", "USDS", "USD1", "EURC",
  "FRAX", "LUSD", "GHO", "CRVUSD", "USDD", "BUSD", "XAUT", "PAXG",
  "UNI", "AAVE", "COMP", "MKR", "SNX", "CRV", "LDO", "RPL", "PENDLE", "ENA", "ETHFI",
  "JUP", "JTO", "RAY", "ORCA", "PYTH", "W", "WIF" /* intentionally re-allowed below */,
]);

/** Symbols wrongly caught by the exclusion list that are genuinely memes. */
const RECLAIMED_SYMBOLS = new Set(["WIF"]);

/** Substrings that indicate infrastructure rather than a meme. */
const INFRA_HINTS = [
  "staked", "liquid stak", "wrapped", "vault", "index", "etf", "receipt", "lp token",
  "restaked", "yield", "bond", "tokenized", "t-bill", "treasury",
];

/** Pump.fun and the launchpads/routers meme coins actually trade through. */
const MEME_DEX_HINTS = [
  "pumpfun", "pumpswap", "pump", "raydium", "meteora", "moonshot", "launchlab", "bags",
  "believe", "boop", "sunpump", "fourmeme", "four.meme", "uniswap", "aerodrome", "pancakeswap",
];

const STABLE_NAME_HINTS = ["usd", "stablecoin", "euro", "gold"];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Above this market cap a token is no longer a small-cap meme candidate. */
export const MAX_MEME_MARKET_CAP_USD = 2_000_000_000;
/** Young pairs are strong meme evidence on meme chains. */
export const YOUNG_PAIR_MS = 30 * DAY;

export function classifyMeme(input: ClassifierInput): MemeClassification {
  const reasons: string[] = [];
  const missing: string[] = [];
  const now = input.now ?? Date.now();

  const symbol = (input.baseSymbol ?? "").trim().toUpperCase();
  const name = (input.baseName ?? "").trim().toLowerCase();
  const chain = (input.chainId ?? "").trim().toLowerCase();
  const dex = (input.dexId ?? "").trim().toLowerCase();

  if (!symbol) missing.push("token symbol");
  if (!chain) missing.push("chain");

  // ---- hard exclusions ------------------------------------------------------
  if (symbol && EXCLUDED_SYMBOLS.has(symbol) && !RECLAIMED_SYMBOLS.has(symbol)) {
    return {
      verdict: "NOT MEME",
      reasons: [`${symbol} is a major, stablecoin, wrapped or infrastructure asset`],
      missing,
    };
  }
  if (name && INFRA_HINTS.some((h) => name.includes(h))) {
    return { verdict: "NOT MEME", reasons: [`Name describes an infrastructure asset, not a meme`], missing };
  }
  if (name && STABLE_NAME_HINTS.some((h) => name.includes(h)) && /usd|eur|gold/.test(symbol.toLowerCase())) {
    return { verdict: "NOT MEME", reasons: ["Name and symbol describe a stable or commodity-pegged asset"], missing };
  }
  if (chain && !MEME_CHAINS.has(chain)) {
    return { verdict: "NOT MEME", reasons: [`${input.chainId} is outside the tracked meme chains`], missing };
  }

  // ---- positive evidence ----------------------------------------------------
  let score = 0;

  if (input.pumpfunOrigin) {
    reasons.push("Launched on Pump.fun");
    score += 3;
  }
  if (dex && MEME_DEX_HINTS.some((h) => dex.includes(h))) {
    reasons.push(`Trades on ${input.dexId}, a venue meme coins launch and route through`);
    score += 1;
  }

  const cap = input.marketCapUsd ?? input.fdvUsd;
  if (cap === null) {
    missing.push("market cap / FDV");
  } else if (cap > MAX_MEME_MARKET_CAP_USD) {
    return {
      verdict: "NOT MEME",
      reasons: [`Valuation above $${(MAX_MEME_MARKET_CAP_USD / 1e9).toFixed(0)}B is outside the meme universe`],
      missing,
    };
  } else {
    reasons.push(`Small-cap valuation (${Math.round(cap).toLocaleString()} USD)`);
    score += 1;
  }

  if (input.pairCreatedAt === null) {
    missing.push("pair creation time");
  } else {
    const ageMs = now - input.pairCreatedAt;
    if (ageMs >= 0 && ageMs <= YOUNG_PAIR_MS) {
      reasons.push(`Pair is ${Math.max(1, Math.round(ageMs / DAY))} day(s) old`);
      score += 2;
    }
  }

  if (chain && MEME_CHAINS.has(chain)) {
    reasons.push(`On ${input.chainId}, a tracked meme chain`);
    score += 1;
  }

  if (score >= 3) return { verdict: "MEME", reasons, missing };
  if (missing.length) return { verdict: "UNKNOWN", reasons, missing };
  return { verdict: "NOT MEME", reasons: reasons.length ? reasons : ["No meme evidence found"], missing };
}

/** Convenience filter: keeps only confirmed meme markets. */
export function keepMemesOnly<T extends ClassifierInput>(rows: T[], now = Date.now()): T[] {
  return rows.filter((r) => classifyMeme({ ...r, now }).verdict === "MEME");
}
