import type { PairObservation, RawPair } from "./dex-types";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** VALIDATION + NORMALIZATION stage of the pipeline. Drops unusable records. */
export function normalizePair(raw: RawPair, observedAt = Date.now()): PairObservation | null {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.chainId || !raw.pairAddress || !raw.baseToken?.symbol) return null;

  const t = (k: string) => {
    const v = raw.txns?.[k];
    return v && typeof v.buys === "number" && typeof v.sells === "number"
      ? { buys: v.buys, sells: v.sells }
      : null;
  };

  return {
    key: `${raw.chainId}:${raw.pairAddress}`,
    chainId: raw.chainId,
    dexId: raw.dexId ?? "unknown",
    pairAddress: raw.pairAddress,
    url: raw.url ?? null,
    baseSymbol: raw.baseToken.symbol,
    baseName: raw.baseToken.name ?? raw.baseToken.symbol,
    baseAddress: raw.baseToken.address,
    quoteSymbol: raw.quoteToken?.symbol ?? "?",
    priceUsd: num(raw.priceUsd),
    priceChange: {
      m5: num(raw.priceChange?.["m5"]),
      h1: num(raw.priceChange?.["h1"]),
      h6: num(raw.priceChange?.["h6"]),
      h24: num(raw.priceChange?.["h24"]),
    },
    volume: {
      m5: num(raw.volume?.["m5"]),
      h1: num(raw.volume?.["h1"]),
      h6: num(raw.volume?.["h6"]),
      h24: num(raw.volume?.["h24"]),
    },
    txns: { m5: t("m5"), h1: t("h1"), h6: t("h6"), h24: t("h24") },
    liquidityUsd: num(raw.liquidity?.usd),
    fdv: num(raw.fdv),
    marketCap: num(raw.marketCap),
    pairCreatedAt: num(raw.pairCreatedAt),
    boostsActive: num(raw.boosts?.active),
    hasProfile: Boolean(raw.info?.imageUrl || raw.info?.websites?.length || raw.info?.socials?.length),
    imageUrl: raw.info?.imageUrl ?? null,
    observedAt,
  };
}

export function normalizePairs(list: unknown, observedAt = Date.now()): PairObservation[] {
  if (!Array.isArray(list)) return [];
  const out: PairObservation[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const p = normalizePair(raw as RawPair, observedAt);
    if (p && !seen.has(p.key)) {
      seen.add(p.key);
      out.push(p);
    }
  }
  return out;
}
