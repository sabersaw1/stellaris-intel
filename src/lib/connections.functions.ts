/**
 * CONNECTION CENTER SERVER FUNCTIONS.
 *
 * Reports the real state of every connection and runs real probes on demand.
 * Secrets are read inside handlers only; no credential value is ever returned
 * to the browser — only whether one is present.
 */

import { createServerFn } from "@tanstack/react-start";

import { CATALOG, type CatalogEntry, type ConnectionId } from "./providers/catalog";

export type ConnectionState = "CONNECTED" | "CONNECTED — PUBLIC ACCESS" | "NOT CONNECTED" | "DEGRADED" | "ERROR" | "CAPABILITY UNAVAILABLE";

export type ConnectionRow = CatalogEntry & {
  state: ConnectionState;
  configured: boolean;
  /** Which of the listed env vars are present (names only, never values). */
  presentEnv: string[];
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  latencyMs: number | null;
  rateLimitNote: string | null;
  blockedReason: string | null;
  capabilities: { capability: string; state: string; note: string }[];
};

export type ConnectionCenterReport = {
  checkedAt: number;
  rows: ConnectionRow[];
  persistence: { configured: boolean; schemaReady: boolean; note: string | null };
  execution: "HARD DISABLED";
  checklist: { id: ConnectionId; name: string; steps: { label: string; done: boolean }[]; unlocks: string }[];
};

function present(vars: string[]): string[] {
  return vars.filter((v) => {
    const raw = process.env[v];
    return Boolean(raw && raw.trim());
  });
}

export const connectionCenterReport = createServerFn({ method: "GET" }).handler(async (): Promise<ConnectionCenterReport> => {
  const { providerHealthReport } = await import("./providers/registry.server");
  const { db, memeSchemaReady } = await import("./stellaris/store.server");

  const client = db();
  const health = await providerHealthReport(Boolean(client));
  const byId = new Map(health.map((h) => [h.id, h]));

  const rows: ConnectionRow[] = CATALOG.map((entry) => {
    const presentEnv = present(entry.envVars);
    const configured = entry.envVars.length === 0 ? true : presentEnv.length > 0;
    const h = entry.providerId ? byId.get(entry.providerId as never) : undefined;

    let state: ConnectionState;
    if (entry.requirement === "NOT AVAILABLE") state = "CAPABILITY UNAVAILABLE";
    else if (!configured) state = "NOT CONNECTED";
    else if (entry.envVars.length === 0) state = h && h.status === "DEGRADED" ? "DEGRADED" : "CONNECTED — PUBLIC ACCESS";
    else if (h && h.status === "DEGRADED") state = "DEGRADED";
    else if (h && h.lastError && h.lastErrorAt && (!h.lastOkAt || h.lastErrorAt > h.lastOkAt)) state = "ERROR";
    else state = "CONNECTED";

    return {
      ...entry,
      state,
      configured,
      presentEnv,
      lastOkAt: h?.lastOkAt ?? null,
      lastErrorAt: h?.lastErrorAt ?? null,
      lastError: h?.lastError ?? null,
      latencyMs: h?.latencyMs ?? null,
      rateLimitNote: h?.rateLimitNote ?? null,
      blockedReason: configured ? null : (h?.blockedReason ?? `${entry.envVars.join(" or ")} is not configured.`),
      capabilities: (h?.capabilities ?? []).map((c) => ({ capability: c.capability, state: c.state, note: c.note })),
    };
  });

  let schemaReady = false;
  let note: string | null = client ? null : "Supabase credentials are not configured for this project.";
  if (client) {
    const schema = await memeSchemaReady(client);
    schemaReady = schema.ready;
    note = schema.error;
  }

  const checklist = rows.map((r) => ({
    id: r.id,
    name: r.name,
    steps: [
      { label: r.envVars.length ? `${r.envVars.join(" or ")} configured` : "public access — nothing to configure", done: r.configured },
      { label: "test successful", done: Boolean(r.lastOkAt) && (!r.lastErrorAt || r.lastOkAt! >= r.lastErrorAt) },
    ],
    unlocks: r.unlocks.slice(0, 3).join(" · "),
  }));

  return { checkedAt: Date.now(), rows, persistence: { configured: Boolean(client), schemaReady, note }, execution: "HARD DISABLED", checklist };
});

