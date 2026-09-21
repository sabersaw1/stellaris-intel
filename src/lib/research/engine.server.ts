/**
 * RESEARCH ENGINE (server only).
 *
 * The automated half of the pipeline:
 *   OBSERVATIONS -> FEATURES -> REGIME -> RESEARCH OBSERVATION (prediction)
 *   -> OUTCOME RESOLUTION -> CALIBRATION -> SIGNAL -> RISK CHECK -> PAPER TRADE
 *
 * Honesty rules enforced in code:
 *  - a prediction is written before its outcome can be known, and is resolved
 *    only from a genuinely later stored market observation;
 *  - a market without enough stored history produces NO prediction;
 *  - calibration is computed from resolved rows only and reports INSUFFICIENT
 *    DATA below the minimum case count;
 *  - nothing touches a real exchange. Paper trading is a simulation over stored
 *    prices with explicit fee and slippage assumptions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeFeatures, type SeriesPoint } from "./features";
import { classifyRegime } from "./regime";
import { STRATEGIES, predict } from "./strategy";
import { DEFAULT_LIMITS, EXECUTION_ASSUMPTIONS, checkRisk, type RiskLimits } from "./risk";
import { universeSymbols } from "./universe";

type Db = SupabaseClient;

export const RESEARCH_ENGINE_VERSION = "research-engine v1.0";
/** Minimum resolved predictions before any calibration number is displayed. */
export const MIN_RESOLVED = 20;

export type ResearchCycleResult = {
  configured: boolean;
  assetsConsidered: number;
  marketsAnalysed: number;
  regimesStored: number;
  predictionsStored: number;
  predictionsResolved: number;
  signalsStored: number;
  paperOpened: number;
  paperClosed: number;
  skipped: { asset: string; reason: string }[];
  errors: string[];
  durationMs: number;
};

/* ------------------------------------------------------------ strategies --- */

export async function seedStrategies(db: Db): Promise<void> {
  for (const s of STRATEGIES) {
    await db.from("strategy_versions").upsert(
      {
        name: s.name,
        version: s.version,
        description: s.description,
        timeframe: s.timeframe,
        features: s.features,
        entry_rules: s.entryRules,
        exit_rules: s.exitRules,
        risk_rules: s.riskRules,
        parameters: s.parameters,
        status: s.status,
      },
      { onConflict: "name,version" },
    );
  }
}

/* --------------------------------------------------------------- helpers --- */

async function universe(db: Db): Promise<string[]> {
  const { data } = await db.from("asset_universe").select("symbol, enabled").eq("enabled", true);
  const stored = (data ?? []).map((r) => String(r.symbol).toUpperCase());
  return stored.length ? stored : universeSymbols(process.env["STELLARIS_ASSET_UNIVERSE"]);
}

async function bestMarketFor(db: Db, symbol: string): Promise<{ id: string; asset: string } | null> {
  const { data: markets } = await db
    .from("markets")
    .select("id, base_symbol")
    .ilike("base_symbol", symbol)
    .limit(30);
  const ids = (markets ?? []).map((m) => String(m.id));
  if (!ids.length) return null;

  const { data: obs } = await db
    .from("market_observations")
    .select("market_id, liquidity_usd")
    .in("market_id", ids)
    .order("observed_at", { ascending: false })
    .limit(600);

  const score = new Map<string, { count: number; liquidity: number }>();
  for (const o of obs ?? []) {
    const id = String(o.market_id);
    const cur = score.get(id) ?? { count: 0, liquidity: 0 };
    cur.count += 1;
    cur.liquidity = Math.max(cur.liquidity, Number(o.liquidity_usd ?? 0));
    score.set(id, cur);
  }
  let best: { id: string; rank: number } | null = null;
  for (const [id, s] of score) {
    const rank = s.count * 1000 + Math.log10(1 + s.liquidity);
    if (!best || rank > best.rank) best = { id, rank };
  }
  if (!best) return { id: ids[0]!, asset: symbol.toUpperCase() };
  return { id: best.id, asset: symbol.toUpperCase() };
}

