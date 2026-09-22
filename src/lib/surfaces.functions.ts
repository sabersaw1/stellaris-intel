/**
 * Server functions behind the redesigned STELLARIS surfaces.
 *
 * Every read goes to the operator's OWN Supabase project through the
 * service-role client (server-only). Lovable Cloud is not used anywhere.
 * Nothing is invented: when a table is empty the surface says so, and when a
 * capability needs a credential the surface names the credential.
 */

import { createServerFn } from "@tanstack/react-start";

export type Availability = {
  /** Supabase credentials present on the server. */
  persistence: boolean;
  /** Provider credentials that this surface depends on. */
  needs: { credential: string; present: boolean; unlocks: string }[];
  note: string | null;
  checkedAt: number;
};

export type TraderRow = {
  id: string;
  name: string;
  origin: string;
  confidence: string;
  monitored: boolean;
  accounts: number;
  wallets: number;
  updatedAt: string | null;
};

export type WalletRow = {
  id: string;
  chainId: string;
  address: string;
  label: string | null;
  attribution: string;
  monitored: boolean;
  events: number;
  lastSeenAt: string | null;
};

export type NarrativeRow = {
  id: string;
  label: string;
  state: string;
  description: string | null;
  events: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type PaperRow = {
  id: string;
  symbol: string | null;
  side: string | null;
  sizeUsd: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  openedAt: string | null;
  closedAt: string | null;
  pnl: number | null;
};

export type LearningRow = {
  id: string;
  kind: string;
  subject: string | null;
  horizon: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  outcome: string | null;
};

const env = (k: string) => Boolean(process.env[k]);

function needs(list: [string, string][]) {
  return list.map(([credential, unlocks]) => ({ credential, present: env(credential), unlocks }));
}

async function admin() {
  const { getAdmin } = await import("./supabase/admin.server");
  return getAdmin();
}

/** Small helper: select rows, returning [] with a note when the table is absent. */
async function rows<T>(
  client: NonNullable<Awaited<ReturnType<typeof admin>>>,
  table: string,
  columns: string,
  order: { column: string; asc?: boolean } | null,
  limit: number,
): Promise<{ data: T[]; error: string | null }> {
  let q = client.from(table).select(columns).limit(limit);
  if (order) q = q.order(order.column, { ascending: order.asc ?? false });
  const res = await q;
  if (res.error) return { data: [], error: res.error.message };
  return { data: (res.data ?? []) as unknown as T[], error: null };
}

/* ----------------------------------------------------------- traders ------ */

export const traderIntel = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ availability: Availability; traders: TraderRow[]; error: string | null }> => {
    const availability: Availability = {
      persistence: false,
      needs: needs([
        ["FOMO_API_KEY", "Trader discovery and reported trader activity"],
        ["STELLARIS_SOLANA_RPC_URL", "On-chain confirmation of trader wallets"],
        ["X_BEARER_TOKEN", "Linking traders to X accounts"],
      ]),
      note: null,
      checkedAt: Date.now(),
    };
    const client = await admin();
    if (!client) return { availability: { ...availability, note: "Supabase is not configured on the server." }, traders: [], error: null };
    availability.persistence = true;

    const t = await rows<{ id: string; display_name: string; origin: string; confidence: string; monitored: boolean; updated_at: string | null }>(
      client,
      "traders",
      "id,display_name,origin,confidence,monitored,updated_at",
      { column: "updated_at" },
      100,
    );
    if (t.error) return { availability, traders: [], error: t.error };

    const acc = await rows<{ trader_id: string }>(client, "trader_accounts", "trader_id", null, 1000);
    const wal = await rows<{ trader_id: string | null }>(client, "wallets", "trader_id", null, 1000);
    const count = (list: { trader_id: string | null }[], id: string) => list.filter((r) => r.trader_id === id).length;

    return {
      availability,
      traders: t.data.map((r) => ({
        id: r.id,
        name: r.display_name,
        origin: r.origin,
        confidence: r.confidence,
        monitored: r.monitored,
        accounts: count(acc.data, r.id),
        wallets: count(wal.data, r.id),
        updatedAt: r.updated_at,
      })),
      error: null,
    };
  },
);

/* ----------------------------------------------------------- wallets ------ */

