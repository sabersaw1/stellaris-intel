/**
 * Server functions for the multi-agent intelligence layer.
 *
 * Reads only what is actually stored, runs the deterministic analyst roles and
 * returns decision support. Nothing here executes a trade, and missing evidence
 * is reported as unknown rather than filled in.
 */

import { createServerFn } from "@tanstack/react-start";
import type { AgentFinding, AnalysisInput, ResearchState, Snapshot } from "./agents/roles";
import type { FunnelStage, StageResult } from "./agents/funnel";

export type DossierPayload = {
  tokenId: string;
  tokenLabel: string;
  observation: string;
  state: ResearchState;
  disagreement: boolean;
  supporting: string[];
  contradicting: string[];
  unknown: string[];
  findings: AgentFinding[];
  whatWouldChangeIt: string[];
  funnelReached: FunnelStage;
  funnelBlockedBy: FunnelStage | null;
  funnelStages: StageResult[];
  executionAllowed: false;
  producedAt: number;
  note: string | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ts = (v: unknown): number | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

function toSnapshot(row: Record<string, unknown> | null | undefined): Snapshot | null {
  if (!row) return null;
  return {
    observedAt: ts(row["observed_at"]),
    priceUsd: num(row["price_usd"]),
    marketCapUsd: num(row["market_cap_usd"]),
    liquidityUsd: num(row["liquidity_usd"]),
    volume24hUsd: num(row["volume_24h_usd"]),
    volume5mUsd: num(row["volume_5m_usd"]),
    txns5mBuys: num(row["txns_5m_buys"]),
    txns5mSells: num(row["txns_5m_sells"]),
    holders: num(row["holders"]),
  };
}

/** Builds the analysis input for one stored token from stored evidence only. */
async function buildInput(tokenId: string): Promise<{ input: AnalysisInput | null; note: string | null }> {
  const { db, memeSchemaReady } = await import("./stellaris/store.server");
  const client = db();
  if (!client) return { input: null, note: "Supabase is not configured." };
  const schema = await memeSchemaReady(client);
  if (!schema.ready) return { input: null, note: schema.error };

  const token = await client
    .from("tokens")
    .select("id, chain_id, address, symbol, name, meme_verdict, meme_reasons")
    .eq("id", tokenId)
    .maybeSingle();
  if (token.error || !token.data) return { input: null, note: token.error?.message ?? "Token not found." };

  const snaps = await client
    .from("token_snapshots")
    .select("*")
    .eq("token_id", tokenId)
    .order("observed_at", { ascending: false })
    .limit(2);
  const rows = (snaps.data ?? []) as Record<string, unknown>[];

  const pair = await client
    .from("token_pairs")
    .select("pair_created_at")
    .eq("token_id", tokenId)
    .order("pair_created_at", { ascending: true })
    .limit(1);

  const walletRows = await client
    .from("wallet_events")
    .select("kind, value_usd, tx_hash, source, observed_at, verified, wallet_id")
    .eq("token_id", tokenId)
    .order("observed_at", { ascending: false })
    .limit(50);

  const t = token.data as Record<string, unknown>;
  const reasons = Array.isArray(t["meme_reasons"]) ? (t["meme_reasons"] as string[]) : [];

  return {
    input: {
      tokenLabel: (t["symbol"] as string | null) ?? (t["address"] as string),
      memeVerdict: ((t["meme_verdict"] as string) ?? "UNKNOWN") as AnalysisInput["memeVerdict"],
      memeReasons: reasons,
      pairCreatedAt: ts((pair.data ?? [])[0]?.["pair_created_at"]),
      latest: toSnapshot(rows[0]),
      previous: toSnapshot(rows[1]),
      /* No on-chain provider is connected until an RPC URL exists; the on-chain
         role must report UNAVAILABLE rather than assume clean structure. */
      chain: null,
      wallets: ((walletRows.data ?? []) as Record<string, unknown>[]).map((w) => ({
        wallet: (w["wallet_id"] as string | null) ?? null,
        action: w["kind"] === "BUY" ? "BUY" : w["kind"] === "SELL" ? "SELL" : "UNKNOWN",
        observedAt: ts(w["observed_at"]),
        source: (w["source"] as string | null) ?? "unknown",
        verified: w["verified"] === true,
        amountUsd: num(w["value_usd"]),
        txSignature: (w["tx_hash"] as string | null) ?? null,
      })),
      traderLabels: [],
      social: null,
      analogs: null,
    },
    note: null,
  };
}

export const analyzeToken = createServerFn({ method: "POST" })
  .inputValidator((data: { tokenId: string }) => ({ tokenId: String(data?.tokenId ?? "") }))
  .handler(async ({ data }): Promise<DossierPayload | { note: string }> => {
    const { runFunnel } = await import("./agents/funnel");
    const { input, note } = await buildInput(data.tokenId);
    if (!input) return { note: note ?? "No analysable token." };
    const out = runFunnel(input);
    const d = out.decision;
    return {
      tokenId: data.tokenId,
      tokenLabel: d.tokenLabel,
      observation: d.observation,
      state: d.state,
      disagreement: d.disagreement,
      supporting: d.supporting,
      contradicting: d.contradicting,
      unknown: d.unknown,
      findings: d.findings,
      whatWouldChangeIt: d.whatWouldChangeIt,
      funnelReached: out.reached,
      funnelBlockedBy: out.blockedBy,
      funnelStages: out.stages,
      executionAllowed: false,
      producedAt: d.producedAt,
      note: null,
    };
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

export const connectionCenter = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rows: ConnectionCenterRow[]; coverage: { capability: string; available: boolean }[]; executionEnabled: false; checkedAt: number }> => {
    const { providerHealthReport, capabilityCoverage } = await import("./providers/registry.server");
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
      executionEnabled: false,
      checkedAt: Date.now(),
    };
  },
);