async function seriesFor(db: Db, marketId: string, limit = 300): Promise<SeriesPoint[]> {
  const { data } = await db
    .from("market_observations")
    .select("observed_at, price_usd, liquidity_usd, volume_24h_usd, fdv_usd")
    .eq("market_id", marketId)
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

async function limits(db: Db): Promise<RiskLimits> {
  const { data } = await db.from("risk_limits").select("*").eq("id", "default").maybeSingle();
  if (!data) return DEFAULT_LIMITS;
  return {
    maxPositionUsd: Number(data.max_position_usd ?? DEFAULT_LIMITS.maxPositionUsd),
    maxPortfolioExposure: Number(data.max_portfolio_exposure ?? DEFAULT_LIMITS.maxPortfolioExposure),
    maxAssetExposure: Number(data.max_asset_exposure ?? DEFAULT_LIMITS.maxAssetExposure),
    maxDailyLoss: Number(data.max_daily_loss ?? DEFAULT_LIMITS.maxDailyLoss),
    maxDrawdownPct: Number(data.max_drawdown_pct ?? DEFAULT_LIMITS.maxDrawdownPct),
    maxOpenPositions: Number(data.max_open_positions ?? DEFAULT_LIMITS.maxOpenPositions),
    maxVolatilityPct: Number(data.max_volatility_pct ?? DEFAULT_LIMITS.maxVolatilityPct),
    minLiquidityUsd: Number(data.min_liquidity_usd ?? DEFAULT_LIMITS.minLiquidityUsd),
    emergencyStop: Boolean(data.emergency_stop),
  };
}

async function tradingMode(db: Db): Promise<string> {
  const { data } = await db.from("trading_mode").select("mode").eq("id", "default").maybeSingle();
  return (data?.mode as string | undefined) ?? "RESEARCH ONLY";
}

/* ----------------------------------------------------------- main cycle ---- */

export async function runResearchCycle(db: Db): Promise<ResearchCycleResult> {
  const started = Date.now();
  const out: ResearchCycleResult = {
    configured: true,
    assetsConsidered: 0,
    marketsAnalysed: 0,
    regimesStored: 0,
    predictionsStored: 0,
    predictionsResolved: 0,
    signalsStored: 0,
    paperOpened: 0,
    paperClosed: 0,
    skipped: [],
    errors: [],
    durationMs: 0,
  };

  try {
    await seedStrategies(db);
    const symbols = await universe(db);
    out.assetsConsidered = symbols.length;
    const mode = await tradingMode(db);
    const risk = await limits(db);
    const paperEnabled = mode === "PAPER TRADING" || mode === "RESEARCH ONLY";

    for (const symbol of symbols) {
      const market = await bestMarketFor(db, symbol);
      if (!market) {
        out.skipped.push({ asset: symbol, reason: "No stored market for this symbol yet" });
        continue;
      }
      const series = await seriesFor(db, market.id);
      const f = computeFeatures(series);
      if (!f.sufficient) {
        out.skipped.push({ asset: symbol, reason: `INSUFFICIENT DATA — ${f.points} stored observation(s), need 12` });
        continue;
      }
      out.marketsAnalysed += 1;
      const regime = classifyRegime(f, series.at(-1)?.t ?? Date.now());

      const regimeInsert = await db.from("market_regimes").insert({
        market_id: market.id,
        regime: regime.secondary ? `${regime.regime}+${regime.secondary}` : regime.regime,
        basis: `${regime.basis} (confidence ${regime.confidence})`,
        features: f.byKey,
      });
      if (!regimeInsert.error) out.regimesStored += 1;

      const price = f.byKey["price"];
      for (const def of STRATEGIES) {
        const p = predict(def, f, regime.regime);
        if (!p.sufficient) continue;

        const horizon = p.horizonMinutes;
        // One open prediction per market/strategy/horizon at a time.
        const { data: openRows } = await db
          .from("research_predictions")
          .select("id")
          .eq("market_id", market.id)
          .eq("strategy_version", def.version)
          .eq("strategy_name", def.name)
          .eq("horizon_minutes", horizon)
          .is("resolved_at", null)
          .limit(1);
        if ((openRows ?? []).length) continue;

        const predictedAt = new Date();
        const ins = await db.from("research_predictions").insert({
          market_id: market.id,
          asset: market.asset,
          strategy_name: def.name,
          strategy_version: def.version,
          regime: regime.regime,
          market_state: {
            price,
            liquidity: f.byKey["liquidity"],
            volume24h: f.byKey["volume_24h"],
            regimeBasis: regime.basis,
            regimeConfidence: regime.confidence,
          },
          features: f.byKey,
          predicted_direction: p.direction,
          probability: p.probability,
          horizon_minutes: horizon,
          reference_price: price,
          predicted_at: predictedAt.toISOString(),
          resolve_at: new Date(predictedAt.getTime() + horizon * 60_000).toISOString(),
        });
        if (ins.error) {
          if (!/duplicate key/i.test(ins.error.message)) out.errors.push(`prediction ${symbol}: ${ins.error.message}`);
        } else {
          out.predictionsStored += 1;
        }

        // SIGNAL + INDEPENDENT RISK CHECK
        const direction = p.direction === "UP" ? "LONG" : p.direction === "DOWN" ? "SHORT" : "FLAT";
        const portfolio = await portfolioState(db, market.asset);
        const verdict = checkRisk(
          risk,
          {
            asset: market.asset,
            notionalUsd: Math.min(risk.maxPositionUsd, 1000),
            volatilityPct: f.byKey["volatility"],
            liquidityUsd: f.byKey["liquidity"],
          },
          portfolio,
        );
        const sig = await db
          .from("signals")
          .insert({
            market_id: market.id,
            asset: market.asset,
            direction: direction === "FLAT" ? "FLAT" : direction,
            strategy_name: def.name,
            strategy_version: def.version,
            confidence: p.probability,
            horizon_minutes: horizon,
            entry_logic: p.entryLogic,
            invalidation: p.invalidation,
            risk_note: p.riskNote,
            regime: regime.regime,
            features: f.byKey,
            state: "ACTIVE",
            risk_verdict: verdict.verdict,
            risk_reason: verdict.reason,
            expires_at: new Date(Date.now() + horizon * 60_000).toISOString(),
          })
          .select("id")
          .maybeSingle();
        if (!sig.error) out.signalsStored += 1;

        // PAPER TRADE — simulation only; a risk rejection cannot be overridden.
        if (paperEnabled && direction !== "FLAT" && verdict.verdict === "ACCEPTED" && typeof price === "number" && price > 0) {
          const slip = EXECUTION_ASSUMPTIONS.slippageBps / 10_000;
          const fee = EXECUTION_ASSUMPTIONS.feeBps / 10_000;
          const fill = price * (1 + (direction === "LONG" ? slip : -slip));
          const qty = verdict.approvedNotional / fill;
          const open = await db.from("paper_positions").insert({
            signal_id: sig.data?.id ?? null,
            market_id: market.id,
            asset: market.asset,
            side: direction,
            quantity: qty,
            entry_price: fill,
            entry_fee: fill * qty * fee,
            slippage_bps: EXECUTION_ASSUMPTIONS.slippageBps,
            stop_price: direction === "LONG" ? fill * 0.98 : fill * 1.02,
            take_profit: direction === "LONG" ? fill * 1.03 : fill * 0.97,
            strategy_name: def.name,
            strategy_version: def.version,
          });
          if (!open.error) out.paperOpened += 1;
        }
      }
    }

    out.predictionsResolved = (await resolvePredictions(db)).resolved;
    out.paperClosed = (await managePaperPositions(db)).closed;
    await computeResearchCalibration(db);
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : "research cycle failed");
  }

  out.durationMs = Date.now() - started;
  return out;
}

