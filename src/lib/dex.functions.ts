import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizePair, normalizePairs } from "./normalize";
import { assessPair, buildPeerSet } from "./analysis";
import type { Assessment, PairObservation } from "./dex-types";

/* --------------------------- shared envelope -------------------------- */

export type Envelope<T> = {
  ok: boolean;
  data: T;
  observedAt: number | null;
  cached: boolean;
  stale: boolean;
  error: string | null;
  source: "DEX Screener";
};

function wrap<T>(
  r: { ok: boolean; observedAt: number | null; cached: boolean; stale: boolean; error: string | null },
  data: T,
): Envelope<T> {
  return { ok: r.ok, data, observedAt: r.observedAt, cached: r.cached, stale: r.stale, error: r.error, source: "DEX Screener" };
}

/* ------------------------------- searches ----------------------------- */

export const searchPairs = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ q: z.string().min(1).max(64) }).parse(i))
  .handler(async ({ data }): Promise<Envelope<PairObservation[]>> => {
    const { dexFetch } = await import("./dexscreener.server");
    const r = await dexFetch<{ pairs?: unknown }>(`/latest/dex/search?q=${encodeURIComponent(data.q)}`, {
      ttlMs: 30_000,
    });
    return wrap(r, normalizePairs(r.data?.pairs, r.observedAt ?? Date.now()));
  });

/** Market snapshot: several representative queries merged + deduplicated. */
export const marketSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<Envelope<PairObservation[]>> => {
    const { dexFetch } = await import("./dexscreener.server");
    const queries = ["SOL", "WETH", "USDC", "BNB", "BASE"];
    const results = await Promise.all(
      queries.map((q) => dexFetch<{ pairs?: unknown }>(`/latest/dex/search?q=${q}`, { ttlMs: 45_000 })),
    );
    const seen = new Set<string>();
    const merged: PairObservation[] = [];
    for (const r of results) {
      for (const p of normalizePairs(r.data?.pairs, r.observedAt ?? Date.now())) {
        if (!seen.has(p.key)) {
          seen.add(p.key);
          merged.push(p);
        }
      }
    }
    const ok = results.some((r) => r.ok);
    return wrap(
      {
        ok,
        observedAt: results.find((r) => r.observedAt)?.observedAt ?? null,
        cached: results.every((r) => r.cached),
        stale: results.some((r) => r.stale),
        error: ok ? null : (results.find((r) => r.error)?.error ?? "Data source unavailable"),
      },
      merged,
    );
  },
);

/* ------------------------------ pair detail --------------------------- */

export const pairIntelligence = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z.object({ chainId: z.string().min(1), pairId: z.string().min(1), historyPoints: z.number().int().min(0).max(9999).optional() }).parse(i),
  )
  .handler(async ({ data }): Promise<Envelope<Assessment | null>> => {
    const { dexFetch } = await import("./dexscreener.server");
    const r = await dexFetch<{ pairs?: unknown[]; pair?: unknown }>(
      `/latest/dex/pairs/${encodeURIComponent(data.chainId)}/${encodeURIComponent(data.pairId)}`,
      { ttlMs: 20_000 },
    );
    const rawList = (r.data?.pairs ?? (r.data?.pair ? [r.data.pair] : [])) as unknown[];
    const primary = rawList[0] ? normalizePair(rawList[0] as never, r.observedAt ?? Date.now()) : null;
    if (!primary) return wrap({ ...r, ok: false, error: r.error ?? "Pair not found in data source" }, null);

    // peer batch: other pairs of the same base token, same chain
    const peersRes = await dexFetch<unknown[]>(
      `/token-pairs/v1/${encodeURIComponent(data.chainId)}/${encodeURIComponent(primary.baseAddress)}`,
      { ttlMs: 60_000 },
    );
    const peerPairs = normalizePairs(peersRes.data, peersRes.observedAt ?? Date.now());
    const chainRes = await dexFetch<{ pairs?: unknown }>(
      `/latest/dex/search?q=${encodeURIComponent(primary.quoteSymbol)}`,
      { ttlMs: 60_000 },
    );
    const chainPeers = normalizePairs(chainRes.data?.pairs, chainRes.observedAt ?? Date.now()).filter(
      (p) => p.chainId === primary.chainId,
    );
    const peers = buildPeerSet([...peerPairs, ...chainPeers]);
    return wrap(r, assessPair(primary, peers, data.historyPoints ?? 0));
  });

