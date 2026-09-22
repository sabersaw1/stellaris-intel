/**
 * Server functions for the meme-coin intelligence layer.
 *
 * Client-safe module: every server-only import happens inside a handler.
 */

import { createServerFn } from "@tanstack/react-start";

export type MemePipelineStatus = {
  supabaseConfigured: boolean;
  schemaReady: boolean;
  schemaNote: string | null;
  counts: { tokens: number | null; memeTokens: number | null; snapshots: number | null; events: number | null; alerts: number | null };
  providers: {
    id: string;
    name: string;
    status: string;
    configured: boolean;
    credential: string | null;
    whereToGet: string | null;
    lastOkAt: number | null;
    lastError: string | null;
    rateLimitNote: string | null;
    blockedReason: string | null;
    capabilities: { capability: string; state: string; note: string }[];
  }[];
  coverage: { capability: string; available: boolean }[];
  checkedAt: number;
};

export const memePipelineStatus = createServerFn({ method: "GET" }).handler(async (): Promise<MemePipelineStatus> => {
  const { db, memeSchemaReady } = await import("./stellaris/store.server");
  const { providerHealthReport, capabilityCoverage } = await import("./providers/registry.server");

  const client = db();
  const health = await providerHealthReport(Boolean(client));
  const coverage = capabilityCoverage().map((c) => ({ capability: c.capability, available: c.available }));
  const base: MemePipelineStatus = {
    supabaseConfigured: Boolean(client),
    schemaReady: false,
    schemaNote: client ? null : "Supabase credentials are not configured for this project.",
    counts: { tokens: null, memeTokens: null, snapshots: null, events: null, alerts: null },
    providers: health.map((h) => ({
      id: h.id,
      name: h.name,
      status: h.status,
      configured: h.configured,
      credential: h.credential,
      whereToGet: h.whereToGet,
      lastOkAt: h.lastOkAt,
      lastError: h.lastError,
      rateLimitNote: h.rateLimitNote,
      blockedReason: h.blockedReason,
      capabilities: h.capabilities.map((c) => ({ capability: c.capability, state: c.state, note: c.note })),
    })),
    coverage,
    checkedAt: Date.now(),
  };
  if (!client) return base;

  const schema = await memeSchemaReady(client);
  base.schemaReady = schema.ready;
  base.schemaNote = schema.error;
  if (!schema.ready) return base;

  const count = async (table: string, filter?: (q: never) => never): Promise<number | null> => {
    let q = client.from(table).select("*", { count: "exact", head: true });
    if (filter) q = (filter as unknown as (x: typeof q) => typeof q)(q);
    const r = await q;
    return r.error ? null : (r.count ?? 0);
  };

  const memeCount = await client.from("tokens").select("*", { count: "exact", head: true }).eq("meme_verdict", "MEME");
  base.counts = {
    tokens: await count("tokens"),
    memeTokens: memeCount.error ? null : (memeCount.count ?? 0),
    snapshots: await count("token_snapshots"),
    events: await count("stellaris_events"),
    alerts: await count("stellaris_alerts"),
  };
  return base;
});

export const runMemeCollection = createServerFn({ method: "POST" }).handler(async () => {
  const { runCollectionCycle } = await import("./stellaris/pipeline.server");
  return runCollectionCycle();
});

export type MemeTokenRow = {
  id: string;
  chainId: string;
  address: string;
  symbol: string | null;
  name: string | null;
  origin: string;
  verdict: string;
  lifecycle: string | null;
  lastSeenAt: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  observedAt: string | null;
};