/* --------------------------------------------------- outcome resolution ---- */

export async function resolvePredictions(db: Db): Promise<{ resolved: number; errors: string[] }> {
  const errors: string[] = [];
  let resolved = 0;
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db
    .from("research_predictions")
    .select("id, market_id, predicted_direction, probability, reference_price, resolve_at")
    .is("resolved_at", null)
    .lte("resolve_at", nowIso)
    .limit(200);
  if (error) return { resolved: 0, errors: [error.message] };

  for (const row of due ?? []) {
    const resolveAt = new Date(row.resolve_at as string).toISOString();
    // Only a genuinely later observation may resolve a prediction.
    const { data: after } = await db
      .from("market_observations")
      .select("observed_at, price_usd")
      .eq("market_id", row.market_id)
      .gte("observed_at", resolveAt)
      .order("observed_at", { ascending: true })
      .limit(1);
    const actual = (after ?? [])[0] as { observed_at: string; price_usd: number | null } | undefined;
    const ref = row.reference_price === null ? null : Number(row.reference_price);

    if (!actual || actual.price_usd === null || ref === null || ref <= 0) {
      // Leave it open unless the horizon is long past and no data ever arrived.
      const stale = Date.now() - new Date(resolveAt).getTime() > 6 * 60 * 60_000;
      if (stale) {
        await db
          .from("research_predictions")
          .update({
            resolved_at: nowIso,
            direction_outcome: "UNRESOLVABLE",
            resolution_detail: "No market observation was stored after the horizon, so the outcome cannot be established",
          })
          .eq("id", row.id);
        resolved += 1;
      }
      continue;
    }

    const actualPrice = Number(actual.price_usd);
    const actualReturn = ((actualPrice - ref) / ref) * 100;
    const dir = String(row.predicted_direction);
    const flatBand = 0.1; // percent — inside this band the move counts as flat
    const realisedUp = actualReturn > flatBand;
    const realisedDown = actualReturn < -flatBand;
    const outcome =
      dir === "FLAT"
        ? !realisedUp && !realisedDown
          ? "FLAT_CORRECT"
          : "INCORRECT"
        : (dir === "UP" && realisedUp) || (dir === "DOWN" && realisedDown)
          ? "CORRECT"
          : "INCORRECT";
    const correct = outcome === "CORRECT" || outcome === "FLAT_CORRECT" ? 1 : 0;
    const prob = row.probability === null ? null : Number(row.probability);
    const err = prob === null ? null : Math.abs(prob - correct);
    const brier = prob === null ? null : (prob - correct) ** 2;

    const upd = await db
      .from("research_predictions")
      .update({
        resolved_at: new Date().toISOString(),
        actual_price: actualPrice,
        actual_return: actualReturn,
        direction_outcome: outcome,
        prediction_error: err,
        brier_score: brier,
        resolution_detail: `Resolved against the market observation stored at ${actual.observed_at}`,
      })
      .eq("id", row.id);
    if (upd.error) errors.push(upd.error.message);
    else resolved += 1;
  }

  return { resolved, errors };
}

