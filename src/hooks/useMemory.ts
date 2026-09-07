/**
 * READS FROM PERSISTENT MEMORY (the operator's own Supabase project).
 *
 * Each hook returns `configured` so a surface can say "memory unavailable"
 * instead of implying persistence that does not exist. Writes happen through
 * `src/lib/local-store.ts`, which mirrors every change into Supabase.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  memAlerts,
  memCalibration,
  memChanges,
  memInvestigations,
  memNotes,
  memPresets,
  memSearch,
  memSeries,
  memWatchlist,
} from "@/lib/memory.functions";
import { subscribeStore } from "@/lib/local-store";

const LIVE = { staleTime: 15_000, refetchInterval: 30_000 } as const;

/** Refetches memory queries whenever a local write happens (so it mirrors fast). */
export function useMemorySync() {
  const qc = useQueryClient();
  useEffect(
    () =>
      subscribeStore(() => {
        window.setTimeout(() => void qc.invalidateQueries({ queryKey: ["memory"] }), 600);
      }),
    [qc],
  );
}

export function useStoredWatchlist() {
  useMemorySync();
  return useQuery({ queryKey: ["memory", "watchlist"], queryFn: () => memWatchlist(), ...LIVE });
}

export function useStoredAlerts() {
  useMemorySync();
  return useQuery({ queryKey: ["memory", "alerts"], queryFn: () => memAlerts(), ...LIVE });
}

export function useStoredInvestigations() {
  return useQuery({ queryKey: ["memory", "investigations"], queryFn: () => memInvestigations(), ...LIVE });
}

export function useStoredNotes() {
  useMemorySync();
  return useQuery({ queryKey: ["memory", "notes"], queryFn: () => memNotes(), ...LIVE });
}

export function useStoredPresets() {
  useMemorySync();
  return useQuery({ queryKey: ["memory", "presets"], queryFn: () => memPresets(), ...LIVE });
}

export function useStoredChanges() {
  return useQuery({ queryKey: ["memory", "changes"], queryFn: () => memChanges(), ...LIVE });
}

export function useCalibrationMemory() {
  return useQuery({ queryKey: ["memory", "calibration"], queryFn: () => memCalibration(), ...LIVE });
}

export function useMemorySearch(q: string) {
  return useQuery({
    queryKey: ["memory", "search", q],
    queryFn: () => memSearch({ data: { q } }),
    staleTime: 20_000,
  });
}

export function useStoredSeries(chainId: string, pairAddress: string) {
  return useQuery({
    queryKey: ["memory", "series", chainId, pairAddress],
    queryFn: () => memSeries({ data: { chainId, pairAddress } }),
    ...LIVE,
  });
}
