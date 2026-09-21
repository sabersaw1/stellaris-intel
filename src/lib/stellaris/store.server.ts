/**
 * STELLARIS persistence layer (server-only).
 *
 * All writes to the meme-intelligence schema (migration 0007) go through here,
 * using the operator's own Supabase project via the service-role client. The
 * browser never reaches these tables.
 *
 * Invariants:
 *  - Nothing is invented. Absent values are written as NULL, never 0.
 *  - Every observation row carries source, observed_at and received_at.
 *  - Events are deduplicated on their dedup key, so re-observing an unchanged
 *    value never creates a row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdmin } from "../supabase/admin.server";
import type { StellarisEvent } from "../events/model";
import type { ProviderHealth } from "../providers/types";
import { classifyMeme, type ClassifierInput } from "../meme/classify";

export type Db = SupabaseClient;

const iso = (t: number | null | undefined): string | null =>
  t === null || t === undefined || !Number.isFinite(t) ? null : new Date(t).toISOString();

export function db(): Db | null {
  return getAdmin();
}

/** True when migration 0007 is present. Used for truthful NOT MIGRATED states. */
export async function memeSchemaReady(client: Db): Promise<{ ready: boolean; error: string | null }> {
  const probe = await client.from("tokens").select("id").limit(1);
  if (!probe.error) return { ready: true, error: null };
  if (/schema cache|does not exist|PGRST205/i.test(probe.error.message))
    return { ready: false, error: "Migration 0007 has not been applied yet — the meme intelligence tables are missing." };
  return { ready: false, error: probe.error.message };
}

/* ------------------------------------------------------------------ audit --- */

