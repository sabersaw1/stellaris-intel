/**
 * Server functions exposing the operator's own Supabase backend to the app.
 *
 * Client-safe module: server-only imports happen INSIDE handlers so the
 * service role key never enters the browser bundle.
 */

import { createServerFn } from "@tanstack/react-start";

export type SourceConfigState = {
  id: string;
  label: string;
  state: "CONNECTED" | "AVAILABLE" | "DEGRADED" | "NOT CONFIGURED";
  detail: string;
};

export type BackendStatus = {
  /** True when a project URL and service role key are present. */
  configured: boolean;
  /** True when the database answered at least one query. */
  reachable: boolean;
  /** True when migration 0001 has been applied (all core tables present). */
  migrated: boolean;
  latencyMs: number | null;
  error: string | null;
  cronSecretPresent: boolean;
  tables: { table: string; present: boolean; rows: number | null }[];
  sources: SourceConfigState[];
  checkedAt: number;
};

export const backendStatus = createServerFn({ method: "GET" }).handler(async (): Promise<BackendStatus> => {
  const { backendConfig, checkSchema } = await import("./supabase/admin.server");
  const { gmgnConfigured } = await import("./sources/gmgn.server");
  const { fomoConfigured } = await import("./sources/fomo.server");

  const cfg = backendConfig();
  const configured = cfg.urlPresent && cfg.serviceKeyPresent;
  const check = configured
    ? await checkSchema()
    : { reachable: false, latencyMs: null, error: "NOT CONFIGURED", tables: [] as never[] };

  const tables = check.tables.map((t) => ({ table: t.table, present: t.present, rows: t.rows }));
  const migrated = tables.length > 0 && tables.every((t) => t.present);

  const sources: SourceConfigState[] = [
    {
      id: "supabase",
      label: "SUPABASE MEMORY (YOUR PROJECT)",
      state: !configured
        ? "NOT CONFIGURED"
        : migrated
          ? "CONNECTED"
          : check.reachable
            ? "DEGRADED"
            : "DEGRADED",
      detail: !configured
        ? "Project URL and service role key have not been provided"
        : migrated
          ? "Reachable and migration 0001 applied"
          : check.reachable
            ? "Reachable, but some core tables are missing — apply db/migrations/0001_stellaris_core.sql"
            : (check.error ?? "Database did not answer"),
    },
    {
      id: "gmgn",
      label: "GMGN",
      state: gmgnConfigured() ? "AVAILABLE" : "NOT CONFIGURED",
      detail: gmgnConfigured()
        ? "Credentials present; holder and developer evidence is collected read-only"
        : "Adapter built. Contributes no evidence until GMGN_API_KEY is provided",
    },
    {
      id: "fomo",
      label: "FOMO",
      state: fomoConfigured() ? "AVAILABLE" : "NOT CONFIGURED",
      detail: fomoConfigured()
        ? "Credentials present; contract evidence is collected read-only"
        : "Adapter built. Contributes no evidence until FOMO_API_KEY is provided",
    },
    {
      id: "cron",
      label: "SCHEDULED PROCESSING (pg_cron -> signed endpoint)",
      state: cfg.cronSecretPresent ? (migrated ? "AVAILABLE" : "DEGRADED") : "NOT CONFIGURED",
      detail: cfg.cronSecretPresent
        ? migrated
          ? "Endpoint /api/public/cron/tick accepts signed calls; schedule it with pg_cron"
          : "Secret present, but the schema must be applied before ticks can store anything"
        : "Worker secret has not been provided",
    },
  ];

  return {
    configured,
    reachable: check.reachable,
    migrated,
    latencyMs: check.latencyMs,
    error: check.error,
    cronSecretPresent: cfg.cronSecretPresent,
    tables,
    sources,
    checkedAt: Date.now(),
  };
});

