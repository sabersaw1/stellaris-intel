/**
 * COLLECTION GAPS + PROVIDER RUNTIME STATE (pure, deterministic)
 *
 * Stellaris must never imply that a period of time was monitored when no
 * provider delivered data. This module turns raw timestamps into truthful
 * statements: POLLING, STREAMING (bounded window), OFFLINE, GAP.
 */

export type CollectionMode = "POLLING" | "BOUNDED_WINDOW_STREAM" | "HYBRID" | "NOT COLLECTING";

export type RuntimeStatus =
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "DEGRADED"
  | "ERROR"
  | "OFFLINE"
  | "QUOTA_EXHAUSTED";

export type ProviderRuntime = {
  provider: string;
  status: RuntimeStatus;
  configured: boolean;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  /** Free or paid mode actually in force. */
  mode: "FREE" | "FREE TIER" | "PAID" | "PUBLIC" | "SELF HOSTED" | "UNKNOWN";
  /** Requests / points consumed, when the provider publishes it. */
  usage: { used: number | null; limit: number | null; note: string | null };
};

export type GapReport = {
  provider: string;
  /** Null when the provider has never succeeded. */
  lastSuccessAt: number | null;
  gapMs: number | null;
  /** Truthful sentence for the interface. */
  statement: string;
  /** True when the gap exceeds the expected cadence by 2x. */
  gapped: boolean;
};

export function describeGap(input: {
  provider: string;
  lastSuccessAt: number | null;
  expectedIntervalMs: number;
  configured: boolean;
  now?: number;
}): GapReport {
  const now = input.now ?? Date.now();
  if (!input.configured)
    return {
      provider: input.provider,
      lastSuccessAt: input.lastSuccessAt,
      gapMs: null,
      statement: "NOT CONNECTED — this provider has never been configured, so no period was monitored by it.",
      gapped: false,
    };
  if (input.lastSuccessAt === null)
    return {
      provider: input.provider,
      lastSuccessAt: null,
      gapMs: null,
      statement: "NO SUCCESSFUL REQUEST RECORDED — nothing has been collected from this provider.",
      gapped: true,
    };
  const gapMs = Math.max(0, now - input.lastSuccessAt);
  const gapped = gapMs > input.expectedIntervalMs * 2;
  const secs = Math.round(gapMs / 1000);
  return {
    provider: input.provider,
    lastSuccessAt: input.lastSuccessAt,
    gapMs,
    gapped,
    statement: gapped
      ? `GAP — no data received for ${secs}s (expected roughly every ${Math.round(input.expectedIntervalMs / 1000)}s). That period was not monitored.`
      : `Last success ${secs}s ago; collection is within its expected cadence.`,
  };
}

/** Maps a provider error to a runtime status without guessing. */
export function statusFromError(input: {
  configured: boolean;
  httpStatus?: number | null;
  error?: string | null;
  lastOkAt?: number | null;
}): RuntimeStatus {
  if (!input.configured) return "NOT_CONNECTED";
  const s = input.httpStatus ?? null;
  const msg = (input.error ?? "").toLowerCase();
  if (s === 402 || s === 429 || /quota|credit|points exhausted|rate limit exceeded/.test(msg)) return "QUOTA_EXHAUSTED";
  if (s !== null && s >= 500) return "OFFLINE";
  if (/timeout|econn|fetch failed|network/.test(msg)) return "OFFLINE";
  if (input.error) return input.lastOkAt ? "DEGRADED" : "ERROR";
  return "CONNECTED";
}

/**
 * Overall collection mode from the providers actually in use. Nothing is called
 * "continuous": PumpPortal is drained in bounded windows and DEX Screener is
 * polled, and both are stated as such.
 */
export function collectionMode(input: { pollingActive: boolean; boundedWindowActive: boolean }): {
  mode: CollectionMode;
  statement: string;
} {
  if (input.pollingActive && input.boundedWindowActive)
    return {
      mode: "HYBRID",
      statement:
        "HYBRID — market data is polled on a fixed cadence, and the Pump.fun launch feed is drained in short listening windows. Launches outside a listening window are not observed.",
    };
  if (input.pollingActive)
    return { mode: "POLLING", statement: "POLLING — market data is requested on a fixed cadence. This is not real-time streaming." };
  if (input.boundedWindowActive)
    return {
      mode: "BOUNDED_WINDOW_STREAM",
      statement: "BOUNDED WINDOW STREAM — a live feed is drained in short windows; time outside a window is not monitored.",
    };
  return { mode: "NOT COLLECTING", statement: "NOT COLLECTING — no provider is currently able to deliver data." };
}
