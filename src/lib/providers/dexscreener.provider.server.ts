/**
 * DEX Screener provider (server-only).
 *
 * Wraps the existing hardened DEX Screener client (cache, in-flight dedup,
 * conservative request budget, retries with backoff, timeouts, stale fallback)
 * in the STELLARIS provider contract. No key is required by the public API.
 */

import { dexFetch, getApiStats } from "../dexscreener.server";
import { normalizePairs } from "../normalize";
import type { PairObservation } from "../dex-types";
import {
  capability,
  providerFailed,
  type CapabilityDeclaration,
  type Provider,
  type ProviderHealth,
  type ProviderResult,
} from "./types";

function capabilities(): CapabilityDeclaration[] {
  return [
    capability("MARKET_SNAPSHOT", "SUPPORTED", "Price, liquidity, volume and transaction counts per pair."),
    capability("PAIR_DISCOVERY", "SUPPORTED", "Search and boosted/trending pair listings across supported chains."),
    capability("TOKEN_METADATA", "SUPPORTED", "Symbol, name, socials and websites as published on the pair."),
    capability("TOKEN_DISCOVERY", "SUPPORTED", "New pairs surface here, usually after a launch rather than at mint."),
    capability("HOLDERS", "UNSUPPORTED", "DEX Screener does not publish holder counts."),
    capability("WALLET_ACTIVITY", "UNSUPPORTED", "No per-wallet data is available from this API."),
    capability("TRADER_ACTIVITY", "UNSUPPORTED", "No per-trader data is available from this API."),
  ];
}

function toResult<T>(r: { ok: boolean; data: T | null; observedAt: number | null; cached: boolean; stale: boolean; error: string | null }): ProviderResult<T> {
  return {
    ok: r.ok,
    data: r.data,
    source: "dexscreener",
    observedAt: r.observedAt,
    receivedAt: Date.now(),
    cached: r.cached,
    stale: r.stale,
    error: r.error,
    unsupportedReason: null,
  };
}

export const dexscreenerProvider: Provider<PairObservation, PairObservation[]> = {
  id: "dexscreener",
  name: "DEX Screener",
  authKind: "NONE",
  credential: null,
  whereToGet: null,
  configured: () => true,
  capabilities,
  health: async (): Promise<ProviderHealth> => {
    const s = getApiStats();
    return {
      id: "dexscreener",
      name: "DEX Screener",
      status: s.lastErrorAt && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt) ? "DEGRADED" : "CONNECTED",
      authKind: "NONE",
      credential: null,
      whereToGet: null,
      configured: true,
      lastRequestAt: s.lastSuccessAt ?? s.lastErrorAt,
      lastOkAt: s.lastSuccessAt,
      lastErrorAt: s.lastErrorAt,
      lastError: s.lastErrorMessage,
      latencyMs: null,
      rateLimitNote: `Self-imposed budget of 55 requests/minute; ${s.cacheHits} cache hits and ${s.rateLimitDeferrals} deferrals so far this process.`,
      capabilities: capabilities(),
      blockedReason: null,
    };
  },
  discover: async (input) => {
    const query = typeof input?.["query"] === "string" ? (input["query"] as string) : null;
    if (!query) return providerFailed<PairObservation[]>("dexscreener", "A search query is required.");
    const r = await dexFetch<{ pairs?: unknown }>(`/latest/dex/search?q=${encodeURIComponent(query)}`, { ttlMs: 20_000 });
    const observedAt = r.observedAt ?? Date.now();
    return toResult<PairObservation[]>({
      ...r,
      data: r.data ? normalizePairs((r.data as { pairs?: unknown }).pairs, observedAt) : null,
    });
  },
  fetch: async (input) => {
    const chainId = input["chainId"];
    const addresses = input["tokenAddresses"];
    if (typeof chainId !== "string" || typeof addresses !== "string")
      return providerFailed<PairObservation[]>("dexscreener", "chainId and tokenAddresses are required.");
    const r = await dexFetch<unknown>(`/tokens/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(addresses)}`, {
      ttlMs: 12_000,
    });
    const observedAt = r.observedAt ?? Date.now();
    return toResult<PairObservation[]>({ ...r, data: r.data ? normalizePairs(r.data, observedAt) : null });
  },
};
