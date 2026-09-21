/**
 * Browser-side Supabase client used ONLY for Realtime database events.
 *
 * The publishable (anon) key is safe in the browser; it is fetched at runtime
 * from a server function so no key is baked into the bundle and no secret is
 * ever shipped. Reads and writes still go through server functions, which use
 * the service role key server-side. This client exists purely to learn *when*
 * the database changed so the interface can update immediately instead of
 * waiting for the five-minute maintenance cycle.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export type RealtimeState = "IDLE" | "CONNECTING" | "CONNECTED" | "NOT CONFIGURED" | "ERROR";

export type RealtimeSnapshot = {
  state: RealtimeState;
  detail: string;
  /** Last time any watched table emitted a change. */
  lastEventAt: number | null;
  /** Per-table timestamp of the last received change. */
  lastByTable: Record<string, number>;
  events: number;
};

/** Tables whose changes should immediately refresh the interface. */
export const REALTIME_TABLES = [
  "markets",
  "market_observations",
  "investigations",
  "evidence",
  "change_events",
  "alert_events",
  "watchlist",
  "research_notes",
  "unknown_questions",
  "conflicts",
  "challenger_reviews",
  "outcomes",
  "calibration",
  "source_health",
  "system_jobs",
] as const;

let snapshot: RealtimeSnapshot = {
  state: "IDLE",
  detail: "Realtime has not been started in this tab yet.",
  lastEventAt: null,
  lastByTable: {},
  events: 0,
};

const listeners = new Set<() => void>();
const tableListeners = new Set<(table: string) => void>();

function publish(next: Partial<RealtimeSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function realtimeSnapshot(): RealtimeSnapshot {
  return snapshot;
}

export function subscribeRealtimeStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called with the table name for every received change event. */
export function onRealtimeChange(fn: (table: string) => void): () => void {
  tableListeners.add(fn);
  return () => tableListeners.delete(fn);
}

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let starting = false;

/**
 * Starts the single shared Realtime subscription. Safe to call repeatedly;
 * only the first call connects.
 */
export async function startRealtime(config: { url: string | null; publishableKey: string | null }): Promise<void> {
  if (typeof window === "undefined" || channel || starting) return;

  // PRIVACY DECISION: research and market tables are private (no anonymous or
  // authenticated read access). Browser Realtime therefore cannot receive their
  // change events, and attempting it would only show a misleading state. The
  // interface refreshes through fast server-side revalidation instead.
  if (!REALTIME_ENABLED) {
    publish({
      state: "NOT CONFIGURED",
      detail:
        "Direct database streaming is intentionally off: research tables are private, so the browser has no read access. Live data comes from fast server-side revalidation (10-15s).",
    });
    return;
  }

  if (!config.url || !config.publishableKey) {
    publish({
      state: "NOT CONFIGURED",
      detail: "No Supabase project URL or publishable key is available, so live database events cannot be received.",
    });
    return;
  }


  starting = true;
  publish({ state: "CONNECTING", detail: "Opening a live connection to your Supabase project." });

  try {
    client ??= createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });

    const ch = client.channel("stellaris-live");
    for (const table of REALTIME_TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        publish({
          lastEventAt: Date.now(),
          lastByTable: { ...snapshot.lastByTable, [table]: Date.now() },
          events: snapshot.events + 1,
        });
        tableListeners.forEach((l) => l(table));
      });
    }

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        publish({ state: "CONNECTED", detail: "Receiving database changes as they happen." });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        publish({
          state: "ERROR",
          detail:
            "The live connection could not be established. Realtime may not be enabled for these tables in your Supabase project — the interface falls back to short-interval polling.",
        });
      } else if (status === "CLOSED") {
        publish({ state: "IDLE", detail: "The live connection closed; polling continues." });
      }
    });

    channel = ch;
  } catch (e) {
    publish({ state: "ERROR", detail: e instanceof Error ? e.message : "Live connection failed." });
  } finally {
    starting = false;
  }
}
