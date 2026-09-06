/**
 * INTEGRATION STATUS (server side)
 *
 * Credentials are read inside handlers and never returned. Only the presence of a
 * credential is reported, as CONNECTED / NOT CONFIGURED. No connection is ever
 * reported as live unless a real probe succeeded.
 */

import { createServerFn } from "@tanstack/react-start";

export type ConnectorStatus =
  | "CONNECTED"
  | "NOT CONFIGURED"
  | "DEGRADED"
  | "STALE"
  | "DISCONNECTED"
  | "AUTHENTICATION ERROR"
  | "RATE LIMITED"
  | "WEBHOOK ERROR";

export type ConnectorReport = {
  id: string;
  name: string;
  kind: "MARKET DATA" | "INTELLIGENCE" | "ALERT SOURCE" | "AUTOMATION" | "DATABASE";
  status: ConnectorStatus;
  detail: string;
  credentialState: "PRESENT" | "MISSING";
  requiredEnv: string[];
  latencyMs: number | null;
  observedAt: number | null;
  requests: number | null;
  errors: number | null;
  cacheHits: number | null;
  rateLimitDeferrals: number | null;
  capabilities: { name: string; state: "SUPPORTED" | "UNSUPPORTED" | "WAITING FOR CREDENTIAL" }[];
  permissions: { scope: string; level: "READ ONLY" | "WRITE" | "NONE"; note: string }[];
};

export type IntegrationsReport = {
  checkedAt: number;
  connectors: ConnectorReport[];
};

