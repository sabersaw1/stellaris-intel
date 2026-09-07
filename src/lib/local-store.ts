/**
 * Browser-local persistence layer.
 *
 * This is deliberately explicit: until Supabase credentials are configured for
 * this project, historical observations, watchlists, notes and alert events are
 * stored in this browser only (LOCAL SESSION STORE). Nothing here is fabricated —
 * every stored point is an observation the app actually received from the API.
 */

import type { Anomaly, PairObservation } from "./dex-types";
import {
  memAcknowledgeAlerts,
  memClearAlerts,
  memDeletePreset,
  memEmitAlert,
  memSavePreset,
  memSetNote,
  memSetWatch,
  memSetWatchGroup,
} from "./memory.functions";

/**
 * SUPABASE IS THE SOURCE OF TRUTH.
 *
 * Everything below still writes to localStorage so the interface stays instant
 * and keeps working when the database is unreachable, but each write is mirrored
 * into the operator's Supabase project through a server function. Reads for the
 * persistent surfaces come from Supabase (see `src/hooks/useMemory.ts`); this
 * file is the fast local cache, not the record.
 */
function mirror(run: () => Promise<unknown>) {
  if (typeof window === "undefined") return;
  void run().catch(() => {
    /* memory unavailable — the UI reports Supabase status on the SYSTEM surface */
  });
}

const K = {
  history: "dmi.history.v1",
  watch: "dmi.watchlist.v1",
  alerts: "dmi.alerts.v1",
  notes: "dmi.notes.v1",
  presets: "dmi.presets.v1",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — observations simply are not retained */
  }
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
export function subscribeStore(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ------------------------------ history ------------------------------- */

export type ObservationPoint = {
  t: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  txns24h: number | null;
  fdv: number | null;
  marketCap: number | null;
  riskScore: number | null;
  confidence: number | null;
  anomalyCount: number;
};

type HistoryMap = Record<string, ObservationPoint[]>;

const MAX_POINTS = 500;

export function recordObservation(
  p: PairObservation,
  extra: { riskScore: number | null; confidence: number | null; anomalies: Anomaly[] },
) {
  const all = read<HistoryMap>(K.history, {});
  const list = all[p.key] ?? [];
  const last = list[list.length - 1];
  const point: ObservationPoint = {
    t: p.observedAt,
    priceUsd: p.priceUsd,
    liquidityUsd: p.liquidityUsd,
    volume24h: p.volume.h24,
    txns24h: p.txns.h24 ? p.txns.h24.buys + p.txns.h24.sells : null,
    fdv: p.fdv,
    marketCap: p.marketCap,
    riskScore: extra.riskScore,
    confidence: extra.confidence,
    anomalyCount: extra.anomalies.length,
  };
  // dedupe: never store the same observation timestamp twice
  if (last && Math.abs(last.t - point.t) < 5_000) return;
  all[p.key] = [...list, point].slice(-MAX_POINTS);
  write(K.history, all);
}

export function getHistory(key: string): ObservationPoint[] {
  return read<HistoryMap>(K.history, {})[key] ?? [];
}

export function historyCounts(): Record<string, number> {
  const all = read<HistoryMap>(K.history, {});
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length]));
}

/* ----------------------------- watchlist ------------------------------ */

export type WatchItem = {
  key: string;
  chainId: string;
  pairAddress: string;
  symbol: string;
  group: string;
  addedAt: number;
};

export function getWatchlist(): WatchItem[] {
  return read<WatchItem[]>(K.watch, []);
}

export function isWatched(key: string) {
  return getWatchlist().some((w) => w.key === key);
}

