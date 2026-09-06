/**
 * Centralized DEX Screener request layer (server-only).
 * Provides: caching, request deduplication, rate-limit budgeting,
 * retries with exponential backoff, timeouts and error accounting.
 *
 * Docs base: https://api.dexscreener.com
 */

const BASE = "https://api.dexscreener.com";

type CacheEntry = { data: unknown; storedAt: number; ttl: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

// Rate budget: DEX Screener documents 300 req/min on the lighter endpoints and
// 60 req/min on the pair/search endpoints. We stay conservative.
const WINDOW_MS = 60_000;
let windowStart = Date.now();
let windowCount = 0;
const WINDOW_BUDGET = 55;

export type ApiStats = {
  requests: number;
  cacheHits: number;
  errors: number;
  rateLimitDeferrals: number;
  lastErrorMessage: string | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
  cacheEntries: number;
};

const stats: ApiStats = {
  requests: 0,
  cacheHits: 0,
  errors: 0,
  rateLimitDeferrals: 0,
  lastErrorMessage: null,
  lastErrorAt: null,
  lastSuccessAt: null,
  cacheEntries: 0,
};

export function getApiStats(): ApiStats {
  return { ...stats, cacheEntries: cache.size };
}

function budgetAvailable(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  return windowCount < WINDOW_BUDGET;
}

export type DexResult<T> = {
  ok: boolean;
  data: T | null;
  /** epoch ms the underlying observation was fetched from the API */
  observedAt: number | null;
  cached: boolean;
  stale: boolean;
  error: string | null;
  source: "dexscreener";
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a DEX Screener endpoint. Never throws: always returns a DexResult so
 * the UI can honestly render DATA UNAVAILABLE / STALE DATA states.
 */
export async function dexFetch<T>(
  path: string,
  opts: { ttlMs?: number; staleMs?: number; retries?: number; timeoutMs?: number } = {},
): Promise<DexResult<T>> {
  const ttlMs = opts.ttlMs ?? 30_000;
  const staleMs = opts.staleMs ?? 5 * 60_000;
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 9_000;
  const key = path;

  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.storedAt < hit.ttl) {
    stats.cacheHits++;
    return {
      ok: true,
      data: hit.data as T,
      observedAt: hit.storedAt,
      cached: true,
      stale: false,
      error: null,
      source: "dexscreener",
    };
  }

  const existing = inflight.get(key);
  if (existing) {
    const data = (await existing) as T | null;
    const entry = cache.get(key);
    return {
      ok: data !== null,
      data,
      observedAt: entry?.storedAt ?? null,
      cached: true,
      stale: false,
      error: data === null ? "Request failed" : null,
      source: "dexscreener",
    };
  }

  if (!budgetAvailable()) {
    stats.rateLimitDeferrals++;
    if (hit) {
      return {
        ok: true,
        data: hit.data as T,
        observedAt: hit.storedAt,
        cached: true,
        stale: now - hit.storedAt > staleMs,
        error: null,
        source: "dexscreener",
      };
    }
    return {
      ok: false,
      data: null,
      observedAt: null,
      cached: false,
      stale: false,
      error: "Request budget reached for this minute",
      source: "dexscreener",
    };
  }

  const run = (async (): Promise<T | null> => {
    let lastErr = "Unknown error";
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        windowCount++;
        stats.requests++;
        const res = await fetch(BASE + path, {
          signal: ctrl.signal,
          headers: { accept: "application/json" },
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) {
          lastErr = `Upstream responded ${res.status}`;
          await sleep(400 * Math.pow(2, attempt));
          continue;
        }
        if (!res.ok) {
          lastErr = `Upstream responded ${res.status}`;
          break;
        }
        const json = (await res.json()) as T;
        cache.set(key, { data: json, storedAt: Date.now(), ttl: ttlMs });
        stats.lastSuccessAt = Date.now();
        return json;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e instanceof Error ? e.message : "Network error";
        await sleep(400 * Math.pow(2, attempt));
      }
    }
    stats.errors++;
    stats.lastErrorMessage = lastErr;
    stats.lastErrorAt = Date.now();
    return null;
  })();

  inflight.set(key, run);
  let data: T | null = null;
  try {
    data = await run;
  } finally {
    inflight.delete(key);
  }

  if (data === null && hit) {
    return {
      ok: true,
      data: hit.data as T,
      observedAt: hit.storedAt,
      cached: true,
      stale: true,
      error: stats.lastErrorMessage,
      source: "dexscreener",
    };
  }

  return {
    ok: data !== null,
    data,
    observedAt: data !== null ? Date.now() : null,
    cached: false,
    stale: false,
    error: data === null ? stats.lastErrorMessage : null,
    source: "dexscreener",
  };
}
