/**
 * Server functions for the research engine, signals, paper trading, risk and
 * provider configuration. Client-safe module: every server-only import happens
 * inside a handler, so no key can reach the browser bundle.
 */

import { createServerFn } from "@tanstack/react-start";

export type CalibrationRow = {
  scope: string;
  bucket: string;
  predictions: number;
  resolved: number;
  correct: number;
  accuracyPct: number | null;
  avgError: number | null;
  brier: number | null;
  updatedAt: number;
};

export type EngineState = {
  configured: boolean;
  migrated: boolean;
  error: string | null;
  minResolved: number;
  universe: string[];
  counts: { predictions: number; open: number; resolved: number; unresolvable: number };
  openPredictions: {
    asset: string;
    strategy: string;
    version: string;
    direction: string;
    probability: number | null;
    horizon: number;
    regime: string;
    referencePrice: number | null;
    predictedAt: number;
    resolveAt: number;
  }[];
  resolvedPredictions: {
    asset: string;
    strategy: string;
    direction: string;
    probability: number | null;
    actualReturn: number | null;
    outcome: string | null;
    error: number | null;
    resolvedAt: number;
  }[];
  calibration: CalibrationRow[];
  signals: {
    asset: string;
    direction: string;
    strategy: string;
    version: string;
    confidence: number | null;
    regime: string | null;
    riskVerdict: string | null;
    riskReason: string | null;
    createdAt: number;
    expiresAt: number | null;
    state: string;
  }[];
  paper: {
    open: { asset: string; side: string; quantity: number; entryPrice: number; openedAt: number; strategy: string | null }[];
    closedCount: number;
    realizedPnl: number | null;
    equity: number | null;
    exposure: number | null;
    drawdownPct: number | null;
  };
  strategies: { name: string; version: string; status: string; timeframe: string | null; description: string | null }[];
  regimes: { asset: string; regime: string; basis: string | null; determinedAt: number }[];
  risk: Record<string, number | boolean> | null;
  mode: { mode: string; note: string | null; approvedAt: number | null };
  checkedAt: number;
};

const EMPTY: EngineState = {
  configured: false,
  migrated: false,
  error: null,
  minResolved: 20,
  universe: [],
  counts: { predictions: 0, open: 0, resolved: 0, unresolvable: 0 },
  openPredictions: [],
  resolvedPredictions: [],
  calibration: [],
  signals: [],
  paper: { open: [], closedCount: 0, realizedPnl: null, equity: null, exposure: null, drawdownPct: null },
  strategies: [],
  regimes: [],
  risk: null,
  mode: { mode: "RESEARCH ONLY", note: "Live trading is disabled.", approvedAt: null },
  checkedAt: 0,
};

const ts = (v: unknown): number => (typeof v === "string" ? new Date(v).getTime() : 0);