export function toggleWatch(p: PairObservation, group = "Default") {
  const list = getWatchlist();
  const next = list.some((w) => w.key === p.key)
    ? list.filter((w) => w.key !== p.key)
    : [...list, { key: p.key, chainId: p.chainId, pairAddress: p.pairAddress, symbol: p.baseSymbol, group, addedAt: Date.now() }];
  write(K.watch, next);
  const nowWatched = next.some((w) => w.key === p.key);
  mirror(() =>
    memSetWatch({
      data: {
        chainId: p.chainId,
        pairAddress: p.pairAddress,
        symbol: p.baseSymbol,
        dexId: p.dexId,
        watched: nowWatched,
        group,
      },
    }),
  );
  return nowWatched;
}

export function setWatchGroup(key: string, group: string) {
  const item = getWatchlist().find((w) => w.key === key);
  if (item) mirror(() => memSetWatchGroup({ data: { chainId: item.chainId, pairAddress: item.pairAddress, group } }));
  write(
    K.watch,
    getWatchlist().map((w) => (w.key === key ? { ...w, group } : w)),
  );
}

/* ------------------------------- alerts ------------------------------- */

export type AlertEvent = {
  id: string;
  t: number;
  key: string;
  symbol: string;
  chainId: string;
  dexId: string;
  kind: string;
  severity: "NORMAL" | "NOTABLE" | "UNUSUAL" | "SEVERE";
  message: string;
  confidence: number;
  acknowledged: boolean;
};

const COOLDOWN_MS = 5 * 60_000;

export function getAlerts(): AlertEvent[] {
  return read<AlertEvent[]>(K.alerts, []);
}

/** Deduplicated + cooldown-gated alert emission. */
export function emitAlert(e: Omit<AlertEvent, "id" | "t" | "acknowledged">) {
  const list = getAlerts();
  const dupe = list.find((a) => a.key === e.key && a.kind === e.kind && Date.now() - a.t < COOLDOWN_MS);
  if (dupe) return false;
  const event: AlertEvent = { ...e, id: `${e.key}:${e.kind}:${Date.now()}`, t: Date.now(), acknowledged: false };
  write(K.alerts, [event, ...list].slice(0, 300));
  mirror(() =>
    memEmitAlert({
      data: {
        key: e.key,
        chainId: e.chainId,
        pairAddress: e.key.includes(":") ? e.key.split(":").slice(1).join(":") : undefined,
        symbol: e.symbol,
        dexId: e.dexId,
        kind: e.kind,
        severity: e.severity,
        message: e.message,
        confidence: e.confidence,
      },
    }),
  );
  return true;
}

export function acknowledgeAlerts() {
  mirror(() => memAcknowledgeAlerts());
  write(
    K.alerts,
    getAlerts().map((a) => ({ ...a, acknowledged: true })),
  );
}

export function clearAlerts() {
  mirror(() => memClearAlerts());
  write(K.alerts, []);
}

/* -------------------------------- notes ------------------------------- */

export function getNote(key: string): string {
  return read<Record<string, string>>(K.notes, {})[key] ?? "";
}

export function setNote(key: string, text: string) {
  const [chainId, ...rest] = key.split(":");
  if (chainId && rest.length) mirror(() => memSetNote({ data: { chainId, pairAddress: rest.join(":"), body: text } }));
  const all = read<Record<string, string>>(K.notes, {});
  all[key] = text;
  write(K.notes, all);
}

/* ---------------------------- filter presets -------------------------- */

export type FilterPreset = { id: string; name: string; json: string; savedAt: number };

export function getPresets(): FilterPreset[] {
  return read<FilterPreset[]>(K.presets, []);
}

export function savePreset(name: string, json: string) {
  mirror(() => memSavePreset({ data: { name, json } }));
  write(K.presets, [{ id: `p${Date.now()}`, name, json, savedAt: Date.now() }, ...getPresets()].slice(0, 40));
}

export function deletePreset(id: string) {
  // Locally saved presets carry a local id; Supabase rows carry a uuid.
  if (id.includes("-")) mirror(() => memDeletePreset({ data: { id } }));
  write(
    K.presets,
    getPresets().filter((p) => p.id !== id),
  );
}