export type TickResult = {
  configured: boolean;
  migrated: boolean;
  pairsObserved: number;
  marketsStored: number;
  observationsStored: number;
  changesDetected: number;
  errors: string[];
  durationMs: number;
  note: string;
};

/** One full ingestion cycle: DISCOVER -> OBSERVE -> NORMALIZE -> PERSIST. */
export const runIntelligenceTick = createServerFn({ method: "POST" }).handler(async (): Promise<TickResult> => {
  const started = Date.now();
  const { backendConfig } = await import("./supabase/admin.server");
  const { ingestObservations, recordSystemJob } = await import("./supabase/ingest.server");
  const { dexFetch } = await import("./dexscreener.server");
  const { normalizePairs } = await import("./normalize");

  const cfg = backendConfig();
  const configured = cfg.urlPresent && cfg.serviceKeyPresent;

  const queries = ["SOL", "WETH", "USDC", "BNB", "BASE"];
  const results = await Promise.all(
    queries.map((q) => dexFetch<{ pairs?: unknown }>(`/latest/dex/search?q=${q}`, { ttlMs: 20_000 })),
  );
  const seen = new Set<string>();
  const pairs = [];
  for (const r of results) {
    for (const p of normalizePairs(r.data?.pairs, r.observedAt ?? Date.now())) {
      if (!seen.has(p.key)) {
        seen.add(p.key);
        pairs.push(p);
      }
    }
  }

  if (!configured) {
    return {
      configured: false,
      migrated: false,
      pairsObserved: pairs.length,
      marketsStored: 0,
      observationsStored: 0,
      changesDetected: 0,
      errors: [],
      durationMs: Date.now() - started,
      note: "Observations were collected but NOT stored: this project's Supabase credentials are not configured.",
    };
  }

  const ingest = await ingestObservations(pairs);
  await recordSystemJob({
    job: "intelligence.tick",
    state: ingest.errors.length ? "FAILED" : "DONE",
    startedAt: started,
    processed: ingest.observations,
    detail: `${ingest.markets} market(s), ${ingest.observations} new observation(s), ${ingest.changes} change event(s)`,
    error: ingest.errors[0] ?? null,
  });

  return {
    configured: true,
    migrated: ingest.errors.length === 0,
    pairsObserved: pairs.length,
    marketsStored: ingest.markets,
    observationsStored: ingest.observations,
    changesDetected: ingest.changes,
    errors: ingest.errors,
    durationMs: Date.now() - started,
    note: ingest.errors.length
      ? "Ingestion reported errors — check that migration 0001 has been applied."
      : "Observations stored in your Supabase project.",
  };
});

export type StoredCounts = {
  configured: boolean;
  markets: number | null;
  observations: number | null;
  changes: number | null;
  lastJob: { job: string; state: string; finishedAt: string | null; detail: string | null } | null;
};

export const storedCounts = createServerFn({ method: "GET" }).handler(async (): Promise<StoredCounts> => {
  const { getAdmin } = await import("./supabase/admin.server");
  const db = getAdmin();
  if (!db) return { configured: false, markets: null, observations: null, changes: null, lastJob: null };

  const countOf = async (table: string): Promise<number | null> => {
    const probe = await db.from(table).select("*").limit(1);
    if (probe.error) return null;
    const c = await db.from(table).select("*", { count: "exact", head: true });
    return c.error ? null : (c.count ?? 0);
  };

  const [m, o, c, j] = await Promise.all([
    countOf("markets"),
    countOf("market_observations"),
    countOf("change_events"),
    db.from("system_jobs").select("job, state, finished_at, detail").order("started_at", { ascending: false }).limit(1),
  ]);

  const row = (j.data ?? [])[0] as
    | { job: string; state: string; finished_at: string | null; detail: string | null }
    | undefined;

  return {
    configured: true,
    markets: m,
    observations: o,
    changes: c,
    lastJob: row ? { job: row.job, state: row.state, finishedAt: row.finished_at, detail: row.detail } : null,
  };
});
