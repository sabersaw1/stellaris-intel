/**
 * THE LIVE LAYER.
 *
 * Market data → ingestion → your Supabase project → Realtime events → UI.
 *
 * The five-minute pg_cron job is a background maintenance and catch-up cycle
 * only. It never gates the interface: the market snapshot polls the source as
 * often as its rate limits allow, and every database write arrives here as a
 * Realtime event which refreshes the affected queries immediately.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { liveMeta, publicBackendConfig, pulseIngest } from "@/lib/backend.functions";
import { marketQuery } from "@/hooks/useMarket";
import {
  onRealtimeChange,
  realtimeSnapshot,
  startRealtime,
  subscribeRealtimeStatus,
  type RealtimeSnapshot,
} from "@/lib/supabase/realtime";

/** Which query keys a change to a given table should refresh. */
const TABLE_QUERIES: Record<string, string[][]> = {
  markets: [["memory"], ["live", "meta"]],
  market_observations: [["memory"], ["live", "meta"]],
  investigations: [["memory", "investigations"], ["live", "meta"]],
  evidence: [["memory", "investigations"]],
  change_events: [["memory", "changes"], ["live", "meta"]],
  alert_events: [["memory", "alerts"]],
  watchlist: [["memory", "watchlist"]],
  research_notes: [["memory", "notes"]],
  unknown_questions: [["memory", "investigations"]],
  conflicts: [["memory", "investigations"]],
  challenger_reviews: [["memory", "investigations"]],
  outcomes: [["memory", "calibration"]],
  calibration: [["memory", "calibration"]],
  source_health: [["live", "meta"], ["system", "health"]],
  system_jobs: [["live", "meta"], ["backend"]],
};

/**
 * Opens the Realtime connection once per tab and wires received changes to
 * query invalidations. Mount it high in the tree (the shell does this).
 */
export function useLiveWiring(): RealtimeSnapshot {
  const qc = useQueryClient();
  const [snap, setSnap] = useState<RealtimeSnapshot>(() => realtimeSnapshot());
  const cfg = useQuery({
    queryKey: ["live", "config"],
    queryFn: () => publicBackendConfig(),
    staleTime: 10 * 60_000,
  });

  useEffect(() => subscribeRealtimeStatus(() => setSnap(realtimeSnapshot())), []);

  useEffect(() => {
    if (!cfg.data) return;
    void startRealtime(cfg.data);
  }, [cfg.data]);

  useEffect(
    () =>
      onRealtimeChange((table) => {
        const keys = TABLE_QUERIES[table] ?? [["memory"]];
        // Record-level refresh: only the queries affected by this table.
        for (const key of keys) void qc.invalidateQueries({ queryKey: key });
      }),
    [qc],
  );

  // EVENT-DRIVEN INGESTION: each fresh market snapshot is stored right away, so
  // the database — and every open surface, through Realtime — reflects new
  // information within seconds. The server throttles this, so extra tabs do not
  // multiply source requests, and the background cycle keeps running with no
  // browser open at all.
  const snapshot = useQuery(marketQuery);
  const pulsedFor = useRef(0);
  useEffect(() => {
    const stamp = snapshot.dataUpdatedAt;
    if (!stamp || stamp === pulsedFor.current || snapshot.isError) return;
    pulsedFor.current = stamp;
    void pulseIngest().catch(() => {
      // A failed store must never disturb the interface; the status line and
      // SYSTEM surface report database state on their own.
    });
  }, [snapshot.dataUpdatedAt, snapshot.isError]);

  return snap;
}

/** Read-only access to the live connection state from any component. */
export function useRealtimeStatus(): RealtimeSnapshot {
  const [snap, setSnap] = useState<RealtimeSnapshot>(() => realtimeSnapshot());
  useEffect(() => subscribeRealtimeStatus(() => setSnap(realtimeSnapshot())), []);
  return snap;
}

/**
 * Freshness metadata straight from the database. Polled on a short interval as
 * a safety net; Realtime events invalidate it the instant anything is written.
 */
export function useLiveMeta() {
  return useQuery({
    queryKey: ["live", "meta"],
    queryFn: () => liveMeta(),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
