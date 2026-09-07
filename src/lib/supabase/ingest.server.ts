/**
 * DEX Screener -> Supabase ingestion (server only).
 *
 * Deduplication: markets are keyed on (chain_id, pair_address); observations on
 * (market_id, observed_at, source). Re-running a tick therefore never duplicates
 * a snapshot. Change events are derived by comparing the new observation with
 * the previous stored observation for the same market — no synthetic values.
 */

import type { PairObservation } from "../dex-types";
import { getAdmin, recordSourceHealth } from "./admin.server";

export type IngestResult = {
  configured: boolean;
  markets: number;
  observations: number;
  changes: number;
  errors: string[];
  durationMs: number;
};

type MarketRow = { id: string; chain_id: string; pair_address: string };

const CHANGE_FIELDS: {
  field: string;
  pick: (p: PairObservation) => number | null;
  threshold: number;
}[] = [
  { field: "liquidity_usd", pick: (p) => p.liquidityUsd, threshold: 0.25 },
  { field: "volume_24h_usd", pick: (p) => p.volume.h24, threshold: 0.5 },
  { field: "price_usd", pick: (p) => p.priceUsd, threshold: 0.2 },
];

export async function ingestObservations(pairs: PairObservation[]): Promise<IngestResult> {
  const started = Date.now();
  const db = getAdmin();
  if (!db) {
    return { configured: false, markets: 0, observations: 0, changes: 0, errors: [], durationMs: 0 };
  }
  const errors: string[] = [];
  if (!pairs.length) {
    return { configured: true, markets: 0, observations: 0, changes: 0, errors, durationMs: Date.now() - started };
  }

  const nowIso = new Date().toISOString();

  // 1. Upsert market identities.
  const { data: markets, error: marketError } = await db
    .from("markets")
    .upsert(
      pairs.map((p) => ({
        chain_id: p.chainId,
        pair_address: p.pairAddress,
        base_symbol: p.baseSymbol,
        base_name: p.baseName,
        base_address: p.baseAddress,
        quote_symbol: p.quoteSymbol,
        dex_id: p.dexId,
        pair_created_at: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
        last_seen_at: nowIso,
      })),
      { onConflict: "chain_id,pair_address" },
    )
    .select("id, chain_id, pair_address");

  if (marketError) {
    errors.push(`markets: ${marketError.message}`);
    await recordSourceHealth({
      source: "supabase",
      state: "DEGRADED",
      configured: true,
      error: marketError.message,
    });
    return { configured: true, markets: 0, observations: 0, changes: 0, errors, durationMs: Date.now() - started };
  }

  const idByKey = new Map<string, string>();
  for (const m of (markets ?? []) as MarketRow[]) idByKey.set(`${m.chain_id}:${m.pair_address}`, m.id);

  // 2. Previous observation per market, for change detection.
  const previous = new Map<string, Record<string, number | null>>();
  const ids = [...idByKey.values()];
  if (ids.length) {
    const { data: prev } = await db
      .from("market_observations")
      .select("market_id, price_usd, liquidity_usd, volume_24h_usd, observed_at")
      .in("market_id", ids)
      .order("observed_at", { ascending: false })
      .limit(ids.length * 4);
    for (const row of prev ?? []) {
      const r = row as { market_id: string; price_usd: number | null; liquidity_usd: number | null; volume_24h_usd: number | null };
      if (!previous.has(r.market_id)) {
        previous.set(r.market_id, {
          price_usd: r.price_usd,
          liquidity_usd: r.liquidity_usd,
          volume_24h_usd: r.volume_24h_usd,
        });
      }
    }
  }

  // 3. Insert observations (deduplicated by unique constraint).
  const rows = pairs
    .map((p) => {
      const marketId = idByKey.get(p.key);
      if (!marketId) return null;
      return {
        market_id: marketId,
        observed_at: new Date(p.observedAt).toISOString(),
        source: "dexscreener",
        price_usd: p.priceUsd,
        liquidity_usd: p.liquidityUsd,
        volume_24h_usd: p.volume.h24,
        volume_5m_usd: p.volume.m5,
        price_change_5m: p.priceChange.m5,
        price_change_1h: p.priceChange.h1,
        price_change_24h: p.priceChange.h24,
        txns_5m_buys: p.txns.m5?.buys ?? null,
        txns_5m_sells: p.txns.m5?.sells ?? null,
        fdv_usd: p.fdv,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const { data: inserted, error: obsError } = await db
    .from("market_observations")
    .upsert(rows, { onConflict: "market_id,observed_at,source", ignoreDuplicates: true })
    .select("id");
  if (obsError) errors.push(`observations: ${obsError.message}`);

  // 4. Change detection against the previous stored observation.
  const changeRows: Record<string, unknown>[] = [];
  for (const p of pairs) {
    const marketId = idByKey.get(p.key);
    if (!marketId) continue;
    const before = previous.get(marketId);
    if (!before) continue;
    for (const f of CHANGE_FIELDS) {
      const after = f.pick(p);
      const prior = before[f.field] ?? null;
      if (after === null || prior === null || prior === 0) continue;
      const delta = (after - Number(prior)) / Math.abs(Number(prior));
      if (Math.abs(delta) < f.threshold) continue;
      changeRows.push({
        market_id: marketId,
        field: f.field,
        before_value: String(prior),
        after_value: String(after),
        magnitude: Number(delta.toFixed(4)),
        detail: `Observed change between consecutive stored observations of ${p.baseSymbol}`,
      });
    }
  }
  if (changeRows.length) {
    const { error: changeError } = await db.from("change_events").insert(changeRows);
    if (changeError) errors.push(`change_events: ${changeError.message}`);
  }

  await recordSourceHealth({
    source: "supabase",
    state: errors.length ? "DEGRADED" : "CONNECTED",
    configured: true,
    ok: errors.length === 0,
    latencyMs: Date.now() - started,
    error: errors[0] ?? null,
  });

  return {
    configured: true,
    markets: idByKey.size,
    observations: inserted?.length ?? 0,
    changes: changeRows.length,
    errors,
    durationMs: Date.now() - started,
  };
}

/** Records a scheduled or manual processing run. Truthful, no invented timers. */
export async function recordSystemJob(entry: {
  job: string;
  state: "DONE" | "FAILED" | "SKIPPED";
  startedAt: number;
  processed?: number;
  detail?: string;
  error?: string | null;
}): Promise<void> {
  const db = getAdmin();
  if (!db) return;
  await db.from("system_jobs").insert({
    job: entry.job,
    state: entry.state,
    started_at: new Date(entry.startedAt).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - entry.startedAt,
    processed: entry.processed ?? null,
    detail: entry.detail ?? null,
    error: entry.error ?? null,
  });
}