/* --------------------------------------------------- paper position mgmt --- */

export async function managePaperPositions(db: Db): Promise<{ closed: number }> {
  let closed = 0;
  const { data: open } = await db
    .from("paper_positions")
    .select("id, market_id, side, quantity, entry_price, stop_price, take_profit, opened_at")
    .eq("state", "OPEN")
    .limit(200);

  for (const pos of open ?? []) {
    const { data: latest } = await db
      .from("market_observations")
      .select("price_usd, observed_at")
      .eq("market_id", pos.market_id)
      .order("observed_at", { ascending: false })
      .limit(1);
    const px = (latest ?? [])[0]?.price_usd;
    if (px === null || px === undefined) continue;
    const price = Number(px);
    const side = String(pos.side) as "LONG" | "SHORT";
    const stop = pos.stop_price === null ? null : Number(pos.stop_price);
    const target = pos.take_profit === null ? null : Number(pos.take_profit);
    const ageMin = (Date.now() - new Date(pos.opened_at as string).getTime()) / 60_000;

    const hitStop = stop !== null && (side === "LONG" ? price <= stop : price >= stop);
    const hitTarget = target !== null && (side === "LONG" ? price >= target : price <= target);
    const timedOut = ageMin >= 60;
    if (!hitStop && !hitTarget && !timedOut) continue;

    const slip = EXECUTION_ASSUMPTIONS.slippageBps / 10_000;
    const fee = EXECUTION_ASSUMPTIONS.feeBps / 10_000;
    const exitFill = price * (1 - (side === "LONG" ? slip : -slip));
    const qty = Number(pos.quantity);
    const entry = Number(pos.entry_price);
    const gross = (exitFill - entry) * qty * (side === "LONG" ? 1 : -1);
    const exitFee = exitFill * qty * fee;
    const r = await db
      .from("paper_positions")
      .update({
        state: "CLOSED",
        closed_at: new Date().toISOString(),
        exit_price: exitFill,
        exit_fee: exitFee,
        realized_pnl: gross - exitFee,
        exit_reason: hitStop ? "STOP LOSS" : hitTarget ? "TAKE PROFIT" : "HORIZON REACHED",
      })
      .eq("id", pos.id);
    if (!r.error) closed += 1;
  }

  // Equity snapshot from closed results plus open exposure.
  const [{ data: closedRows }, { data: openRows }] = await Promise.all([
    db.from("paper_positions").select("realized_pnl").eq("state", "CLOSED").limit(2000),
    db.from("paper_positions").select("quantity, entry_price").eq("state", "OPEN").limit(2000),
  ]);
  const realized = (closedRows ?? []).reduce((a, r) => a + Number(r.realized_pnl ?? 0), 0);
  const exposure = (openRows ?? []).reduce((a, r) => a + Number(r.quantity ?? 0) * Number(r.entry_price ?? 0), 0);
  await db.from("paper_equity").insert({
    equity: 10_000 + realized,
    cash: 10_000 + realized - exposure,
    exposure,
    open_count: (openRows ?? []).length,
    drawdown: realized < 0 ? realized : 0,
  });

  return { closed };
}

