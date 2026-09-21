/**
 * FOMO provider (server-only).
 *
 * fomo.family (FOMO) ships no public API of its own. The only documented,
 * non-scraping access path is the independent FOMO API at api.fomoapi.io,
 * which requires a bearer key. Until that key is configured this provider
 * reports NOT CONNECTED and returns no data — it never guesses.
 */

import {
  capability,
  providerFailed,
  providerOk,
  providerUnsupported,
  type CapabilityDeclaration,
  type Provider,
  type ProviderHealth,
  type ProviderResult,
} from "./types";

const BASE = "https://api.fomoapi.io";

const key = (): string | null => {
  const v = process.env["FOMO_API_KEY"];
  return v && v.trim() ? v.trim() : null;
};

const state = {
  lastRequestAt: null as number | null,
  lastOkAt: null as number | null,
  lastErrorAt: null as number | null,
  lastError: null as string | null,
  latencyMs: null as number | null,
};

function capabilities(): CapabilityDeclaration[] {
  const s = key() ? "SUPPORTED" : "REQUIRES_CREDENTIAL";
  return [
    capability("TRADER_DISCOVERY", s, "Ranked trader leaderboards with realized PnL and volume."),
    capability("TRADER_ACTIVITY", s, "Per-trader trade history, holdings and linked wallets."),
    capability("ACCOUNT_IDENTITY", s, "Resolves a social handle to its Solana and EVM wallet addresses."),
    capability("SOCIAL_POSTS", s, "Trader theses — the stated reason behind a position."),
    capability("STREAMING", s, "Websocket app feed; realtime on a free key for 7 days, then delayed."),
    capability("MARKET_SNAPSHOT", "UNSUPPORTED", "Price and liquidity come from DEX Screener, not from this provider."),
  ];
}

async function call<T>(path: string, timeoutMs = 12_000): Promise<ProviderResult<T>> {
  const k = key();
  if (!k) return providerUnsupported<T>("fomo", "FOMO_API_KEY is not configured.");
  const started = Date.now();
  state.lastRequestAt = started;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${k}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    state.latencyMs = Date.now() - started;
    if (res.status === 401) {
      state.lastErrorAt = Date.now();
      state.lastError = "FOMO rejected the API key (401).";
      return providerFailed<T>("fomo", state.lastError);
    }
    if (res.status === 429) {
      state.lastErrorAt = Date.now();
      state.lastError = "FOMO rate limit or credit budget reached (429).";
      return providerFailed<T>("fomo", state.lastError);
    }
    if (!res.ok) {
      state.lastErrorAt = Date.now();
      state.lastError = `FOMO responded ${res.status}.`;
      return providerFailed<T>("fomo", state.lastError);
    }
    const data = (await res.json()) as T;
    state.lastOkAt = Date.now();
    state.lastError = null;
    return providerOk<T>("fomo", data, null);
  } catch (e) {
    state.lastErrorAt = Date.now();
    state.lastError = e instanceof Error ? e.message : "FOMO request failed.";
    return providerFailed<T>("fomo", state.lastError);
  }
}

export const fomoProvider: Provider<Record<string, unknown>, Record<string, unknown>> = {
  id: "fomo",
  name: "FOMO social trading data (independent FOMO API)",
  authKind: "API_KEY",
  credential: "FOMO_API_KEY",
  whereToGet: "Create a key at fomoapi.io. A free key covers every endpoint with a monthly credit allowance.",
  configured: () => Boolean(key()),
  capabilities,
  health: async (): Promise<ProviderHealth> => ({
    id: "fomo",
    name: fomoProvider.name,
    status: key() ? (state.lastError ? "DEGRADED" : "CONNECTED") : "NOT CONNECTED",
    authKind: "API_KEY",
    credential: "FOMO_API_KEY",
    whereToGet: fomoProvider.whereToGet,
    configured: Boolean(key()),
    lastRequestAt: state.lastRequestAt,
    lastOkAt: state.lastOkAt,
    lastErrorAt: state.lastErrorAt,
    lastError: state.lastError,
    latencyMs: state.latencyMs,
    rateLimitNote: "Credit-metered per month; STELLARIS keeps trader refreshes event-driven to control cost.",
    capabilities: capabilities(),
    blockedReason: key()
      ? null
      : "fomo.family has no public API. STELLARIS uses the independent, documented FOMO API, which needs FOMO_API_KEY.",
  }),
  discover: async (input) => {
    const window = typeof input?.["window"] === "string" ? (input["window"] as string) : "all";
    const r = await call<unknown>(`/v2/leaderboard/${encodeURIComponent(window)}`);
    if (!r.ok) return { ...r, data: null } as ProviderResult<Record<string, unknown>[]>;
    const rows = Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [];
    return { ...r, data: rows } as ProviderResult<Record<string, unknown>[]>;
  },
  fetch: async (input) => {
    const handle = input["handle"];
    if (typeof handle !== "string" || !handle)
      return providerFailed<Record<string, unknown>>("fomo", "A trader handle is required.");
    return call<Record<string, unknown>>(`/v2/users/${encodeURIComponent(handle)}`);
  },
};
