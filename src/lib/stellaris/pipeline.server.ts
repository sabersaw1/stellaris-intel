/**
 * STELLARIS collection pipeline (server-only).
 *
 * DISCOVER -> CLASSIFY (meme only) -> NORMALIZE -> STORE -> DETECT CHANGES -> EVENTS
 *
 * Every step is truthful:
 *  - tokens that cannot be confirmed as memes are stored with verdict UNKNOWN
 *    and are not promoted into research;
 *  - snapshots carry the source timestamp and the receipt timestamp;
 *  - an event exists only when a stored value actually changed past its
 *    threshold, so an unchanged market produces no events.
 */

import { classifyMeme } from "../meme/classify";
import { changeEvent, discoveryEvent, type EventKind, type StellarisEvent } from "../events/model";
import { canonicalReference, canonicalize } from "../intel/canonical";
import { assessSignificance, eventCountsByEntity } from "../intel/significance";
import { collectionMode } from "../intel/gaps";
import { normalizeObservation } from "../intel/observation";

import { dexscreenerProvider } from "../providers/dexscreener.provider.server";
import { pumpfunProvider } from "../providers/pumpfun.server";
import type { PairObservation } from "../dex-types";
import {
  audit,
  db,
  getSetting,
  insertEvents,
  insertTokenSnapshot,
  latestSnapshot,
  memeSchemaReady,
  raiseAlert,
  recordLifecycle,
  upsertPair,
  upsertToken,
  type Db,
} from "./store.server";

export type CollectionSummary = {
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  discovered: number;
  memes: number;
  unknown: number;
  rejected: number;
  snapshotsStored: number;
  eventsStored: number;
  alertsRaised: number;
  errors: string[];
  notes: string[];
};

/** Search terms used to surface meme pairs on DEX Screener. Operator-editable. */
const DEFAULT_QUERIES = ["pump", "wif", "bonk", "pepe", "doge", "cat", "moon"];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Compares a fresh observation with the last stored snapshot and emits events. */
function changesFor(
  entityId: string,
  prev: Record<string, unknown>,
  next: {
    priceUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    marketCapUsd: number | null;
  },
  observedAt: number,
): StellarisEvent[] {
  const out: StellarisEvent[] = [];
  const fields: { kind: EventKind; field: string; before: number | null; after: number | null }[] = [
    { kind: "PRICE_CHANGED", field: "price_usd", before: num(prev["price_usd"]), after: next.priceUsd },
    { kind: "LIQUIDITY_CHANGED", field: "liquidity_usd", before: num(prev["liquidity_usd"]), after: next.liquidityUsd },
    { kind: "VOLUME_CHANGED", field: "volume_24h_usd", before: num(prev["volume_24h_usd"]), after: next.volume24hUsd },
    { kind: "TOKEN_ACCELERATION", field: "market_cap_usd", before: num(prev["market_cap_usd"]), after: next.marketCapUsd },
  ];
  for (const f of fields) {
    const e = changeEvent({
      kind: f.kind,
      entityKind: "TOKEN",
      entityId,
      source: "dexscreener",
      field: f.field,
      before: f.before,
      after: f.after,
      observedAt,
    });
    if (e) out.push(e);
  }
  return out;
}

