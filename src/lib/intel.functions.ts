/**
 * Server functions for the multi-agent intelligence layer.
 *
 * Reads only what is actually stored, runs the deterministic analyst roles and
 * returns decision support. Nothing here executes a trade, and missing evidence
 * is reported as unknown rather than filled in.
 */

import { createServerFn } from "@tanstack/react-start";
import type { AnalyzeResult } from "./agents/analyze.server";

export const analyzeToken = createServerFn({ method: "POST" })
  .inputValidator((data: { tokenId: string; persist?: boolean }) => ({
    tokenId: String(data?.tokenId ?? ""),
    persist: data?.persist === true,
  }))
  .handler(async ({ data }): Promise<AnalyzeResult> => {
    const { analyzeTokenForAgent } = await import("./agents/analyze.server");
    if (!data.tokenId) return { ok: false, state: "INVALID INPUT", detail: "A token id is required." };
    return analyzeTokenForAgent(data.tokenId, data.persist);
  });

export type ConnectionCenterRow = {
  id: string;
  name: string;
  status: string;
  configured: boolean;
  credential: string | null;
  whereToGet: string | null;
  blockedReason: string | null;
  rateLimitNote: string | null;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  latencyMs: number | null;
  supplies: string[];
  doesNotSupply: string[];
  needsCredential: string[];
};

export type ConnectionCenter = {
  rows: ConnectionCenterRow[];
  coverage: { capability: string; available: boolean }[];
  agentApiConfigured: boolean;
  persistence: { configured: boolean; schemaReady: boolean; note: string | null };
  realExecutionEnabled: false;
  checkedAt: number;
};

export const connectionCenter = createServerFn({ method: "GET" }).handler(async (): Promise<ConnectionCenter> => {
  const { providerHealthReport, capabilityCoverage } = await import("./providers/registry.server");
  const { db, memeSchemaReady } = await import("./stellaris/store.server");

  const client = db();
  const schema = client ? await memeSchemaReady(client) : { ready: false, error: "Supabase is not configured for this project." };
  const health = await providerHealthReport(false);

  return {
    rows: health.map((h) => ({
      id: h.id,
      name: h.name,
      status: h.status,
      configured: h.configured,
      credential: h.credential,
      whereToGet: h.whereToGet,
      blockedReason: h.blockedReason,
      rateLimitNote: h.rateLimitNote,
      lastOkAt: h.lastOkAt,
      lastErrorAt: h.lastErrorAt,
      lastError: h.lastError,
      latencyMs: h.latencyMs,
      supplies: h.capabilities.filter((c) => c.state === "SUPPORTED").map((c) => `${c.capability} — ${c.note}`),
      doesNotSupply: h.capabilities.filter((c) => c.state === "UNSUPPORTED").map((c) => `${c.capability} — ${c.note}`),
      needsCredential: h.capabilities.filter((c) => c.state === "REQUIRES_CREDENTIAL").map((c) => `${c.capability} — ${c.note}`),
    })),
    coverage: capabilityCoverage().map((c) => ({ capability: c.capability, available: c.available })),
    agentApiConfigured: Boolean(process.env["STELLARIS_AGENT_TOKEN"]),
    persistence: { configured: Boolean(client), schemaReady: schema.ready, note: schema.error },
    realExecutionEnabled: false,
    checkedAt: Date.now(),
  };
});