export const engineState = createServerFn({ method: "GET" }).handler(async (): Promise<EngineState> => {
  const { getAdmin } = await import("./supabase/admin.server");
  const { MIN_RESOLVED } = await import("./research/engine.server");
  const { universeSymbols } = await import("./research/universe");
  const db = getAdmin();
  if (!db) return { ...EMPTY, minResolved: MIN_RESOLVED, checkedAt: Date.now() };

  const probe = await db.from("research_predictions").select("id").limit(1);
  if (probe.error) {
    return {
      ...EMPTY,
      configured: true,
      migrated: false,
      error: /schema cache|does not exist|PGRST205/i.test(probe.error.message)
        ? "Migration 0006 has not been applied yet — the research engine tables are missing."
        : probe.error.message,
      minResolved: MIN_RESOLVED,
      universe: universeSymbols(null),
      checkedAt: Date.now(),
    };
  }

  const [uni, total, open, resolved, unresolvable, openRows, resolvedRows, cal, sigs, paperOpen, paperClosed, equity, strategies, regimes, risk, mode] =
    await Promise.all([
      db.from("asset_universe").select("symbol, enabled").eq("enabled", true),
      db.from("research_predictions").select("*", { count: "exact", head: true }),
      db.from("research_predictions").select("*", { count: "exact", head: true }).is("resolved_at", null),
      db.from("research_predictions").select("*", { count: "exact", head: true }).not("resolved_at", "is", null).neq("direction_outcome", "UNRESOLVABLE"),
      db.from("research_predictions").select("*", { count: "exact", head: true }).eq("direction_outcome", "UNRESOLVABLE"),
      db
        .from("research_predictions")
        .select("asset, strategy_name, strategy_version, predicted_direction, probability, horizon_minutes, regime, reference_price, predicted_at, resolve_at")
        .is("resolved_at", null)
        .order("predicted_at", { ascending: false })
        .limit(40),
      db
        .from("research_predictions")
        .select("asset, strategy_name, predicted_direction, probability, actual_return, direction_outcome, prediction_error, resolved_at")
        .not("resolved_at", "is", null)
        .order("resolved_at", { ascending: false })
        .limit(40),
      db.from("research_calibration").select("*").order("scope").limit(200),
      db
        .from("signals")
        .select("asset, direction, strategy_name, strategy_version, confidence, regime, risk_verdict, risk_reason, created_at, expires_at, state")
        .order("created_at", { ascending: false })
        .limit(40),
      db.from("paper_positions").select("asset, side, quantity, entry_price, opened_at, strategy_name").eq("state", "OPEN").limit(50),
      db.from("paper_positions").select("realized_pnl").eq("state", "CLOSED").limit(2000),
      db.from("paper_equity").select("equity, exposure, recorded_at").order("recorded_at", { ascending: false }).limit(100),
      db.from("strategy_versions").select("name, version, status, timeframe, description").order("name").limit(50),
      db.from("market_regimes").select("regime, basis, determined_at, markets ( base_symbol )").order("determined_at", { ascending: false }).limit(30),
      db.from("risk_limits").select("*").eq("id", "default").maybeSingle(),
      db.from("trading_mode").select("mode, note, approved_at").eq("id", "default").maybeSingle(),
    ]);

  const equities = (equity.data ?? []).map((r) => Number(r.equity ?? 0)).reverse();
  let peak = 0;
  let dd = 0;
  for (const v of equities) {
    peak = Math.max(peak, v);
    if (peak > 0) dd = Math.max(dd, ((peak - v) / peak) * 100);
  }
  const realized = (paperClosed.data ?? []).reduce((a, r) => a + Number(r.realized_pnl ?? 0), 0);

  const riskRow = risk.data as Record<string, unknown> | null;

  return {
    configured: true,
    migrated: true,
    error: null,
    minResolved: MIN_RESOLVED,
    universe: (uni.data ?? []).map((r) => String(r.symbol)).length
      ? (uni.data ?? []).map((r) => String(r.symbol))
      : universeSymbols(null),
    counts: {
      predictions: total.count ?? 0,
      open: open.count ?? 0,
      resolved: resolved.count ?? 0,
      unresolvable: unresolvable.count ?? 0,
    },
    openPredictions: (openRows.data ?? []).map((r) => ({
      asset: String(r.asset),
      strategy: String(r.strategy_name),
      version: String(r.strategy_version),
      direction: String(r.predicted_direction),
      probability: r.probability === null ? null : Number(r.probability),
      horizon: Number(r.horizon_minutes),
      regime: String(r.regime ?? "UNKNOWN"),
      referencePrice: r.reference_price === null ? null : Number(r.reference_price),
      predictedAt: ts(r.predicted_at),
      resolveAt: ts(r.resolve_at),
    })),
    resolvedPredictions: (resolvedRows.data ?? []).map((r) => ({
      asset: String(r.asset),
      strategy: String(r.strategy_name),
      direction: String(r.predicted_direction),
      probability: r.probability === null ? null : Number(r.probability),
      actualReturn: r.actual_return === null ? null : Number(r.actual_return),
      outcome: (r.direction_outcome as string | null) ?? null,
      error: r.prediction_error === null ? null : Number(r.prediction_error),
      resolvedAt: ts(r.resolved_at),
    })),
    calibration: (cal.data ?? []).map((r) => {
      const res = Number(r.resolved ?? 0);
      const correct = Number(r.correct ?? 0);
      return {
        scope: String(r.scope),
        bucket: String(r.bucket),
        predictions: Number(r.predictions ?? 0),
        resolved: res,
        correct,
        accuracyPct: res >= 20 ? Math.round((correct / res) * 1000) / 10 : null,
        avgError: r.avg_error === null ? null : Number(r.avg_error),
        brier: r.brier === null ? null : Number(r.brier),
        updatedAt: ts(r.updated_at),
      };
    }),
    signals: (sigs.data ?? []).map((r) => ({
      asset: String(r.asset),
      direction: String(r.direction),
      strategy: String(r.strategy_name),
      version: String(r.strategy_version),
      confidence: r.confidence === null ? null : Number(r.confidence),
      regime: (r.regime as string | null) ?? null,
      riskVerdict: (r.risk_verdict as string | null) ?? null,
      riskReason: (r.risk_reason as string | null) ?? null,
      createdAt: ts(r.created_at),
      expiresAt: r.expires_at ? ts(r.expires_at) : null,
      state: String(r.state),
    })),
    paper: {
      open: (paperOpen.data ?? []).map((r) => ({
        asset: String(r.asset),
        side: String(r.side),
        quantity: Number(r.quantity),
        entryPrice: Number(r.entry_price),
        openedAt: ts(r.opened_at),
        strategy: (r.strategy_name as string | null) ?? null,
      })),
      closedCount: (paperClosed.data ?? []).length,
      realizedPnl: (paperClosed.data ?? []).length ? Math.round(realized * 100) / 100 : null,
      equity: equities.length ? Math.round(equities.at(-1)! * 100) / 100 : null,
      exposure: (equity.data ?? []).length ? Number((equity.data ?? [])[0]?.exposure ?? 0) : null,
      drawdownPct: equities.length ? Math.round(dd * 10) / 10 : null,
    },
    strategies: (strategies.data ?? []).map((r) => ({
      name: String(r.name),
      version: String(r.version),
      status: String(r.status),
      timeframe: (r.timeframe as string | null) ?? null,
      description: (r.description as string | null) ?? null,
    })),
    regimes: (regimes.data ?? []).map((r) => {
      const m = r.markets as unknown as { base_symbol: string | null } | null;
      return {
        asset: m?.base_symbol ?? "?",
        regime: String(r.regime),
        basis: (r.basis as string | null) ?? null,
        determinedAt: ts(r.determined_at),
      };
    }),
    risk: riskRow
      ? {
          maxPositionUsd: Number(riskRow["max_position_usd"] ?? 0),
          maxPortfolioExposure: Number(riskRow["max_portfolio_exposure"] ?? 0),
          maxAssetExposure: Number(riskRow["max_asset_exposure"] ?? 0),
          maxDailyLoss: Number(riskRow["max_daily_loss"] ?? 0),
          maxDrawdownPct: Number(riskRow["max_drawdown_pct"] ?? 0),
          maxOpenPositions: Number(riskRow["max_open_positions"] ?? 0),
          maxVolatilityPct: Number(riskRow["max_volatility_pct"] ?? 0),
          minLiquidityUsd: Number(riskRow["min_liquidity_usd"] ?? 0),
          emergencyStop: Boolean(riskRow["emergency_stop"]),
        }
      : null,
    mode: {
      mode: (mode.data?.mode as string | undefined) ?? "RESEARCH ONLY",
      note: (mode.data?.note as string | undefined) ?? null,
      approvedAt: mode.data?.approved_at ? ts(mode.data.approved_at) : null,
    },
    checkedAt: Date.now(),
  };
});