export async function audit(entry: {
  actor?: "SYSTEM" | "USER" | "AGENT";
  action: string;
  component: string;
  detail?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  const client = db();
  if (!client) return;
  await client.from("audit_log").insert({
    actor: entry.actor ?? "SYSTEM",
    action: entry.action,
    component: entry.component,
    detail: entry.detail ?? null,
    reason: entry.reason ?? null,
    payload: entry.payload ?? null,
  });
}

/* --------------------------------------------------------------- settings --- */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const client = db();
  if (!client) return fallback;
  const r = await client.from("system_settings").select("value").eq("key", key).maybeSingle();
  if (r.error || !r.data) return fallback;
  return (r.data.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown, reason?: string): Promise<{ error: string | null }> {
  const client = db();
  if (!client) return { error: "Supabase is not configured." };
  const r = await client
    .from("system_settings")
    .upsert({ key, value: value as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
  await audit({ actor: "USER", action: "SETTING_CHANGED", component: "settings", detail: key, reason: reason ?? null, payload: { value } });
  return { error: r.error?.message ?? null };
}

/* -------------------------------------------------------- provider health --- */

export async function saveProviderHealth(h: ProviderHealth): Promise<void> {
  const client = db();
  if (!client) return;
  await client.from("provider_health").upsert(
    {
      provider_id: h.id,
      status: h.status,
      configured: h.configured,
      last_request_at: iso(h.lastRequestAt),
      last_ok_at: iso(h.lastOkAt),
      last_error_at: iso(h.lastErrorAt),
      last_error: h.lastError,
      latency_ms: h.latencyMs,
      rate_limit_note: h.rateLimitNote,
      capabilities: h.capabilities as never,
      blocked_reason: h.blockedReason,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id" },
  );
}

/* ----------------------------------------------------------------- tokens --- */

export type TokenUpsert = ClassifierInput & {
  chainId: string;
  address: string;
  symbol: string | null;
  name: string | null;
  creatorAddress?: string | null;
  createdAtChain?: number | null;
  origin?: "PUMPFUN" | "DEX" | "MANUAL" | "UNKNOWN";
  imageUrl?: string | null;
  websites?: unknown[];
  socials?: unknown[];
};

export type TokenRow = { id: string; chain_id: string; address: string; meme_verdict: string };

/**
 * Upserts a token by its canonical identity (chain + address) and records the
 * meme classification with the reasons that produced it.
 */
export async function upsertToken(client: Db, t: TokenUpsert): Promise<{ id: string | null; verdict: string; error: string | null }> {
  const cls = classifyMeme(t);
  const row = {
    chain_id: t.chainId.toLowerCase(),
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    creator_address: t.creatorAddress ?? null,
    created_at_chain: iso(t.createdAtChain ?? null),
    origin: t.origin ?? "UNKNOWN",
    meme_verdict: cls.verdict,
    meme_reasons: cls.reasons as never,
    image_url: t.imageUrl ?? null,
    websites: (t.websites ?? []) as never,
    socials: (t.socials ?? []) as never,
    last_seen_at: new Date().toISOString(),
  };
  const r = await client.from("tokens").upsert(row, { onConflict: "chain_id,address" }).select("id").maybeSingle();
  if (r.error) return { id: null, verdict: cls.verdict, error: r.error.message };
  return { id: (r.data?.id as string | undefined) ?? null, verdict: cls.verdict, error: null };
}

export type SnapshotInput = {
  tokenId: string;
  source: string;
  observedAt: number;
  priceUsd?: number | null;
  marketCapUsd?: number | null;
  fdvUsd?: number | null;
  liquidityUsd?: number | null;
  volume5mUsd?: number | null;
  volume1hUsd?: number | null;
  volume24hUsd?: number | null;
  txns5mBuys?: number | null;
  txns5mSells?: number | null;
  txns24hBuys?: number | null;
  txns24hSells?: number | null;
  holders?: number | null;
  dataQuality?: string | null;
  confidence?: string | null;
  raw?: unknown;
};

/** Stores a snapshot. Duplicate (token, source, observed_at) rows are ignored. */
export async function insertTokenSnapshot(client: Db, s: SnapshotInput): Promise<{ inserted: boolean; error: string | null }> {
  const receivedAt = Date.now();
  const r = await client
    .from("token_snapshots")
    .upsert(
      {
        token_id: s.tokenId,
        source: s.source,
        observed_at: new Date(s.observedAt).toISOString(),
        received_at: new Date(receivedAt).toISOString(),
        price_usd: s.priceUsd ?? null,
        market_cap_usd: s.marketCapUsd ?? null,
        fdv_usd: s.fdvUsd ?? null,
        liquidity_usd: s.liquidityUsd ?? null,
        volume_5m_usd: s.volume5mUsd ?? null,
        volume_1h_usd: s.volume1hUsd ?? null,
        volume_24h_usd: s.volume24hUsd ?? null,
        txns_5m_buys: s.txns5mBuys ?? null,
        txns_5m_sells: s.txns5mSells ?? null,
        txns_24h_buys: s.txns24hBuys ?? null,
        txns_24h_sells: s.txns24hSells ?? null,
        holders: s.holders ?? null,
        freshness_ms: Math.max(0, receivedAt - s.observedAt),
        data_quality: s.dataQuality ?? null,
        confidence: s.confidence ?? null,
        raw: (s.raw ?? null) as never,
      },
      { onConflict: "token_id,source,observed_at", ignoreDuplicates: true },
    )
    .select("id");
  if (r.error) return { inserted: false, error: r.error.message };
  return { inserted: (r.data ?? []).length > 0, error: null };
}

/** Most recent stored snapshot for a token, used for change detection. */
export async function latestSnapshot(client: Db, tokenId: string): Promise<Record<string, unknown> | null> {
  const r = await client
    .from("token_snapshots")
    .select("*")
    .eq("token_id", tokenId)
    .order("observed_at", { ascending: false })
    .limit(1);
  if (r.error) return null;
  return ((r.data ?? [])[0] as Record<string, unknown> | undefined) ?? null;
}

export async function recordLifecycle(client: Db, input: {
  tokenId: string;
  stage: string;
  basis: string | null;
  source: string;
  observedAt: number;
}): Promise<void> {
  await client.from("token_lifecycle").upsert(
    {
      token_id: input.tokenId,
      stage: input.stage,
      basis: input.basis,
      source: input.source,
      observed_at: new Date(input.observedAt).toISOString(),
    },
    { onConflict: "token_id,stage,observed_at", ignoreDuplicates: true },
  );
  await client.from("tokens").update({ lifecycle_stage: input.stage }).eq("id", input.tokenId);
}

/* ------------------------------------------------------------------ pairs --- */

export async function upsertPair(client: Db, p: {
  tokenId: string;
  chainId: string;
  pairAddress: string;
  dexId: string | null;
  quoteSymbol: string | null;
  url: string | null;
  pairCreatedAt: number | null;
}): Promise<{ id: string | null; error: string | null }> {
  const r = await client
    .from("token_pairs")
    .upsert(
      {
        token_id: p.tokenId,
        chain_id: p.chainId.toLowerCase(),
        pair_address: p.pairAddress,
        dex_id: p.dexId,
        quote_symbol: p.quoteSymbol,
        url: p.url,
        pair_created_at: iso(p.pairCreatedAt),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "chain_id,pair_address" },
    )
    .select("id")
    .maybeSingle();
  if (r.error) return { id: null, error: r.error.message };
  return { id: (r.data?.id as string | undefined) ?? null, error: null };
}

/* ----------------------------------------------------------------- events --- */

/** Inserts events, ignoring any whose dedup key already exists. */
export async function insertEvents(
  client: Db,
  events: StellarisEvent[],
  tokenIdFor?: (e: StellarisEvent) => string | null,
): Promise<{ stored: number; error: string | null }> {
  if (!events.length) return { stored: 0, error: null };
  const rows = events.map((e) => ({
    dedup_key: e.dedupKey,
    kind: e.kind,
    entity_kind: e.entityKind,
    entity_id: e.entityId,
    token_id: tokenIdFor?.(e) ?? null,
    source: e.source,
    field: e.field,
    before_value: e.beforeValue,
    after_value: e.afterValue,
    change_pct: e.changePct,
    confidence: e.confidence,
    severity: e.severity,
    summary: e.summary,
    reference: (e.reference ?? null) as never,
    observed_at: iso(e.observedAt),
    received_at: new Date(e.receivedAt).toISOString(),
  }));
  const r = await client.from("stellaris_events").upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: true }).select("id");
  if (r.error) return { stored: 0, error: r.error.message };
  return { stored: (r.data ?? []).length, error: null };
}

export async function recentEvents(client: Db, limit = 100): Promise<Record<string, unknown>[]> {
  const r = await client
    .from("stellaris_events")
    .select("kind, entity_kind, entity_id, token_id, source, field, before_value, after_value, change_pct, confidence, severity, summary, observed_at, received_at")
    .order("received_at", { ascending: false })
    .limit(limit);
  return r.error ? [] : ((r.data ?? []) as Record<string, unknown>[]);
}

/* ----------------------------------------------------------------- alerts --- */

/**
 * Creates an alert unless an identical one fired inside the cooldown window.
 * Prevents the spam the specification explicitly forbids.
 */
export async function raiseAlert(client: Db, a: {
  tokenId: string | null;
  category: string;
  severity: string;
  title: string;
  why: string[];
  cooldownKey: string;
  cooldownMinutes?: number;
}): Promise<{ created: boolean; error: string | null }> {
  const minutes = a.cooldownMinutes ?? 15;
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const existing = await client
    .from("stellaris_alerts")
    .select("id")
    .eq("cooldown_key", a.cooldownKey)
    .gte("created_at", since)
    .limit(1);
  if (!existing.error && (existing.data ?? []).length) return { created: false, error: null };

  const r = await client.from("stellaris_alerts").insert({
    token_id: a.tokenId,
    category: a.category,
    severity: a.severity,
    title: a.title,
    why: a.why as never,
    cooldown_key: a.cooldownKey,
  });
  return { created: !r.error, error: r.error?.message ?? null };
}