export const walletIntel = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ availability: Availability; wallets: WalletRow[]; error: string | null }> => {
    const availability: Availability = {
      persistence: false,
      needs: needs([
        ["STELLARIS_SOLANA_RPC_URL", "Holder concentration, mint authority and transfers"],
        ["FOMO_API_KEY", "Reported wallet activity (unverified until confirmed on-chain)"],
      ]),
      note: null,
      checkedAt: Date.now(),
    };
    const client = await admin();
    if (!client) return { availability: { ...availability, note: "Supabase is not configured on the server." }, wallets: [], error: null };
    availability.persistence = true;

    const w = await rows<{
      id: string;
      chain_id: string;
      address: string;
      label: string | null;
      attribution: string;
      monitored: boolean;
      last_seen_at: string | null;
    }>(client, "wallets", "id,chain_id,address,label,attribution,monitored,last_seen_at", { column: "last_seen_at" }, 100);
    if (w.error) return { availability, wallets: [], error: w.error };

    const ev = await rows<{ wallet_id: string }>(client, "wallet_events", "wallet_id", null, 2000);
    return {
      availability,
      wallets: w.data.map((r) => ({
        id: r.id,
        chainId: r.chain_id,
        address: r.address,
        label: r.label,
        attribution: r.attribution,
        monitored: r.monitored,
        events: ev.data.filter((e) => e.wallet_id === r.id).length,
        lastSeenAt: r.last_seen_at,
      })),
      error: null,
    };
  },
);

/* --------------------------------------------------------- narratives ----- */

export const narrativeIntel = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ availability: Availability; narratives: NarrativeRow[]; posts: number | null; error: string | null }> => {
    const availability: Availability = {
      persistence: false,
      needs: needs([["X_BEARER_TOKEN", "Social mentions used to detect and group narratives"]]),
      note: null,
      checkedAt: Date.now(),
    };
    const client = await admin();
    if (!client) return { availability: { ...availability, note: "Supabase is not configured on the server." }, narratives: [], posts: null, error: null };
    availability.persistence = true;

    const n = await rows<{ id: string; label: string; state: string; description: string | null; first_seen_at: string | null; last_seen_at: string | null }>(
      client,
      "narratives",
      "id,label,state,description,first_seen_at,last_seen_at",
      { column: "last_seen_at" },
      60,
    );
    if (n.error) return { availability, narratives: [], posts: null, error: n.error };
    const ne = await rows<{ narrative_id: string }>(client, "narrative_events", "narrative_id", null, 2000);
    const posts = await client.from("x_posts").select("id", { count: "exact", head: true });

    return {
      availability,
      narratives: n.data.map((r) => ({
        id: r.id,
        label: r.label,
        state: r.state,
        description: r.description,
        events: ne.data.filter((e) => e.narrative_id === r.id).length,
        firstSeenAt: r.first_seen_at,
        lastSeenAt: r.last_seen_at,
      })),
      posts: posts.error ? null : (posts.count ?? 0),
      error: null,
    };
  },
);

/* ------------------------------------------------------- paper trading ---- */

export const paperIntel = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    availability: Availability;
    liveTradingEnabled: false;
    positions: PaperRow[];
    journal: PaperRow[];
    proposals: number | null;
    error: string | null;
  }> => {
    const availability: Availability = { persistence: false, needs: [], note: null, checkedAt: Date.now() };
    const client = await admin();
    if (!client)
      return {
        availability: { ...availability, note: "Supabase is not configured on the server." },
        liveTradingEnabled: false,
        positions: [],
        journal: [],
        proposals: null,
        error: null,
      };
    availability.persistence = true;

    const p = await rows<{
      id: string;
      symbol: string | null;
      side: string | null;
      size_usd: number | null;
      entry_price: number | null;
      exit_price: number | null;
      opened_at: string | null;
      closed_at: string | null;
      realized_pnl: number | null;
    }>(client, "paper_positions", "*", { column: "opened_at" }, 50);

    const j = await rows<{
      id: string;
      side: string;
      size_usd: number | null;
      entry_price: number | null;
      exit_price: number | null;
      entry_at: string | null;
      exit_at: string | null;
      realized_pnl: number | null;
    }>(client, "user_trades", "id,side,size_usd,entry_price,exit_price,entry_at,exit_at,realized_pnl", { column: "created_at" }, 50);

    const prop = await client.from("trade_proposals").select("id", { count: "exact", head: true });

    return {
      availability,
      liveTradingEnabled: false,
      positions: p.data.map((r) => ({
        id: String(r.id),
        symbol: r.symbol ?? null,
        side: r.side ?? null,
        sizeUsd: r.size_usd ?? null,
        entryPrice: r.entry_price ?? null,
        exitPrice: r.exit_price ?? null,
        openedAt: r.opened_at ?? null,
        closedAt: r.closed_at ?? null,
        pnl: r.realized_pnl ?? null,
      })),
      journal: j.data.map((r) => ({
        id: String(r.id),
        symbol: null,
        side: r.side,
        sizeUsd: r.size_usd,
        entryPrice: r.entry_price,
        exitPrice: r.exit_price,
        openedAt: r.entry_at,
        closedAt: r.exit_at,
        pnl: r.realized_pnl,
      })),
      proposals: prop.error ? null : (prop.count ?? 0),
      error: p.error ?? j.error,
    };
  },
);

