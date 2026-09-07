/**
 * FOMO evidence adapter (read-only).
 *
 * NOT CONFIGURED until FOMO_API_KEY is provided. While unconfigured it
 * contributes zero evidence and reports the questions it cannot answer.
 * No execution, ordering or wallet capability exists in this adapter.
 */

import type { AdapterEvidence } from "./gmgn.server";

export type FomoResult = {
  source: "fomo";
  configured: boolean;
  state: "CONNECTED" | "DEGRADED" | "NOT CONFIGURED";
  evidence: AdapterEvidence[];
  unknowns: string[];
  error: string | null;
};

export function fomoConfigured(): boolean {
  return Boolean(process.env["FOMO_API_KEY"]);
}

export async function fetchFomoEvidence(input: { chainId: string; tokenAddress: string }): Promise<FomoResult> {
  if (!fomoConfigured()) {
    return {
      source: "fomo",
      configured: false,
      state: "NOT CONFIGURED",
      evidence: [],
      unknowns: ["Contract safety checks are UNKNOWN: FOMO credentials have not been provided"],
      error: null,
    };
  }

  const key = process.env["FOMO_API_KEY"]!;
  const base = process.env["FOMO_API_BASE"] ?? "https://api.fomo.biz/v1";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${base}/token/${encodeURIComponent(input.chainId)}/${encodeURIComponent(input.tokenAddress)}`,
      { headers: { authorization: `Bearer ${key}` }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) {
      return {
        source: "fomo",
        configured: true,
        state: "DEGRADED",
        evidence: [],
        unknowns: ["Contract safety evidence is UNKNOWN for this cycle: the source returned an error"],
        error: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as Record<string, unknown>;
    const evidence: AdapterEvidence[] = [];
    for (const [field, label] of [
      ["mintable", "Mint authority present"],
      ["freezable", "Freeze authority present"],
      ["lp_locked", "Liquidity lock reported"],
    ] as const) {
      const v = body[field];
      if (v === undefined || v === null) continue;
      evidence.push({
        layer: "CONTRACT",
        grade: "OBSERVED",
        source: "FOMO",
        label,
        value: String(v),
        detail: `Reported by FOMO as field \`${field}\``,
      });
    }
    return {
      source: "fomo",
      configured: true,
      state: "CONNECTED",
      evidence,
      unknowns: evidence.length ? [] : ["FOMO returned no usable contract fields for this token"],
      error: null,
    };
  } catch (e) {
    return {
      source: "fomo",
      configured: true,
      state: "DEGRADED",
      evidence: [],
      unknowns: ["Contract safety evidence is UNKNOWN for this cycle: the request did not complete"],
      error: e instanceof Error ? e.message : "request failed",
    };
  }
}