async function portfolioState(db: Db, asset: string) {
  const [{ data: openRows }, { data: dayRows }, { data: eq }] = await Promise.all([
    db.from("paper_positions").select("asset, quantity, entry_price").eq("state", "OPEN").limit(500),
    db
      .from("paper_positions")
      .select("realized_pnl")
      .eq("state", "CLOSED")
      .gte("closed_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .limit(2000),
    db.from("paper_equity").select("equity").order("recorded_at", { ascending: false }).limit(200),
  ]);
  const open = openRows ?? [];
  const exposure = open.reduce((a, r) => a + Number(r.quantity ?? 0) * Number(r.entry_price ?? 0), 0);
  const assetExposure = open
    .filter((r) => String(r.asset).toUpperCase() === asset.toUpperCase())
    .reduce((a, r) => a + Number(r.quantity ?? 0) * Number(r.entry_price ?? 0), 0);
  const dayPnl = (dayRows ?? []).reduce((a, r) => a + Number(r.realized_pnl ?? 0), 0);
  const equities = (eq ?? []).map((r) => Number(r.equity ?? 0)).reverse();
  let peak = 0;
  let dd = 0;
  for (const v of equities) {
    peak = Math.max(peak, v);
    if (peak > 0) dd = Math.max(dd, ((peak - v) / peak) * 100);
  }
  return {
    exposure,
    assetExposure,
    openPositions: open.length,
    dailyLoss: dayPnl < 0 ? Math.abs(dayPnl) : 0,
    drawdownPct: Math.round(dd * 10) / 10,
  };
}

/* ------------------------------------------------------------ calibration -- */

export async function computeResearchCalibration(db: Db): Promise<{ scopes: number; resolved: number }> {
  const { data } = await db
    .from("research_predictions")
    .select("asset, regime, probability, horizon_minutes, direction_outcome, prediction_error, brier_score, resolved_at")
    .not("resolved_at", "is", null)
    .limit(5000);
  const rows = (data ?? []).filter((r) => r.direction_outcome !== "UNRESOLVABLE");

  type Agg = { predictions: number; resolved: number; correct: number; err: number[]; brier: number[] };
  const buckets = new Map<string, Agg>();
  const add = (scope: string, bucket: string, r: (typeof rows)[number]) => {
    const key = `${scope}|${bucket}`;
    const a = buckets.get(key) ?? { predictions: 0, resolved: 0, correct: 0, err: [], brier: [] };
    a.predictions += 1;
    a.resolved += 1;
    if (r.direction_outcome === "CORRECT" || r.direction_outcome === "FLAT_CORRECT") a.correct += 1;
    if (r.prediction_error !== null) a.err.push(Number(r.prediction_error));
    if (r.brier_score !== null) a.brier.push(Number(r.brier_score));
    buckets.set(key, a);
  };

  for (const r of rows) {
    add("OVERALL", "ALL", r);
    add("ASSET", String(r.asset ?? "UNKNOWN"), r);
    add("HORIZON", `${r.horizon_minutes}m`, r);
    add("REGIME", String(r.regime ?? "UNKNOWN"), r);
    const p = r.probability === null ? null : Number(r.probability);
    const band = p === null ? "UNSTATED" : p < 0.55 ? "50-55%" : p < 0.6 ? "55-60%" : p < 0.7 ? "60-70%" : "70%+";
    add("CONFIDENCE", band, r);
  }

  for (const [key, a] of buckets) {
    const [scope, bucket] = key.split("|");
    const avgErr = a.err.length ? a.err.reduce((x, y) => x + y, 0) / a.err.length : null;
    const brier = a.brier.length ? a.brier.reduce((x, y) => x + y, 0) / a.brier.length : null;
    await db.from("research_calibration").upsert(
      {
        scope,
        bucket,
        predictions: a.predictions,
        resolved: a.resolved,
        correct: a.correct,
        avg_error: avgErr,
        brier,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scope,bucket" },
    );
  }

  return { scopes: buckets.size, resolved: rows.length };
}
