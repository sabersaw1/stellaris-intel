/**
 * STELLARIS PERSISTENT MEMORY (server only)
 *
 * Every read and write in this file goes to the operator's own Supabase project
 * with the service role key. The browser never sees a credential: the UI calls
 * server functions in `src/lib/memory.functions.ts`, which call these helpers.
 *
 * Nothing here invents data. When a table is missing or the project is not
 * configured, the caller receives `configured: false` / an explicit error and
 * the UI says so rather than pretending memory exists.
 */

import type { Investigation } from "../stellaris";
import { getAdmin } from "./admin.server";

export const marketKey = (chainId: string, pairAddress: string) => `${chainId}:${pairAddress}`.toLowerCase();

type Db = NonNullable<ReturnType<typeof getAdmin>>;

/* --------------------------------------------------------------- markets --- */

export type MarketIdent = {
  chainId: string;
  pairAddress: string;
  symbol?: string | null;
  name?: string | null;
  dexId?: string | null;
};

/** Upserts the market identity and returns its uuid (needed by every relation). */
export async function ensureMarket(db: Db, m: MarketIdent): Promise<string | null> {
  const { data, error } = await db
    .from("markets")
    .upsert(
      {
        chain_id: m.chainId,
        pair_address: m.pairAddress,
        base_symbol: m.symbol ?? null,
        base_name: m.name ?? null,
        dex_id: m.dexId ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "chain_id,pair_address" },
    )
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

async function marketIdFor(db: Db, chainId: string, pairAddress: string): Promise<string | null> {
  const { data } = await db
    .from("markets")
    .select("id")
    .eq("chain_id", chainId)
    .eq("pair_address", pairAddress)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/* ------------------------------------------------------------- watchlist --- */

export type WatchRow = {
  key: string;
  chainId: string;
  pairAddress: string;
  symbol: string;
  group: string;
  note: string | null;
  addedAt: number;
};

export async function listWatchlist(db: Db): Promise<WatchRow[]> {
  const { data, error } = await db
    .from("watchlist")
    .select("note, group_name, added_at, markets ( chain_id, pair_address, base_symbol )")
    .is("removed_at", null)
    .order("added_at", { ascending: false });
  if (error || !data) return [];
  return data.flatMap((r) => {
    const m = r.markets as unknown as { chain_id: string; pair_address: string; base_symbol: string | null } | null;
    if (!m) return [];
    return [
      {
        key: marketKey(m.chain_id, m.pair_address),
        chainId: m.chain_id,
        pairAddress: m.pair_address,
        symbol: m.base_symbol ?? "?",
        group: (r.group_name as string | null) ?? "Default",
        note: (r.note as string | null) ?? null,
        addedAt: new Date(r.added_at as string).getTime(),
      },
    ];
  });
}

export async function setWatch(
  db: Db,
  m: MarketIdent,
  watched: boolean,
  group = "Default",
): Promise<{ watched: boolean; error: string | null }> {
  const id = await ensureMarket(db, m);
  if (!id) return { watched: false, error: "market could not be stored" };
  if (!watched) {
    const { error } = await db.from("watchlist").delete().eq("market_id", id);
    return { watched: false, error: error?.message ?? null };
  }
  const { error } = await db
    .from("watchlist")
    .upsert(
      { market_id: id, group_name: group, market_key: marketKey(m.chainId, m.pairAddress), removed_at: null },
      { onConflict: "market_id" },
    );
  return { watched: !error, error: error?.message ?? null };
}

export async function setWatchGroup(db: Db, chainId: string, pairAddress: string, group: string) {
  const id = await marketIdFor(db, chainId, pairAddress);
  if (!id) return { error: "market not found in memory" };
  const { error } = await db.from("watchlist").update({ group_name: group }).eq("market_id", id);
  return { error: error?.message ?? null };
}

/* ----------------------------------------------------------------- notes --- */

export async function getNote(db: Db, chainId: string, pairAddress: string): Promise<string> {
  const id = await marketIdFor(db, chainId, pairAddress);
  if (!id) return "";
  const { data } = await db.from("research_notes").select("body").eq("market_id", id).maybeSingle();
  return (data?.body as string | undefined) ?? "";
}

export async function setNote(db: Db, m: MarketIdent, body: string) {
  const id = await ensureMarket(db, m);
  if (!id) return { error: "market could not be stored" };
  const { error } = await db
    .from("research_notes")
    .upsert({ market_id: id, body, updated_at: new Date().toISOString() }, { onConflict: "market_id" });
  return { error: error?.message ?? null };
}

export async function listNotes(db: Db) {
  const { data } = await db
    .from("research_notes")
    .select("body, updated_at, markets ( chain_id, pair_address, base_symbol )")
    .order("updated_at", { ascending: false })
    .limit(200);
  return (data ?? []).flatMap((r) => {
    const m = r.markets as unknown as { chain_id: string; pair_address: string; base_symbol: string | null } | null;
    if (!m) return [];
    return [
      {
        key: marketKey(m.chain_id, m.pair_address),
        symbol: m.base_symbol ?? "?",
        chainId: m.chain_id,
        pairAddress: m.pair_address,
        body: r.body as string,
        updatedAt: new Date(r.updated_at as string).getTime(),
      },
    ];
  });
}

/* ---------------------------------------------------------------- alerts --- */

export type AlertRow = {
  id: string;
  t: number;
  key: string;
  symbol: string;
  chainId: string;
  dexId: string;
  kind: string;
  severity: string;
  message: string;
  confidence: number;
  acknowledged: boolean;
};

const ALERT_COOLDOWN_MS = 5 * 60_000;

export async function listAlerts(db: Db, limit = 300): Promise<AlertRow[]> {
  const { data, error } = await db
    .from("alert_events")
    .select("id, market_key, symbol, chain_id, dex_id, kind, severity, message, confidence, acknowledged, detected_at")
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    t: new Date(r.detected_at as string).getTime(),
    key: (r.market_key as string) ?? "",
    symbol: (r.symbol as string) ?? "?",
    chainId: (r.chain_id as string) ?? "",
    dexId: (r.dex_id as string) ?? "",
    kind: r.kind as string,
    severity: r.severity as string,
    message: r.message as string,
    confidence: Number(r.confidence ?? 0),
    acknowledged: Boolean(r.acknowledged),
  }));
}