export const listMemeTokens = createServerFn({ method: "GET" }).handler(async (): Promise<{ rows: MemeTokenRow[]; note: string | null }> => {
  const { db, memeSchemaReady } = await import("./stellaris/store.server");
  const client = db();
  if (!client) return { rows: [], note: "Supabase is not configured." };
  const schema = await memeSchemaReady(client);
  if (!schema.ready) return { rows: [], note: schema.error };

  const tokens = await client
    .from("tokens")
    .select("id, chain_id, address, symbol, name, origin, meme_verdict, lifecycle_stage, last_seen_at")
    .in("meme_verdict", ["MEME", "UNKNOWN"])
    .order("last_seen_at", { ascending: false })
    .limit(120);
  if (tokens.error) return { rows: [], note: tokens.error.message };

  const ids = (tokens.data ?? []).map((t) => t.id as string);
  const snaps = ids.length
    ? await client
        .from("token_snapshots")
        .select("token_id, price_usd, liquidity_usd, volume_24h_usd, market_cap_usd, observed_at")
        .in("token_id", ids)
        .order("observed_at", { ascending: false })
        .limit(ids.length * 4)
    : { data: [], error: null };

  const latest = new Map<string, Record<string, unknown>>();
  for (const s of (snaps.data ?? []) as Record<string, unknown>[]) {
    const k = s["token_id"] as string;
    if (!latest.has(k)) latest.set(k, s);
  }

  const rows: MemeTokenRow[] = (tokens.data ?? []).map((t) => {
    const s = latest.get(t.id as string);
    return {
      id: t.id as string,
      chainId: t.chain_id as string,
      address: t.address as string,
      symbol: (t.symbol as string | null) ?? null,
      name: (t.name as string | null) ?? null,
      origin: t.origin as string,
      verdict: t.meme_verdict as string,
      lifecycle: (t.lifecycle_stage as string | null) ?? null,
      lastSeenAt: (t.last_seen_at as string | null) ?? null,
      priceUsd: (s?.["price_usd"] as number | null) ?? null,
      liquidityUsd: (s?.["liquidity_usd"] as number | null) ?? null,
      volume24hUsd: (s?.["volume_24h_usd"] as number | null) ?? null,
      marketCapUsd: (s?.["market_cap_usd"] as number | null) ?? null,
      observedAt: (s?.["observed_at"] as string | null) ?? null,
    };
  });
  return { rows, note: null };
});

export type MemeEventRow = {
  kind: string;
  entityKind: string;
  entityId: string;
  source: string;
  field: string | null;
  beforeValue: number | null;
  afterValue: number | null;
  changePct: number | null;
  confidence: string | null;
  severity: string | null;
  summary: string | null;
  observedAt: string | null;
  receivedAt: string | null;
};

export const listMemeEvents = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rows: MemeEventRow[]; note: string | null }> => {
    const { db, memeSchemaReady, recentEvents } = await import("./stellaris/store.server");
    const client = db();
    if (!client) return { rows: [], note: "Supabase is not configured." };
    const schema = await memeSchemaReady(client);
    if (!schema.ready) return { rows: [], note: schema.error };
    const raw = await recentEvents(client, 80);
    const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
    const nm = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      rows: raw.map((e) => ({
        kind: str(e["kind"]) ?? "UNKNOWN",
        entityKind: str(e["entity_kind"]) ?? "UNKNOWN",
        entityId: str(e["entity_id"]) ?? "",
        source: str(e["source"]) ?? "",
        field: str(e["field"]),
        beforeValue: nm(e["before_value"]),
        afterValue: nm(e["after_value"]),
        changePct: nm(e["change_pct"]),
        confidence: str(e["confidence"]),
        severity: str(e["severity"]),
        summary: str(e["summary"]),
        observedAt: str(e["observed_at"]),
        receivedAt: str(e["received_at"]),
      })),
      note: null,
    };
  },
);

export type MemeAlertRow = {
  id: string;
  tokenId: string | null;
  category: string;
  severity: string;
  title: string;
  why: string[];
  createdAt: string | null;
  acknowledged: boolean;
};

export const listMemeAlerts = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rows: MemeAlertRow[]; note: string | null }> => {
    const { db, memeSchemaReady } = await import("./stellaris/store.server");
    const client = db();
    if (!client) return { rows: [], note: "Supabase is not configured." };
    const schema = await memeSchemaReady(client);
    if (!schema.ready) return { rows: [], note: schema.error };
    const r = await client
      .from("stellaris_alerts")
      .select("id, token_id, category, severity, title, why, created_at, acknowledged")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows: MemeAlertRow[] = ((r.data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: String(a["id"]),
      tokenId: (a["token_id"] as string | null) ?? null,
      category: String(a["category"]),
      severity: String(a["severity"]),
      title: String(a["title"]),
      why: Array.isArray(a["why"]) ? (a["why"] as unknown[]).map((w) => String(w)) : [],
      createdAt: (a["created_at"] as string | null) ?? null,
      acknowledged: Boolean(a["acknowledged"]),
    }));
    return { rows, note: r.error?.message ?? null };
  },
);