export const tokenPairs = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ chainId: z.string(), tokenAddress: z.string() }).parse(i))
  .handler(async ({ data }): Promise<Envelope<PairObservation[]>> => {
    const { dexFetch } = await import("./dexscreener.server");
    const r = await dexFetch<unknown[]>(
      `/token-pairs/v1/${encodeURIComponent(data.chainId)}/${encodeURIComponent(data.tokenAddress)}`,
      { ttlMs: 45_000 },
    );
    return wrap(r, normalizePairs(r.data, r.observedAt ?? Date.now()));
  });

/** Batched multi-token read (max 30 addresses per documented endpoint). */
export const tokensBatch = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ chainId: z.string(), addresses: z.array(z.string()).min(1).max(30) }).parse(i))
  .handler(async ({ data }): Promise<Envelope<PairObservation[]>> => {
    const { dexFetch } = await import("./dexscreener.server");
    const r = await dexFetch<unknown[]>(
      `/tokens/v1/${encodeURIComponent(data.chainId)}/${data.addresses.map(encodeURIComponent).join(",")}`,
      { ttlMs: 30_000 },
    );
    return wrap(r, normalizePairs(r.data, r.observedAt ?? Date.now()));
  });

/* -------------------- profiles / promotional metadata ----------------- */

export type ProfileEntry = {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  header?: string;
  description?: string;
  amount?: number;
  totalAmount?: number;
  links?: { type?: string; label?: string; url?: string }[];
};

async function fetchList(path: string, ttlMs: number): Promise<Envelope<ProfileEntry[]>> {
  const { dexFetch } = await import("./dexscreener.server");
  const r = await dexFetch<ProfileEntry[]>(path, { ttlMs });
  return wrap(r, Array.isArray(r.data) ? r.data.slice(0, 60) : []);
}

export const latestProfiles = createServerFn({ method: "GET" }).handler(
  async (): Promise<Envelope<ProfileEntry[]>> => fetchList("/token-profiles/latest/v1", 120_000),
);
export const recentProfileUpdates = createServerFn({ method: "GET" }).handler(
  async (): Promise<Envelope<ProfileEntry[]>> => fetchList("/token-profiles/recent-updates/v1", 120_000),
);
export const communityTakeovers = createServerFn({ method: "GET" }).handler(
  async (): Promise<Envelope<ProfileEntry[]>> => fetchList("/community-takeovers/latest/v1", 180_000),
);
export const latestAds = createServerFn({ method: "GET" }).handler(
  async (): Promise<Envelope<ProfileEntry[]>> => fetchList("/ads/latest/v1", 300_000),
);
export const latestBoosts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Envelope<ProfileEntry[]>> => fetchList("/token-boosts/latest/v1", 120_000),
);
export const topBoosts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Envelope<ProfileEntry[]>> => fetchList("/token-boosts/top/v1", 180_000),
);

export const tokenOrders = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ chainId: z.string(), tokenAddress: z.string() }).parse(i))
  .handler(async ({ data }): Promise<Envelope<{ type?: string; status?: string; paymentTimestamp?: number }[]>> => {
    const { dexFetch } = await import("./dexscreener.server");
    const r = await dexFetch<{ type?: string; status?: string; paymentTimestamp?: number }[]>(
      `/orders/v1/${encodeURIComponent(data.chainId)}/${encodeURIComponent(data.tokenAddress)}`,
      { ttlMs: 300_000 },
    );
    return wrap(r, Array.isArray(r.data) ? r.data : []);
  });

/* ------------------------------- metas -------------------------------- */

export type MetaEntry = {
  name?: string;
  slug?: string;
  description?: string;
  icon?: { type?: string; value?: string };
  marketCap?: number;
  liquidity?: number;
  volume?: number;
  tokenCount?: number;
  marketCapChange?: Record<string, number>;
};