/** Cooldown-gated insert: the same market+kind is not re-recorded within 5 min. */
export async function insertAlert(
  db: Db,
  e: {
    key: string;
    chainId: string;
    pairAddress?: string;
    symbol: string;
    dexId: string;
    kind: string;
    severity: string;
    message: string;
    confidence: number;
  },
): Promise<{ stored: boolean; error: string | null }> {
  const since = new Date(Date.now() - ALERT_COOLDOWN_MS).toISOString();
  const { data: dupe } = await db
    .from("alert_events")
    .select("id")
    .eq("market_key", e.key)
    .eq("kind", e.kind)
    .gte("detected_at", since)
    .limit(1);
  if (dupe && dupe.length) return { stored: false, error: null };

  const marketId = e.pairAddress
    ? await ensureMarket(db, { chainId: e.chainId, pairAddress: e.pairAddress, symbol: e.symbol, dexId: e.dexId })
    : null;

  const { error } = await db.from("alert_events").insert({
    market_id: marketId,
    market_key: e.key,
    symbol: e.symbol,
    chain_id: e.chainId,
    dex_id: e.dexId,
    kind: e.kind,
    severity: e.severity,
    message: e.message,
    confidence: e.confidence,
  });
  return { stored: !error, error: error?.message ?? null };
}

export async function acknowledgeAlerts(db: Db) {
  const { error } = await db.from("alert_events").update({ acknowledged: true }).eq("acknowledged", false);
  return { error: error?.message ?? null };
}

export async function clearAlerts(db: Db) {
  const { error } = await db.from("alert_events").delete().neq("kind", "");
  return { error: error?.message ?? null };
}

/* --------------------------------------------------------------- presets --- */

export async function listPresets(db: Db) {
  const { data } = await db.from("filter_presets").select("id, name, definition, saved_at").order("saved_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    json: r.definition as string,
    savedAt: new Date(r.saved_at as string).getTime(),
  }));
}

export async function savePreset(db: Db, name: string, definition: string) {
  const { error } = await db.from("filter_presets").insert({ name, definition });
  return { error: error?.message ?? null };
}

export async function deletePreset(db: Db, id: string) {
  const { error } = await db.from("filter_presets").delete().eq("id", id);
  return { error: error?.message ?? null };
}

