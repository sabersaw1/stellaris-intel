/**
 * Research pass over STORED evidence (server-only).
 *
 * Shared by the UI server function and the agent API so there is exactly one
 * analysis path. Evidence that is not stored is reported as unknown; nothing is
 * inferred, defaulted to zero, or invented.
 */

import { runFunnel } from "./funnel";
import type { AnalysisInput, Snapshot } from "./roles";
import type { AnalyzeResult, Dossier } from "./dossier-types";

export type { AnalyzeResult, Dossier } from "./dossier-types";


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

export async function analyzeTokenForAgent(tokenId: string, persist: boolean): Promise<AnalyzeResult> {
  const { db, memeSchemaReady } = await import("../stellaris/store.server");
  const client = db();
  if (!client) return { ok: false, state: "NOT CONFIGURED", detail: "Supabase is not configured." };
  const schema = await memeSchemaReady(client);
  if (!schema.ready) return { ok: false, state: "SCHEMA MISSING", detail: schema.error };

  const token = await client
    .from("tokens")
    .select("id, chain_id, address, symbol, meme_verdict, meme_reasons")
    .eq("id", tokenId)
    .maybeSingle();
  if (token.error) return { ok: false, state: "ERROR", detail: token.error.message };
  if (!token.data) return { ok: false, state: "NOT FOUND", detail: "No stored token has that id." };

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
    .select("kind, value_usd, tx_hash, source, observed_at, wallet_id")
    .eq("token_id", tokenId)
    .order("observed_at", { ascending: false })
    .limit(50);

  const t = token.data as Record<string, unknown>;
  const input: AnalysisInput = {
    tokenLabel: (t["symbol"] as string | null) ?? (t["address"] as string),
    memeVerdict: ((t["meme_verdict"] as string) ?? "UNKNOWN") as AnalysisInput["memeVerdict"],
    memeReasons: Array.isArray(t["meme_reasons"]) ? (t["meme_reasons"] as string[]) : [],
    pairCreatedAt: ts((pair.data ?? [])[0]?.["pair_created_at"]),
    latest: toSnapshot(rows[0]),
    previous: toSnapshot(rows[1]),
    /* No on-chain, social or analog evidence is available until those providers
       are connected; the corresponding roles report UNAVAILABLE. */
    chain: null,
    wallets: ((walletRows.data ?? []) as Record<string, unknown>[]).map((w) => ({
      wallet: (w["wallet_id"] as string | null) ?? null,
      action: w["kind"] === "BUY" ? "BUY" : w["kind"] === "SELL" ? "SELL" : "UNKNOWN",
      observedAt: ts(w["observed_at"]),
      source: (w["source"] as string | null) ?? "unknown",
      verified: false,
      amountUsd: num(w["value_usd"]),
      txSignature: (w["tx_hash"] as string | null) ?? null,
    })),
    traderLabels: [],
    social: null,
    analogs: null,
  };

  const out = runFunnel(input);
  const d = out.decision;
  const dossier: Dossier = {
    tokenId,
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
  };

  let persisted = false;
  if (persist) {
    const write = await client.from("dossiers").insert({
      token_id: tokenId,
      research_state: dossier.state,
      observation: dossier.observation,
      supporting: dossier.supporting as never,
      contradicting: dossier.contradicting as never,
      unknowns: dossier.unknown as never,
      findings: dossier.findings as never,
      what_would_change_it: dossier.whatWouldChangeIt as never,
      disagreement: dossier.disagreement,
      funnel_stage: dossier.funnelReached,
      funnel_blocked_by: dossier.funnelBlockedBy,
      funnel_stages: dossier.funnelStages as never,
      sources: [...new Set(input.wallets.map((w) => w.source).concat(rows.length ? [String(rows[0]?.["source"] ?? "")] : []))].filter(Boolean) as never,
      inputs_observed_at: input.latest?.observedAt ? new Date(input.latest.observedAt).toISOString() : null,
    });
    persisted = !write.error;
  }

  return { ok: true, dossier, persisted };
}