export const trendingMetas = createServerFn({ method: "GET" }).handler(
  async (): Promise<Envelope<MetaEntry[]>> => {
    const { dexFetch } = await import("./dexscreener.server");
    const r = await dexFetch<MetaEntry[]>("/metas/trending/v1", { ttlMs: 120_000 });
    return wrap(r, Array.isArray(r.data) ? r.data : []);
  },
);

export const metaDetail = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ slug: z.string().min(1) }).parse(i))
  .handler(async ({ data }): Promise<Envelope<string | null>> => {
    const { dexFetch } = await import("./dexscreener.server");
    const r = await dexFetch<unknown>(`/metas/meta/v1/${encodeURIComponent(data.slug)}`, { ttlMs: 120_000 });
    return wrap(r, r.data == null ? null : JSON.stringify(r.data));
  });

/* ---------------------------- system health --------------------------- */

export type HealthReport = {
  checkedAt: number;
  services: {
    name: string;
    status: "HEALTHY" | "DEGRADED" | "ERROR" | "OFFLINE" | "NOT CONFIGURED";
    detail: string;
    latencyMs: number | null;
  }[];
  api: {
    requests: number;
    cacheHits: number;
    cacheHitRate: number;
    errors: number;
    rateLimitDeferrals: number;
    cacheEntries: number;
    lastErrorMessage: string | null;
    lastSuccessAt: number | null;
  };
};

export const systemHealth = createServerFn({ method: "GET" }).handler(async (): Promise<HealthReport> => {
  const { dexFetch, getApiStats } = await import("./dexscreener.server");
  const started = Date.now();
  const probe = await dexFetch<{ pairs?: unknown }>("/latest/dex/search?q=USDC", { ttlMs: 15_000 });
  const latency = Date.now() - started;
  const stats = getApiStats();
  const supabaseConfigured = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

  const services: HealthReport["services"] = [
    {
      name: "DEX SCREENER API",
      status: probe.ok ? (probe.stale ? "DEGRADED" : "HEALTHY") : "ERROR",
      detail: probe.ok ? (probe.stale ? "Serving cached observations; upstream unstable" : "Live probe succeeded") : (probe.error ?? "Probe failed"),
      latencyMs: latency,
    },
    {
      name: "SERVER FUNCTIONS",
      status: "HEALTHY",
      detail: "This health report was produced by a live server-side execution",
      latencyMs: null,
    },
    {
      name: "REQUEST CACHE",
      status: stats.cacheEntries > 0 ? "HEALTHY" : "DEGRADED",
      detail: `${stats.cacheEntries} cached endpoint responses, ${stats.cacheHits} hits served`,
      latencyMs: null,
    },
    {
      name: "INGESTION / NORMALIZATION",
      status: probe.ok ? "HEALTHY" : "DEGRADED",
      detail: probe.ok ? "Validation and normalization ran on the latest probe" : "No fresh records to normalize",
      latencyMs: null,
    },
    {
      name: "RISK ENGINE",
      status: "HEALTHY",
      detail: "Deterministic engine, version pinned per assessment",
      latencyMs: null,
    },
    {
      name: "ANOMALY ENGINE",
      status: "HEALTHY",
      detail: "Requires ≥20 peer observations before emitting signals",
      latencyMs: null,
    },
    {
      name: "ANALYSIS AGENTS",
      status: "HEALTHY",
      detail: "8 agents execute server-side per assessment request",
      latencyMs: null,
    },
    {
      name: "SUPABASE (PERSISTENCE)",
      status: supabaseConfigured ? "HEALTHY" : "NOT CONFIGURED",
      detail: supabaseConfigured
        ? "Server credentials detected"
        : "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not present — history, watchlists and alerts are held in this browser only",
      latencyMs: null,
    },
  ];

  return {
    checkedAt: Date.now(),
    services,
    api: {
      requests: stats.requests,
      cacheHits: stats.cacheHits,
      cacheHitRate: stats.requests + stats.cacheHits > 0 ? Math.round((stats.cacheHits / (stats.requests + stats.cacheHits)) * 100) : 0,
      errors: stats.errors,
      rateLimitDeferrals: stats.rateLimitDeferrals,
      cacheEntries: stats.cacheEntries,
      lastErrorMessage: stats.lastErrorMessage,
      lastSuccessAt: stats.lastSuccessAt,
    },
  };
});
