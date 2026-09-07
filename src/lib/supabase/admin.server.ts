/**
 * Server-only Supabase access for STELLARIS INTEL.
 *
 * This connects to the operator's OWN Supabase project (not Lovable Cloud).
 * The service role key is read inside functions — never at module scope — and
 * never leaves the server. The browser never receives these values.
 *
 * Configuration (runtime secrets):
 *   STELLARIS_SUPABASE_URL
 *   STELLARIS_SUPABASE_SERVICE_ROLE_KEY
 *   STELLARIS_SUPABASE_PUBLISHABLE_KEY  (reserved for future public reads)
 *   STELLARIS_CRON_SECRET               (signed scheduled endpoint)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BackendConfig = {
  urlPresent: boolean;
  serviceKeyPresent: boolean;
  publishableKeyPresent: boolean;
  cronSecretPresent: boolean;
};

export function backendConfig(): BackendConfig {
  return {
    urlPresent: Boolean(process.env["STELLARIS_SUPABASE_URL"]),
    serviceKeyPresent: Boolean(process.env["STELLARIS_SUPABASE_SERVICE_ROLE_KEY"]),
    publishableKeyPresent: Boolean(process.env["STELLARIS_SUPABASE_PUBLISHABLE_KEY"]),
    cronSecretPresent: Boolean(process.env["STELLARIS_CRON_SECRET"]),
  };
}

/** Returns a service-role client, or null when the project is not configured. */
export function getAdmin(): SupabaseClient | null {
  const url = process.env["STELLARIS_SUPABASE_URL"];
  const key = process.env["STELLARIS_SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // sb_secret_* keys are opaque, not JWTs: send them only as `apikey`.
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input as RequestInfo, { ...init, headers: h });
      },
    },
  });
}

export type SchemaCheck = {
  table: string;
  present: boolean;
  rows: number | null;
  error: string | null;
};

export const CORE_TABLES = [
  "markets",
  "market_observations",
  "evidence",
  "investigations",
  "watchlist",
  "change_events",
  "research_jobs",
  "outcomes",
  "calibration",
  "source_health",
  "system_jobs",
] as const;

/** Verifies reachability and whether migration 0001 has been applied. */
export async function checkSchema(): Promise<{
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
  tables: SchemaCheck[];
}> {
  const db = getAdmin();
  if (!db) return { reachable: false, latencyMs: null, error: "NOT CONFIGURED", tables: [] };

  const started = Date.now();
  const tables: SchemaCheck[] = [];
  let reachable = false;
  let error: string | null = null;

  for (const table of CORE_TABLES) {
    // A real row read is used because a head-only count can succeed even when
    // the table is absent from the schema cache.
    const probe = await db.from(table).select("*").limit(1);
    if (!probe.error) {
      reachable = true;
      const c = await db.from(table).select("*", { count: "exact", head: true });
      tables.push({ table, present: true, rows: c.error ? null : (c.count ?? 0), error: null });
    } else {
      // A schema-cache miss still proves the API answered: the project is
      // reachable, the migration simply has not been applied yet.
      if (/schema cache|does not exist|PGRST205/i.test(probe.error.message)) reachable = true;
      if (!error) error = probe.error.message;
      tables.push({ table, present: false, rows: null, error: probe.error.message });
    }
  }

  return { reachable, latencyMs: Date.now() - started, error: reachable ? null : error, tables };
}

/** Records the observed condition of an evidence source. Never invents values. */
export async function recordSourceHealth(entry: {
  source: string;
  state: string;
  configured: boolean;
  ok?: boolean;
  latencyMs?: number | null;
  error?: string | null;
}): Promise<void> {
  const db = getAdmin();
  if (!db) return;
  await db.from("source_health").upsert(
    {
      source: entry.source,
      state: entry.state,
      configured: entry.configured,
      last_ok_at: entry.ok ? new Date().toISOString() : undefined,
      last_error: entry.error ?? null,
      last_latency_ms: entry.latencyMs ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source" },
  );
}