export type ConnectionTestResult = {
  id: ConnectionId;
  ok: boolean;
  state: ConnectionState;
  detail: string;
  latencyMs: number | null;
  testedAt: number;
};

/**
 * Runs one real, cheap, read-only request against a connection and reports
 * exactly what happened. Never mutates anything upstream.
 */
export const testConnection = createServerFn({ method: "POST" })
  .inputValidator((data: { id: ConnectionId }) => {
    const id = data?.id;
    const known = CATALOG.some((c) => c.id === id);
    if (!known) throw new Error("Unknown connection id.");
    return { id };
  })
  .handler(async ({ data }): Promise<ConnectionTestResult> => {
    const started = Date.now();
    const fail = (detail: string, state: ConnectionState = "ERROR"): ConnectionTestResult => ({
      id: data.id,
      ok: false,
      state,
      detail,
      latencyMs: Date.now() - started,
      testedAt: Date.now(),
    });
    const pass = (detail: string, state: ConnectionState = "CONNECTED"): ConnectionTestResult => ({
      id: data.id,
      ok: true,
      state,
      detail,
      latencyMs: Date.now() - started,
      testedAt: Date.now(),
    });

    const entry = CATALOG.find((c) => c.id === data.id)!;
    if (entry.envVars.length && present(entry.envVars).length === 0)
      return fail(`No credential configured. Stellaris needs ${entry.envVars.join(" or ")}.`, "NOT CONNECTED");

    if (data.id === "ai") return pass("LOVABLE_API_KEY is present. It is only called when a research event fires.");
    if (data.id === "local_agent")
      return pass("STELLARIS_AGENT_TOKEN is present. Call /api/public/intelligence/status with it as a bearer token from your machine to confirm reachability.");

    const { provider } = await import("./providers/registry.server");
    const p = entry.providerId ? provider(entry.providerId as never) : null;
    if (!p) return fail("No provider adapter is registered for this connection.", "CAPABILITY UNAVAILABLE");

    if (data.id === "dexscreener") {
      const r = await p.discover?.({ query: "bonk" });
      if (!r) return fail("This adapter does not support a discovery probe.");
      return r.ok
        ? pass(`Public API answered with ${Array.isArray(r.data) ? r.data.length : 0} pair observations.`, "CONNECTED — PUBLIC ACCESS")
        : fail(r.error ?? r.unsupportedReason ?? "The probe failed.");
    }

    if (data.id === "solana") {
      const r = await p.fetch?.({ mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" });
      if (!r) return fail("This adapter does not support a read probe.");
      return r.ok ? pass("The RPC endpoint answered a live token read.") : fail(r.error ?? r.unsupportedReason ?? "The RPC endpoint did not answer.");
    }

    if (data.id === "x") {
      const r = await p.discover?.({ query: "bonk" });
      if (!r) return fail("This adapter does not support a search probe.");
      return r.ok ? pass("X answered an authenticated recent-search request.") : fail(r.error ?? r.unsupportedReason ?? "X rejected the request.");
    }

    if (data.id === "fomo") {
      const r = await p.discover?.({ window: "all" });
      if (!r) return fail("This adapter does not support a leaderboard probe.");
      return r.ok ? pass("The FOMO API answered a leaderboard request.") : fail(r.error ?? r.unsupportedReason ?? "The FOMO API rejected the request.");
    }

    if (data.id === "pumpportal") {
      const r = await p.discover?.({});
      if (!r) return fail("This adapter does not support a pull probe.");
      return r.ok ? pass("The configured launch backend answered.") : fail(r.error ?? r.unsupportedReason ?? "The launch backend did not answer.");
    }

    const h = await p.health();
    return h.status === "CONNECTED" ? pass("Provider reports a healthy state.") : fail(h.blockedReason ?? h.lastError ?? "Provider is not usable.");
  });