async function storeObservation(
  client: Db,
  obs: PairObservation,
  summary: CollectionSummary,
  eventSink: StellarisEvent[],
  tokenIds: Map<string, string>,
): Promise<void> {
  const classifierInput = {
    chainId: obs.chainId,
    dexId: obs.dexId,
    baseSymbol: obs.baseSymbol,
    baseName: obs.baseName,
    marketCapUsd: obs.marketCap,
    fdvUsd: obs.fdv,
    liquidityUsd: obs.liquidityUsd,
    pairCreatedAt: obs.pairCreatedAt,
    now: obs.observedAt,
  };
  const cls = classifyMeme(classifierInput);
  if (cls.verdict === "NOT MEME") {
    summary.rejected++;
    return;
  }
  if (cls.verdict === "UNKNOWN") summary.unknown++;
  else summary.memes++;

  const token = await upsertToken(client, {
    ...classifierInput,
    address: obs.baseAddress,
    symbol: obs.baseSymbol,
    name: obs.baseName,
    origin: "DEX",
    imageUrl: obs.imageUrl,
  });
  if (!token.id) {
    if (token.error) summary.errors.push(`token upsert: ${token.error}`);
    return;
  }
  const entityId = `${obs.chainId}:${obs.baseAddress}`;
  const firstThisCycle = !tokenIds.has(entityId);
  tokenIds.set(entityId, token.id);

  const prev = await latestSnapshot(client, token.id);
  if (!prev && firstThisCycle) {
    eventSink.push(
      discoveryEvent({
        entityKind: "TOKEN",
        entityId,
        source: "dexscreener",
        observedAt: obs.observedAt,
        summary: `${obs.baseSymbol || "Unknown token"} first observed on ${obs.chainId} (${obs.dexId || "unknown venue"}).`,
      }),
    );
  }

  const ins = await insertTokenSnapshot(client, {
    tokenId: token.id,
    source: "dexscreener",
    observedAt: obs.observedAt,
    priceUsd: obs.priceUsd,
    marketCapUsd: obs.marketCap,
    fdvUsd: obs.fdv,
    liquidityUsd: obs.liquidityUsd,
    volume5mUsd: obs.volume.m5,
    volume1hUsd: obs.volume.h1,
    volume24hUsd: obs.volume.h24,
    txns5mBuys: obs.txns.m5?.buys ?? null,
    txns5mSells: obs.txns.m5?.sells ?? null,
    txns24hBuys: obs.txns.h24?.buys ?? null,
    txns24hSells: obs.txns.h24?.sells ?? null,
    holders: null,
    dataQuality: cls.verdict === "UNKNOWN" ? "PARTIAL" : "COMPLETE",
    confidence: "OBSERVED",
  });
  if (ins.error) summary.errors.push(`snapshot: ${ins.error}`);
  if (ins.inserted) summary.snapshotsStored++;

  const pair = await upsertPair(client, {
    tokenId: token.id,
    chainId: obs.chainId,
    pairAddress: obs.pairAddress,
    dexId: obs.dexId,
    quoteSymbol: obs.quoteSymbol,
    url: obs.url,
    pairCreatedAt: obs.pairCreatedAt,
  });
  if (pair.error) summary.errors.push(`pair: ${pair.error}`);

  if (prev) {
    for (const e of changesFor(
      entityId,
      prev,
      {
        priceUsd: obs.priceUsd,
        liquidityUsd: obs.liquidityUsd,
        volume24hUsd: obs.volume.h24,
        marketCapUsd: obs.marketCap,
      },
      obs.observedAt,
    ))
      eventSink.push(e);

    // Liquidity collapse is the one condition worth interrupting the operator for.
    const prevLiq = num(prev["liquidity_usd"]);
    if (prevLiq && prevLiq > 10_000 && obs.liquidityUsd !== null && obs.liquidityUsd < prevLiq * 0.5) {
      const a = await raiseAlert(client, {
        tokenId: token.id,
        category: "LIQUIDITY",
        severity: "CRITICAL",
        title: `${obs.baseSymbol || "Token"} liquidity fell ${Math.round((1 - obs.liquidityUsd / prevLiq) * 100)}%`,
        why: [
          `Pool liquidity went from $${Math.round(prevLiq).toLocaleString()} to $${Math.round(obs.liquidityUsd).toLocaleString()}.`,
          `Observed on ${obs.chainId} via DEX Screener at ${new Date(obs.observedAt).toISOString()}.`,
        ],
        cooldownKey: `liquidity-drop:${entityId}`,
        cooldownMinutes: 30,
      });
      if (a.created) summary.alertsRaised++;
    }
  }
}