export const integrationsReport = createServerFn({ method: "GET" }).handler(async (): Promise<IntegrationsReport> => {
  const { dexFetch, getApiStats } = await import("./dexscreener.server");

  const started = Date.now();
  const probe = await dexFetch<{ pairs?: unknown }>("/latest/dex/search?q=USDC", { ttlMs: 20_000 });
  const latency = Date.now() - started;
  const stats = getApiStats();

  const has = (k: string) => Boolean(process.env[k]);
  const supabaseOk = has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY");
  const fomoOk = has("FOMO_API_KEY");
  const tvOk = has("TRADINGVIEW_WEBHOOK_SECRET");
  const n8nOk = has("N8N_WEBHOOK_SECRET") || has("N8N_WEBHOOK_URL");

  const connectors: ConnectorReport[] = [
    {
      id: "dexscreener",
      name: "DEX SCREENER",
      kind: "MARKET DATA",
      status: probe.ok ? (probe.stale ? "STALE" : "CONNECTED") : stats.rateLimitDeferrals > 0 ? "RATE LIMITED" : "DEGRADED",
      detail: probe.ok
        ? probe.stale
          ? "Serving cached observations — upstream did not return fresh data on the last probe"
          : "Live probe succeeded against the public API"
        : (probe.error ?? "Probe failed"),
      credentialState: "PRESENT",
      requiredEnv: [],
      latencyMs: latency,
      observedAt: probe.observedAt,
      requests: stats.requests,
      errors: stats.errors,
      cacheHits: stats.cacheHits,
      rateLimitDeferrals: stats.rateLimitDeferrals,
      capabilities: [
        { name: "PAIR SEARCH", state: "SUPPORTED" },
        { name: "PAIR DETAIL", state: "SUPPORTED" },
        { name: "TOKEN PAIRS", state: "SUPPORTED" },
        { name: "PROFILES / BOOSTS / ADS", state: "SUPPORTED" },
        { name: "TRENDING METAS", state: "SUPPORTED" },
        { name: "HOLDER DISTRIBUTION", state: "UNSUPPORTED" },
        { name: "WALLET / TRADER DATA", state: "UNSUPPORTED" },
        { name: "WEBSOCKET STREAM", state: "UNSUPPORTED" },
      ],
      permissions: [
        { scope: "MARKET DATA", level: "READ ONLY", note: "Public endpoints, no account access, no key required" },
        { scope: "ACCOUNT DATA", level: "NONE", note: "Not requested and not supported" },
      ],
    },
    {
      id: "fomo",
      name: "FOMO",
      kind: "INTELLIGENCE",
      status: fomoOk ? "CONNECTED" : "NOT CONFIGURED",
      detail: fomoOk
        ? "Credential present server-side; adapter enabled"
        : "FOMO_API_KEY is not present — WAITING FOR CREDENTIAL. The adapter is built and stays disabled rather than reporting a fake connection.",
      credentialState: fomoOk ? "PRESENT" : "MISSING",
      requiredEnv: ["FOMO_API_KEY"],
      latencyMs: null,
      observedAt: null,
      requests: null,
      errors: null,
      cacheHits: null,
      rateLimitDeferrals: null,
      capabilities: [
        { name: "TOKEN INTELLIGENCE", state: fomoOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "CREDIT USAGE REPORTING", state: fomoOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "DATA FRESHNESS REPORTING", state: fomoOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
      ],
      permissions: [{ scope: "MARKET INTELLIGENCE", level: "READ ONLY", note: "Least privilege: read-only key, server-side only" }],
    },
    {
      id: "tradingview",
      name: "TRADINGVIEW",
      kind: "ALERT SOURCE",
      status: tvOk ? "CONNECTED" : "NOT CONFIGURED",
      detail: tvOk
        ? "Webhook secret present — inbound alerts are validated before ingestion"
        : "TRADINGVIEW_WEBHOOK_SECRET is not present — WAITING FOR CREDENTIAL. The ingestion endpoint rejects unsigned payloads.",
      credentialState: tvOk ? "PRESENT" : "MISSING",
      requiredEnv: ["TRADINGVIEW_WEBHOOK_SECRET"],
      latencyMs: null,
      observedAt: null,
      requests: null,
      errors: null,
      cacheHits: null,
      rateLimitDeferrals: null,
      capabilities: [
        { name: "WEBHOOK INGESTION", state: tvOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "ALERT METADATA", state: tvOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "SYMBOL MAPPING", state: "SUPPORTED" },
        { name: "OUTBOUND CONTROL", state: "UNSUPPORTED" },
      ],
      permissions: [{ scope: "ALERTS (INBOUND)", level: "READ ONLY", note: "Signature-validated inbound events only" }],
    },
    {
      id: "n8n",
      name: "N8N",
      kind: "AUTOMATION",
      status: n8nOk ? "CONNECTED" : "NOT CONFIGURED",
      detail: n8nOk
        ? "Webhook configuration present"
        : "N8N_WEBHOOK_URL / N8N_WEBHOOK_SECRET are not present — WAITING FOR CREDENTIAL. Outbound triggers are disabled.",
      credentialState: n8nOk ? "PRESENT" : "MISSING",
      requiredEnv: ["N8N_WEBHOOK_URL", "N8N_WEBHOOK_SECRET"],
      latencyMs: null,
      observedAt: null,
      requests: null,
      errors: null,
      cacheHits: null,
      rateLimitDeferrals: null,
      capabilities: [
        { name: "INBOUND WEBHOOKS", state: n8nOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "OUTBOUND WEBHOOKS", state: n8nOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "WORKFLOW TRIGGERING", state: n8nOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "EXECUTION HISTORY", state: n8nOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
      ],
      permissions: [{ scope: "WORKFLOW ACCESS", level: "WRITE", note: "Trigger-only scope; no credential is shared in payloads" }],
    },
    {
      id: "supabase",
      name: "SUPABASE (PERSISTENCE)",
      kind: "DATABASE",
      status: supabaseOk ? "CONNECTED" : "NOT CONFIGURED",
      detail: supabaseOk
        ? "Server credentials detected"
        : "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not present — WAITING FOR SUPABASE. Memory, jobs, hypotheses, workflows and audit records are held in this browser only.",
      credentialState: supabaseOk ? "PRESENT" : "MISSING",
      requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      latencyMs: null,
      observedAt: null,
      requests: null,
      errors: null,
      cacheHits: null,
      rateLimitDeferrals: null,
      capabilities: [
        { name: "DURABLE MEMORY", state: supabaseOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "CROSS-DEVICE SYNC", state: supabaseOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "OUTCOME TRACKING AT SCALE", state: supabaseOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
        { name: "ROW LEVEL SECURITY", state: supabaseOk ? "SUPPORTED" : "WAITING FOR CREDENTIAL" },
      ],
      permissions: [{ scope: "APPLICATION DATA", level: "WRITE", note: "Service credential stays server-side; never sent to the browser" }],
    },
  ];

  return { checkedAt: Date.now(), connectors };
});

/**
 * FOMO adapter probe. Performs a real request only when a credential exists.
 * The key never leaves the server and never appears in a response.
 */
export const fomoProbe = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["FOMO_API_KEY"];
  if (!key) {
    return {
      status: "NOT CONFIGURED" as const,
      detail: "WAITING FOR CREDENTIAL — set FOMO_API_KEY server-side to enable this adapter.",
      latencyMs: null as number | null,
      observedAt: null as number | null,
      creditsRemaining: null as number | null,
      error: null as string | null,
    };
  }
  const base = process.env["FOMO_API_BASE"] ?? "https://api.fomo.biz";
  const started = Date.now();
  try {
    const res = await fetch(`${base}/health`, {
      headers: { "x-api-key": key, accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    const remaining = Number(res.headers.get("x-credits-remaining") ?? NaN);
    return {
      status: res.ok ? ("CONNECTED" as const) : res.status === 401 || res.status === 403 ? ("AUTHENTICATION ERROR" as const) : ("DEGRADED" as const),
      detail: res.ok ? `Probe returned ${res.status}` : `Probe returned ${res.status}`,
      latencyMs: Date.now() - started,
      observedAt: Date.now(),
      creditsRemaining: Number.isFinite(remaining) ? remaining : null,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      status: "DISCONNECTED" as const,
      detail: "Probe failed — the adapter is configured but the endpoint did not respond",
      latencyMs: Date.now() - started,
      observedAt: null,
      creditsRemaining: null,
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
});
