/**
 * FOMO OBSERVATION NORMALISATION (pure, deterministic, testable)
 *
 * A FOMO trade report is EVIDENCE, not truth. Normalising it never marks it
 * verified: verification requires an independent on-chain read, recorded
 * separately. Fields FOMO does not supply stay null.
 */

export type FomoRawTrade = Record<string, unknown>;

export type NormalizedWalletObservation = {
  traderHandle: string | null;
  walletAddress: string | null;
  chainId: string;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  action: "BUY" | "SELL" | "UNKNOWN";
  observedAt: number | null;
  amountTokens: number | null;
  priceUsd: number | null;
  valueUsd: number | null;
  txHash: string | null;
  reportedBy: "fomo";
  /** Always false here. Only an on-chain read may set this true. */
  verified: false;
  sourceConfidence: "REPORTED — UNVERIFIED";
  /** Fields the report did not contain. */
  missing: string[];
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numOf = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const timeOf = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return null;
};

function first(row: FomoRawTrade, keys: string[]): unknown {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null) return row[k];
  return null;
}

export function normalizeFomoTrade(row: FomoRawTrade): NormalizedWalletObservation {
  const rawSide = (str(first(row, ["side", "action", "type", "direction"])) ?? "").toUpperCase();
  const action: NormalizedWalletObservation["action"] =
    rawSide.includes("BUY") ? "BUY" : rawSide.includes("SELL") ? "SELL" : "UNKNOWN";

  const obs: NormalizedWalletObservation = {
    traderHandle: str(first(row, ["handle", "username", "trader", "user"])),
    walletAddress: str(first(row, ["wallet", "wallet_address", "address", "owner"])),
    chainId: (str(first(row, ["chain", "chain_id", "network"])) ?? "solana").toLowerCase(),
    tokenAddress: str(first(row, ["mint", "token_address", "token", "contract"])),
    tokenSymbol: str(first(row, ["symbol", "token_symbol", "ticker"])),
    action,
    observedAt: timeOf(first(row, ["timestamp", "time", "traded_at", "block_time", "created_at"])),
    amountTokens: numOf(first(row, ["amount", "token_amount", "quantity", "size"])),
    priceUsd: numOf(first(row, ["price", "price_usd", "usd_price"])),
    valueUsd: numOf(first(row, ["value_usd", "usd_value", "total_usd", "notional"])),
    txHash: str(first(row, ["tx", "tx_hash", "signature", "transaction"])),
    reportedBy: "fomo",
    verified: false,
    sourceConfidence: "REPORTED — UNVERIFIED",
    missing: [],
  };

  if (!obs.walletAddress) obs.missing.push("wallet address");
  if (!obs.tokenAddress) obs.missing.push("token mint address");
  if (obs.observedAt === null) obs.missing.push("trade timestamp");
  if (obs.action === "UNKNOWN") obs.missing.push("buy/sell direction");
  if (obs.valueUsd === null && obs.priceUsd === null) obs.missing.push("trade size in USD");
  if (!obs.txHash) obs.missing.push("transaction id (needed for on-chain verification)");

  return obs;
}

/** Keeps only reports complete enough to be stored as evidence. */
export function usableFomoObservations(rows: FomoRawTrade[]): {
  usable: NormalizedWalletObservation[];
  discarded: { reason: string }[];
} {
  const usable: NormalizedWalletObservation[] = [];
  const discarded: { reason: string }[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const o = normalizeFomoTrade(row);
    if (!o.tokenAddress) {
      discarded.push({ reason: "no token address, so the observation cannot be attached to a token" });
      continue;
    }
    if (o.observedAt === null) {
      discarded.push({ reason: "no timestamp, so the observation cannot be placed on a timeline" });
      continue;
    }
    // Dedup on the strongest identity available.
    const key = o.txHash ?? `${o.walletAddress ?? "?"}|${o.tokenAddress}|${o.action}|${Math.floor(o.observedAt / 60_000)}`;
    if (seen.has(key)) {
      discarded.push({ reason: "duplicate of an observation already accepted" });
      continue;
    }
    seen.add(key);
    usable.push(o);
  }

  return { usable, discarded };
}