async function collectPumpfunLaunches(
  client: Db,
  summary: CollectionSummary,
  events: StellarisEvent[],
  tokenIds: Map<string, string>,
): Promise<void> {
  if (!pumpfunProvider.configured()) {
    summary.notes.push(
      "Pump.fun launch discovery is not running: no documented third-party data backend is configured yet.",
    );
    return;
  }
  // PumpPortal is a stream: drain a bounded window per cycle. Launches that
  // occur outside the listening window are simply not observed.
  const launches = await pumpfunProvider.discover?.({ limit: 50, windowMs: 8_000 });
  if (!launches) return;
  if (launches.unsupportedReason) {
    summary.notes.push(launches.unsupportedReason);
    return;
  }
  if (!launches.ok || !launches.data) {
    if (launches.error) summary.errors.push(`pump.fun: ${launches.error}`);
    return;
  }
  for (const l of launches.data as unknown as {
    mint: string;
    symbol: string | null;
    name: string | null;
    creator: string | null;
    observedAt: number;
  }[]) {
    const t = await upsertToken(client, {
      chainId: "solana",
      address: l.mint,
      symbol: l.symbol,
      name: l.name,
      creatorAddress: l.creator,
      createdAtChain: l.observedAt,
      origin: "PUMPFUN",
      dexId: "pumpfun",
      baseSymbol: l.symbol,
      baseName: l.name,
      marketCapUsd: null,
      fdvUsd: null,
      liquidityUsd: null,
      pairCreatedAt: l.observedAt,
      pumpfunOrigin: true,
      now: Date.now(),
    });
    if (!t.id) {
      if (t.error) summary.errors.push(`pump.fun token: ${t.error}`);
      continue;
    }
    summary.memes++;
    const entityId = `solana:${l.mint}`;
    tokenIds.set(entityId, t.id);
    await recordLifecycle(client, {
      tokenId: t.id,
      stage: "LAUNCHED",
      basis: "Pump.fun token creation event",
      source: "pumpfun",
      observedAt: l.observedAt,
    });
    events.push(
      discoveryEvent({
        entityKind: "TOKEN",
        entityId,
        source: "pumpfun",
        observedAt: l.observedAt,
        summary: `${l.symbol || "New token"} created on Pump.fun.`,
      }),
    );
  }
}

/** One collection cycle. Safe to call repeatedly; nothing is duplicated. */
export async function runCollectionCycle(opts: { queries?: string[] } = {}): Promise<CollectionSummary> {
  const summary: CollectionSummary = {
    ok: false,
    startedAt: Date.now(),
    finishedAt: 0,
    discovered: 0,
    memes: 0,
    unknown: 0,
    rejected: 0,
    snapshotsStored: 0,
    eventsStored: 0,
    alertsRaised: 0,
    errors: [],
    notes: [],
  };

  const client = db();
  if (!client) {
    summary.errors.push("Supabase is not configured, so nothing can be stored.");
    summary.finishedAt = Date.now();
    return summary;
  }
  const schema = await memeSchemaReady(client);
  if (!schema.ready) {
    summary.errors.push(schema.error ?? "The meme intelligence schema is missing.");
    summary.finishedAt = Date.now();
    return summary;
  }

  const queries = opts.queries ?? (await getSetting<string[]>("discovery_queries", DEFAULT_QUERIES));
  const events: StellarisEvent[] = [];
  const tokenIds = new Map<string, string>();

  for (const q of queries) {
    const r = await dexscreenerProvider.discover?.({ query: q });
    if (!r || !r.ok || !r.data) {
      if (r?.error) summary.errors.push(`discovery "${q}": ${r.error}`);
      continue;
    }
    summary.discovered += r.data.length;
    for (const obs of r.data) {
      try {
        await storeObservation(client, obs, summary, events, tokenIds);
      } catch (e) {
        summary.errors.push(e instanceof Error ? e.message : "observation failed");
      }
    }
  }

  await collectPumpfunLaunches(client, summary, events, tokenIds);

  const stored = await insertEvents(client, dedupe(events), (e) => tokenIds.get(e.entityId) ?? null);
  if (stored.error) summary.errors.push(`events: ${stored.error}`);
  summary.eventsStored = stored.stored;

  summary.ok = summary.errors.length === 0;
  summary.finishedAt = Date.now();

  await audit({
    action: "COLLECTION_CYCLE",
    component: "pipeline",
    detail: `${summary.memes} meme tokens, ${summary.snapshotsStored} snapshots, ${summary.eventsStored} events`,
    payload: summary as unknown as Record<string, unknown>,
  });

  return summary;
}