/* ------------------------------------------------------------ learning ---- */

export const learningIntel = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    availability: Availability;
    predictions: LearningRow[];
    resolved: number;
    open: number;
    strategies: number | null;
    regimes: number | null;
    error: string | null;
  }> => {
    const availability: Availability = { persistence: false, needs: [], note: null, checkedAt: Date.now() };
    const client = await admin();
    if (!client)
      return {
        availability: { ...availability, note: "Supabase is not configured on the server." },
        predictions: [],
        resolved: 0,
        open: 0,
        strategies: null,
        regimes: null,
        error: null,
      };
    availability.persistence = true;

    const pr = await rows<Record<string, unknown>>(client, "research_predictions", "*", { column: "predicted_at" }, 60);
    const strat = await client.from("strategy_versions").select("id", { count: "exact", head: true });
    const reg = await client.from("market_regimes").select("id", { count: "exact", head: true });

    const list: LearningRow[] = pr.data.map((r) => ({
      id: String(r["id"] ?? ""),
      kind: String(r["direction"] ?? r["kind"] ?? "PREDICTION"),
      subject: (r["symbol"] as string | null) ?? null,
      horizon: r["horizon_minutes"] === undefined ? null : `${String(r["horizon_minutes"])} MIN`,
      createdAt: (r["predicted_at"] as string | null) ?? null,
      resolvedAt: (r["resolved_at"] as string | null) ?? null,
      outcome: (r["outcome"] as string | null) ?? null,
    }));

    return {
      availability,
      predictions: list,
      resolved: list.filter((r) => r.resolvedAt).length,
      open: list.filter((r) => !r.resolvedAt).length,
      strategies: strat.error ? null : (strat.count ?? 0),
      regimes: reg.error ? null : (reg.count ?? 0),
      error: pr.error,
    };
  },
);

/* ------------------------------------------------------------ settings --- */

export type SettingsReport = {
  supabase: { configured: boolean; projectHost: string | null };
  schema: { table: string; present: boolean; migration: string }[];
  settings: { key: string; value: string }[];
  liveTradingEnabled: false;
  agentApiConfigured: boolean;
  checkedAt: number;
};

export const settingsReport = createServerFn({ method: "GET" }).handler(async (): Promise<SettingsReport> => {
  const url = process.env["STELLARIS_SUPABASE_URL"] ?? null;
  const base: SettingsReport = {
    supabase: { configured: false, projectHost: url ? new URL(url).host : null },
    schema: [],
    settings: [],
    liveTradingEnabled: false,
    agentApiConfigured: env("STELLARIS_AGENT_TOKEN"),
    checkedAt: Date.now(),
  };
  const client = await admin();
  if (!client) return base;
  base.supabase.configured = true;

  const checks: [string, string][] = [
    ["tokens", "0007"],
    ["token_snapshots", "0007"],
    ["stellaris_events", "0007"],
    ["stellaris_alerts", "0007"],
    ["traders", "0007"],
    ["wallets", "0007"],
    ["narratives", "0007"],
    ["research_candidates", "0007"],
    ["watchlist_items", "0007"],
    ["user_trades", "0007"],
    ["provider_connections", "0007"],
    ["audit_log", "0007"],
    ["system_settings", "0007"],
    ["research_predictions", "0006"],
    ["paper_positions", "0006"],
    ["strategy_versions", "0006"],
    ["dossiers", "0008"],
  ];
  for (const [table, migration] of checks) {
    const res = await client.from(table).select("*").limit(1);
    base.schema.push({ table, migration, present: !res.error });
  }

  const s = await rows<{ key: string; value: unknown }>(client, "system_settings", "key,value", null, 50);
  base.settings = s.data.map((r) => ({ key: r.key, value: typeof r.value === "string" ? r.value : JSON.stringify(r.value) }));
  return base;
});
