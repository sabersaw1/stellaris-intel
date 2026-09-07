/**
 * STELLARIS MEMORY API (server functions)
 *
 * The six surfaces call these; every one of them reads or writes the operator's
 * own Supabase project. Server-only modules are imported INSIDE handlers so no
 * credential can reach the browser bundle.
 *
 * Every result carries `configured`, so the UI can state plainly when memory is
 * unavailable instead of showing numbers it cannot back up.
 */

import { createServerFn } from "@tanstack/react-start";

import type { Investigation } from "./stellaris";
import type { AlertRow, MemoryHit, StoredInvestigation, WatchRow } from "./supabase/memory.server";

type Unconfigured = { configured: false };
type Ok<T> = { configured: true } & T;

async function db() {
  const { getAdmin } = await import("./supabase/admin.server");
  const mem = await import("./supabase/memory.server");
  return { admin: getAdmin(), mem };
}

/* ------------------------------------------------------------- watchlist --- */

export const memWatchlist = createServerFn({ method: "GET" }).handler(
  async (): Promise<Unconfigured | Ok<{ items: WatchRow[] }>> => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false };
    return { configured: true, items: await mem.listWatchlist(admin) };
  },
);

export const memSetWatch = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      chainId: string;
      pairAddress: string;
      symbol?: string;
      dexId?: string;
      watched: boolean;
      group?: string;
    }) => input,
  )
  .handler(async ({ data }): Promise<Unconfigured | Ok<{ watched: boolean; error: string | null }>> => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false };
    const r = await mem.setWatch(
      admin,
      { chainId: data.chainId, pairAddress: data.pairAddress, symbol: data.symbol ?? null, dexId: data.dexId ?? null },
      data.watched,
      data.group ?? "Default",
    );
    return { configured: true, ...r };
  });

export const memSetWatchGroup = createServerFn({ method: "POST" })
  .inputValidator((input: { chainId: string; pairAddress: string; group: string }) => input)
  .handler(async ({ data }) => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false as const };
    return { configured: true as const, ...(await mem.setWatchGroup(admin, data.chainId, data.pairAddress, data.group)) };
  });

/* ----------------------------------------------------------------- notes --- */

export const memGetNote = createServerFn({ method: "GET" })
  .inputValidator((input: { chainId: string; pairAddress: string }) => input)
  .handler(async ({ data }): Promise<Unconfigured | Ok<{ body: string }>> => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false };
    return { configured: true, body: await mem.getNote(admin, data.chainId, data.pairAddress) };
  });

export const memSetNote = createServerFn({ method: "POST" })
  .inputValidator((input: { chainId: string; pairAddress: string; symbol?: string; body: string }) => input)
  .handler(async ({ data }) => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false as const };
    const r = await mem.setNote(
      admin,
      { chainId: data.chainId, pairAddress: data.pairAddress, symbol: data.symbol ?? null },
      data.body,
    );
    return { configured: true as const, ...r };
  });

export const memNotes = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, mem } = await db();
  if (!admin) return { configured: false as const, items: [] };
  return { configured: true as const, items: await mem.listNotes(admin) };
});

/* ---------------------------------------------------------------- alerts --- */

export const memAlerts = createServerFn({ method: "GET" }).handler(
  async (): Promise<Unconfigured | Ok<{ items: AlertRow[] }>> => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false };
    return { configured: true, items: await mem.listAlerts(admin) };
  },
);

export const memEmitAlert = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      key: string;
      chainId: string;
      pairAddress?: string;
      symbol: string;
      dexId: string;
      kind: string;
      severity: string;
      message: string;
      confidence: number;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false as const, stored: false };
    return { configured: true as const, ...(await mem.insertAlert(admin, data)) };
  });

export const memAcknowledgeAlerts = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, mem } = await db();
  if (!admin) return { configured: false as const };
  return { configured: true as const, ...(await mem.acknowledgeAlerts(admin)) };
});

export const memClearAlerts = createServerFn({ method: "POST" }).handler(async () => {
  const { admin, mem } = await db();
  if (!admin) return { configured: false as const };
  return { configured: true as const, ...(await mem.clearAlerts(admin)) };
});

/* --------------------------------------------------------------- presets --- */

export const memPresets = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, mem } = await db();
  if (!admin) return { configured: false as const, items: [] };
  return { configured: true as const, items: await mem.listPresets(admin) };
});

export const memSavePreset = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; json: string }) => input)
  .handler(async ({ data }) => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false as const };
    return { configured: true as const, ...(await mem.savePreset(admin, data.name, data.json)) };
  });

export const memDeletePreset = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false as const };
    return { configured: true as const, ...(await mem.deletePreset(admin, data.id)) };
  });

/* -------------------------------------------------------- investigations --- */

export const memInvestigations = createServerFn({ method: "GET" }).handler(
  async (): Promise<Unconfigured | Ok<{ items: StoredInvestigation[] }>> => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false };
    return { configured: true, items: await mem.listInvestigations(admin) };
  },
);

/** Persists a research cycle produced by the intelligence layer. */
export const memSaveInvestigation = createServerFn({ method: "POST" })
  .inputValidator((input: { investigation: Investigation }) => input)
  .handler(async ({ data }) => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false as const };
    return { configured: true as const, ...(await mem.saveInvestigation(admin, data.investigation)) };
  });

/* -------------------------------------------- outcomes and calibration --- */

export const memRecordOutcome = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      chainId: string;
      pairAddress: string;
      assessedState: string;
      observedResult: "CONFIRMED" | "NOT CONFIRMED" | "INCONCLUSIVE";
      windowHours: number;
      detail?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false as const };
    const r = await mem.recordOutcome(admin, data);
    const { STELLARIS_VERSION } = await import("./stellaris");
    if (!r.error) await mem.recalculateCalibration(admin, STELLARIS_VERSION);
    return { configured: true as const, ...r };
  });

export const memCalibration = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, mem } = await db();
  if (!admin) return { configured: false as const, outcomes: 0, buckets: [] };
  return { configured: true as const, ...(await mem.calibrationSummary(admin)) };
});

/* ---------------------------------------------------------------- memory --- */

export const memSearch = createServerFn({ method: "GET" })
  .inputValidator((input: { q: string }) => input)
  .handler(async ({ data }): Promise<Unconfigured | Ok<{ items: MemoryHit[] }>> => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false };
    return { configured: true, items: await mem.searchMemory(admin, data.q) };
  });

export const memSeries = createServerFn({ method: "GET" })
  .inputValidator((input: { chainId: string; pairAddress: string }) => input)
  .handler(async ({ data }) => {
    const { admin, mem } = await db();
    if (!admin) return { configured: false as const, points: [] };
    return { configured: true as const, points: await mem.observationSeries(admin, data.chainId, data.pairAddress) };
  });

export const memChanges = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, mem } = await db();
  if (!admin) return { configured: false as const, items: [] };
  return { configured: true as const, items: await mem.recentChangeEvents(admin) };
});