/** Runs one research cycle now (features -> regime -> prediction -> resolution -> calibration). */
export const runResearchCycleNow = createServerFn({ method: "POST" }).handler(async () => {
  const { getAdmin } = await import("./supabase/admin.server");
  const { runResearchCycle } = await import("./research/engine.server");
  const db = getAdmin();
  if (!db) {
    return {
      configured: false,
      assetsConsidered: 0,
      marketsAnalysed: 0,
      regimesStored: 0,
      predictionsStored: 0,
      predictionsResolved: 0,
      signalsStored: 0,
      paperOpened: 0,
      paperClosed: 0,
      skipped: [],
      errors: ["Supabase is not configured."],
      durationMs: 0,
    };
  }
  return runResearchCycle(db);
});

/** Emergency stop / trading mode control. Live trading is never enabled here. */
export const setTradingMode = createServerFn({ method: "POST" })
  .inputValidator((input: { mode: string; note?: string | undefined }) => input)
  .handler(async ({ data }): Promise<{ ok: boolean; mode: string; error: string | null }> => {
    const allowed = ["RESEARCH ONLY", "PAPER TRADING", "READY FOR APPROVAL", "LIVE DISABLED", "EMERGENCY STOP"];
    if (!allowed.includes(data.mode)) {
      return { ok: false, mode: data.mode, error: "APPROVED FOR LIVE can only be set by an explicit human approval flow, not from this control." };
    }
    const { getAdmin } = await import("./supabase/admin.server");
    const db = getAdmin();
    if (!db) return { ok: false, mode: data.mode, error: "Supabase is not configured." };
    const { error } = await db
      .from("trading_mode")
      .upsert({ id: "default", mode: data.mode, note: data.note ?? null, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (data.mode === "EMERGENCY STOP") await db.from("risk_limits").update({ emergency_stop: true }).eq("id", "default");
    if (data.mode === "PAPER TRADING" || data.mode === "RESEARCH ONLY")
      await db.from("risk_limits").update({ emergency_stop: false }).eq("id", "default");
    return { ok: !error, mode: data.mode, error: error?.message ?? null };
  });

/* ------------------------------------------------------------- providers --- */

export type ProviderInfo = {
  id: string;
  name: string;
  purpose: string;
  credential: string;
  whereToGet: string;
  pricing: "FREE" | "FREE TIER" | "PAID" | "YOUR OWN PROJECT";
  required: boolean;
  status: "CONNECTED" | "AVAILABLE" | "NOT CONFIGURED" | "DEGRADED";
  lastOkAt: number | null;
  error: string | null;
  detail: string;
};

export const providerStatus = createServerFn({ method: "GET" }).handler(async (): Promise<ProviderInfo[]> => {
  const { backendConfig, getAdmin } = await import("./supabase/admin.server");
  const { gmgnConfigured } = await import("./sources/gmgn.server");
  const { fomoConfigured } = await import("./sources/fomo.server");
  const cfg = backendConfig();
  const db = getAdmin();

  const health = new Map<string, { state: string; lastOkAt: number | null; detail: string | null }>();
  if (db) {
    const r = await db.from("source_health").select("source, state, last_ok_at, detail").limit(30);
    for (const row of r.data ?? [])
      health.set(String(row.source), {
        state: String(row.state),
        lastOkAt: row.last_ok_at ? new Date(row.last_ok_at as string).getTime() : null,
        detail: (row.detail as string | null) ?? null,
      });
  }

  const h = (id: string) => health.get(id) ?? null;

  return [
    {
      id: "dexscreener",
      name: "DEX SCREENER",
      purpose: "Live market prices, liquidity, volume and transaction counts — the primary market data feed.",
      credential: "None. The public API is used without a key.",
      whereToGet: "https://docs.dexscreener.com/api/reference",
      pricing: "FREE",
      required: true,
      status: h("dexscreener")?.state === "DEGRADED" ? "DEGRADED" : "CONNECTED",
      lastOkAt: h("dexscreener")?.lastOkAt ?? null,
      error: h("dexscreener")?.state === "DEGRADED" ? (h("dexscreener")?.detail ?? null) : null,
      detail: "Rate-limit aware: cached, de-duplicated requests with retries and backoff.",
    },
    {
      id: "supabase",
      name: "SUPABASE (YOUR PROJECT)",
      purpose: "Persistent memory: markets, observations, features, regimes, predictions, outcomes, calibration, signals, paper trading.",
      credential: "Project URL, publishable key, service-role key, and a worker secret for scheduled processing.",
      whereToGet: "Supabase dashboard -> Project Settings -> API (URL and keys). The worker secret is a strong random string you create.",
      pricing: "YOUR OWN PROJECT",
      required: true,
      status: cfg.urlPresent && cfg.serviceKeyPresent ? (h("supabase")?.state === "DEGRADED" ? "DEGRADED" : "CONNECTED") : "NOT CONFIGURED",
      lastOkAt: h("supabase")?.lastOkAt ?? null,
      error: h("supabase")?.state === "DEGRADED" ? (h("supabase")?.detail ?? null) : null,
      detail: "Service-role key is used server-side only and never reaches the browser. Tables are private (RLS, no anonymous access).",
    },
    {
      id: "gmgn",
      name: "GMGN",
      purpose: "Holder distribution and developer/project history as read-only research evidence.",
      credential: "GMGN_API_KEY",
      whereToGet: "GMGN account -> API access. Ask GMGN for a read-only key; this system never signs transactions.",
      pricing: "PAID",
      required: false,
      status: gmgnConfigured() ? "AVAILABLE" : "NOT CONFIGURED",
      lastOkAt: h("gmgn")?.lastOkAt ?? null,
      error: h("gmgn")?.detail ?? null,
      detail: "Adapter is built and idle. It contributes no evidence and no cost until a key is provided.",
    },
    {
      id: "fomo",
      name: "FOMO",
      purpose: "Contract and security checks as read-only research evidence.",
      credential: "FOMO_API_KEY",
      whereToGet: "FOMO provider dashboard -> API keys.",
      pricing: "PAID",
      required: false,
      status: fomoConfigured() ? "AVAILABLE" : "NOT CONFIGURED",
      lastOkAt: h("fomo")?.lastOkAt ?? null,
      error: h("fomo")?.detail ?? null,
      detail: "Adapter is built and idle. It contributes no evidence and no cost until a key is provided.",
    },
    {
      id: "derivatives",
      name: "DERIVATIVES VENUE (FUNDING / OPEN INTEREST)",
      purpose: "Funding rates, open interest, liquidations and order-book depth — currently unavailable features.",
      credential: "Exchange API key (read-only) once you choose a venue.",
      whereToGet: "Not selected yet. No provider is contacted and nothing is billed.",
      pricing: "FREE TIER",
      required: false,
      status: "NOT CONFIGURED",
      lastOkAt: null,
      error: null,
      detail: "Until a venue is connected, funding, open interest, liquidation and order-book features stay UNAVAILABLE rather than estimated.",
    },
  ];
});