/* -------------------------------------------------------- investigations --- */

/**
 * Persists one research cycle for a market: the investigation row plus the
 * evidence, unknown questions, conflicts, hypotheses and challenger review it
 * produced. Existing rows for the market are updated, not duplicated.
 */
export async function saveInvestigation(db: Db, inv: Investigation): Promise<{ error: string | null }> {
  const marketId = await ensureMarket(db, {
    chainId: inv.chainId,
    pairAddress: inv.pairAddress,
    symbol: inv.assessment.pair.baseSymbol,
    name: inv.assessment.pair.baseName,
    dexId: inv.assessment.pair.dexId,
  });
  if (!marketId) return { error: "market could not be stored" };

  const { data: existing } = await db.from("investigations").select("id").eq("market_id", marketId).maybeSingle();

  const row = {
    market_id: marketId,
    state: inv.state === "HIGH-RISK SIGNALS" ? "HIGH-RISK" : inv.state === "ELEVATED RISK SIGNALS" ? "ELEVATED RISK" : inv.state,
    priority: inv.priority ?? 0,
    headline: inv.label,
    plain_english: inv.summary,
    risk_signal: inv.assessment.risk.score,
    evidence_quality: inv.assessment.confidence.score,
    source_agreement: inv.sourceAgreement,
    data_quality: inv.dataDegraded ? "DEGRADED" : "OK",
    model_version: inv.assessment.risk.engineVersion ?? null,
    updated_at: new Date().toISOString(),
  };

  let investigationId = existing?.id as string | undefined;
  if (investigationId) {
    const { error } = await db.from("investigations").update(row).eq("id", investigationId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await db.from("investigations").insert(row).select("id").maybeSingle();
    if (error || !data) return { error: error?.message ?? "investigation not stored" };
    investigationId = data.id as string;
  }

  // Evidence: replace this cycle's derived rows for the market (no duplicates).
  await db.from("evidence").delete().eq("market_id", marketId).eq("source", "stellaris-derived");
  const evidenceRows = inv.layers.flatMap((layer) =>
    layer.items.map((item) => ({
      market_id: marketId,
      layer: layer.id,
      grade: item.grade,
      source: "stellaris-derived",
      label: `${layer.title} · ${item.label}`,
      value: item.value,
      detail: item.note ?? layer.requires,
    })),
  );
  if (evidenceRows.length) await db.from("evidence").insert(evidenceRows);

  await db.from("unknown_questions").delete().eq("investigation_id", investigationId).is("answered_at", null);
  const unknownRows = inv.unknown.map((q) => ({
    market_id: marketId,
    investigation_id: investigationId!,
    question: q,
    blocked_by: inv.layers.find((l) => l.grade === "UNKNOWN")?.requires ?? null,
  }));
  if (unknownRows.length) await db.from("unknown_questions").insert(unknownRows);

  await db.from("conflicts").delete().eq("investigation_id", investigationId).is("resolved_at", null);
  const conflictRows = inv.conflicting.map((c) => ({
    market_id: marketId,
    investigation_id: investigationId!,
    topic: "READING DISAGREEMENT",
    side_a: c,
    side_b: inv.sourceAgreementBasis,
  }));
  if (conflictRows.length) await db.from("conflicts").insert(conflictRows);

  await db.from("hypotheses").delete().eq("investigation_id", investigationId).eq("status", "OPEN");
  if (inv.nextQuestion) {
    await db.from("hypotheses").insert({
      market_id: marketId,
      investigation_id: investigationId,
      statement: inv.nextQuestion,
      supports: inv.known,
      contradicts: inv.conflicting,
      status: "OPEN",
    });
  }

  await db.from("challenger_reviews").insert({
    investigation_id: investigationId,
    outcome: inv.challenger.outcome,
    question: inv.challenger.question,
    checks: inv.challenger.checked,
  });

  return { error: null };
}

export type StoredInvestigation = {
  id: string;
  key: string;
  symbol: string;
  chainId: string;
  pairAddress: string;
  state: string;
  priority: number;
  plainEnglish: string | null;
  riskSignal: number | null;
  evidenceQuality: number | null;
  sourceAgreement: string | null;
  dataQuality: string | null;
  updatedAt: number;
  unknowns: number;
  conflicts: number;
};

export async function listInvestigations(db: Db, limit = 100): Promise<StoredInvestigation[]> {
  const { data, error } = await db
    .from("investigations")
    .select(
      "id, state, priority, plain_english, risk_signal, evidence_quality, source_agreement, data_quality, updated_at, markets ( chain_id, pair_address, base_symbol )",
    )
    .order("priority", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const ids = data.map((r) => r.id as string);
  const [{ data: unk }, { data: con }] = await Promise.all([
    db.from("unknown_questions").select("investigation_id").in("investigation_id", ids),
    db.from("conflicts").select("investigation_id").in("investigation_id", ids),
  ]);
  const tally = (rows: { investigation_id: string | null }[] | null) => {
    const map = new Map<string, number>();
    for (const r of rows ?? []) if (r.investigation_id) map.set(r.investigation_id, (map.get(r.investigation_id) ?? 0) + 1);
    return map;
  };
  const unknowns = tally(unk as { investigation_id: string | null }[] | null);
  const conflicts = tally(con as { investigation_id: string | null }[] | null);

  return data.flatMap((r) => {
    const m = r.markets as unknown as { chain_id: string; pair_address: string; base_symbol: string | null } | null;
    if (!m) return [];
    const id = r.id as string;
    return [
      {
        id,
        key: marketKey(m.chain_id, m.pair_address),
        symbol: m.base_symbol ?? "?",
        chainId: m.chain_id,
        pairAddress: m.pair_address,
        state: r.state as string,
        priority: Number(r.priority ?? 0),
        plainEnglish: (r.plain_english as string | null) ?? null,
        riskSignal: r.risk_signal === null ? null : Number(r.risk_signal),
        evidenceQuality: r.evidence_quality === null ? null : Number(r.evidence_quality),
        sourceAgreement: (r.source_agreement as string | null) ?? null,
        dataQuality: (r.data_quality as string | null) ?? null,
        updatedAt: new Date(r.updated_at as string).getTime(),
        unknowns: unknowns.get(id) ?? 0,
        conflicts: conflicts.get(id) ?? 0,
      },
    ];
  });
}

/* -------------------------------------------- outcomes and calibration --- */

export async function recordOutcome(
  db: Db,
  o: { chainId: string; pairAddress: string; assessedState: string; observedResult: string; windowHours: number; detail?: string | undefined },
) {
  const marketId = await marketIdFor(db, o.chainId, o.pairAddress);
  if (!marketId) return { error: "market not found in memory" };
  const { data: inv } = await db.from("investigations").select("id").eq("market_id", marketId).maybeSingle();
  const { error } = await db.from("outcomes").insert({
    investigation_id: (inv?.id as string | undefined) ?? null,
    market_id: marketId,
    assessed_state: o.assessedState,
    observed_result: o.observedResult,
    window_hours: o.windowHours,
    detail: o.detail ?? null,
  });
  return { error: error?.message ?? null };
}

/**
 * Recomputes calibration from recorded outcomes only. With no outcomes the
 * result is INSUFFICIENT DATA — never a placeholder accuracy number.
 */
export async function recalculateCalibration(db: Db, modelVersion: string) {
  const { data } = await db.from("outcomes").select("assessed_state, observed_result");
  const rows = (data ?? []) as { assessed_state: string | null; observed_result: string }[];
  const buckets = new Map<string, { cases: number; correct: number }>();
  for (const r of rows) {
    const bucket = r.assessed_state ?? "UNKNOWN";
    const b = buckets.get(bucket) ?? { cases: 0, correct: 0 };
    b.cases += 1;
    if (r.observed_result === "CONFIRMED") b.correct += 1;
    buckets.set(bucket, b);
  }
  for (const [bucket, b] of buckets) {
    await db
      .from("calibration")
      .upsert(
        { model_version: modelVersion, bucket, cases: b.cases, correct: b.correct, updated_at: new Date().toISOString() },
        { onConflict: "model_version,bucket" },
      );
  }
  return { buckets: buckets.size, cases: rows.length };
}

export async function calibrationSummary(db: Db) {
  const [{ data: cal }, { count: outcomeCount }] = await Promise.all([
    db.from("calibration").select("model_version, bucket, cases, correct, updated_at").order("bucket"),
    db.from("outcomes").select("*", { count: "exact", head: true }),
  ]);
  return {
    outcomes: outcomeCount ?? 0,
    buckets: (cal ?? []).map((r) => ({
      modelVersion: r.model_version as string,
      bucket: r.bucket as string,
      cases: Number(r.cases ?? 0),
      correct: Number(r.correct ?? 0),
      updatedAt: new Date(r.updated_at as string).getTime(),
    })),
  };
}

/* ---------------------------------------------------------------- memory --- */

export type MemoryHit = {
  key: string;
  symbol: string;
  chainId: string;
  pairAddress: string;
  firstSeenAt: number;
  lastSeenAt: number;
  observations: number;
  changes: number;
  watched: boolean;
  note: string | null;
};

export async function searchMemory(db: Db, q: string, limit = 40): Promise<MemoryHit[]> {
  let query = db.from("markets").select("id, chain_id, pair_address, base_symbol, base_name, first_seen_at, last_seen_at");
  if (q.trim()) query = query.or(`base_symbol.ilike.%${q}%,base_name.ilike.%${q}%,pair_address.ilike.%${q}%`);
  const { data, error } = await query.order("last_seen_at", { ascending: false }).limit(limit);
  if (error || !data) return [];

  const ids = data.map((r) => r.id as string);
  const [{ data: obs }, { data: chg }, { data: watch }, { data: notes }] = await Promise.all([
    db.from("market_observations").select("market_id").in("market_id", ids),
    db.from("change_events").select("market_id").in("market_id", ids),
    db.from("watchlist").select("market_id").in("market_id", ids).is("removed_at", null),
    db.from("research_notes").select("market_id, body").in("market_id", ids),
  ]);
  const count = (rows: { market_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.market_id, (m.get(r.market_id) ?? 0) + 1);
    return m;
  };
  const obsCount = count(obs as { market_id: string }[] | null);
  const chgCount = count(chg as { market_id: string }[] | null);
  const watched = new Set((watch ?? []).map((r) => r.market_id as string));
  const noteMap = new Map((notes ?? []).map((r) => [r.market_id as string, r.body as string]));

  return data.map((r) => ({
    key: marketKey(r.chain_id as string, r.pair_address as string),
    symbol: (r.base_symbol as string | null) ?? "?",
    chainId: r.chain_id as string,
    pairAddress: r.pair_address as string,
    firstSeenAt: new Date(r.first_seen_at as string).getTime(),
    lastSeenAt: new Date(r.last_seen_at as string).getTime(),
    observations: obsCount.get(r.id as string) ?? 0,
    changes: chgCount.get(r.id as string) ?? 0,
    watched: watched.has(r.id as string),
    note: noteMap.get(r.id as string) ?? null,
  }));
}

/** Stored observation series for one market, oldest first. */
export async function observationSeries(db: Db, chainId: string, pairAddress: string, limit = 200) {
  const id = await marketIdFor(db, chainId, pairAddress);
  if (!id) return [];
  const { data } = await db
    .from("market_observations")
    .select("observed_at, price_usd, liquidity_usd, volume_24h_usd, fdv_usd")
    .eq("market_id", id)
    .order("observed_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .map((r) => ({
      t: new Date(r.observed_at as string).getTime(),
      priceUsd: r.price_usd === null ? null : Number(r.price_usd),
      liquidityUsd: r.liquidity_usd === null ? null : Number(r.liquidity_usd),
      volume24h: r.volume_24h_usd === null ? null : Number(r.volume_24h_usd),
      fdv: r.fdv_usd === null ? null : Number(r.fdv_usd),
    }))
    .reverse();
}

export async function recentChangeEvents(db: Db, limit = 60) {
  const { data } = await db
    .from("change_events")
    .select("field, before_value, after_value, magnitude, detail, detected_at, markets ( chain_id, pair_address, base_symbol )")
    .order("detected_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const m = r.markets as unknown as { chain_id: string; pair_address: string; base_symbol: string | null } | null;
    return {
      field: r.field as string,
      before: (r.before_value as string | null) ?? null,
      after: (r.after_value as string | null) ?? null,
      magnitude: r.magnitude === null ? null : Number(r.magnitude),
      detail: (r.detail as string | null) ?? null,
      detectedAt: new Date(r.detected_at as string).getTime(),
      symbol: m?.base_symbol ?? "?",
      chainId: m?.chain_id ?? "",
      pairAddress: m?.pair_address ?? "",
    };
  });
}
