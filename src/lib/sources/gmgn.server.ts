/**
 * GMGN evidence adapter (read-only).
 *
 * Status is NOT CONFIGURED until GMGN_API_KEY is provided as a runtime secret.
 * While unconfigured this adapter contributes ZERO evidence and never guesses:
 * holder and developer questions stay UNKNOWN. No wallet or execution surface
 * exists here by design.
 */

/** Evidence layers an adapter may contribute to. */
export type AdapterLayer = "MARKET" | "HOLDERS" | "DEVELOPER" | "CONTRACT" | "SOCIAL" | "HISTORICAL";
export type AdapterGrade = "VERIFIED" | "OBSERVED" | "INFERRED" | "SUSPECTED" | "UNKNOWN" | "CONFLICTING" | "INSUFFICIENT DATA";

export type AdapterEvidence = {
  layer: AdapterLayer;
  grade: AdapterGrade;
  source: string;
  label: string;
  value: string | null;
  detail: string;
};

export type AdapterResult = {
  source: "gmgn";
  configured: boolean;
  state: "CONNECTED" | "DEGRADED" | "NOT CONFIGURED";
  evidence: AdapterEvidence[];
  unknowns: string[];
  error: string | null;
};

export function gmgnConfigured(): boolean {
  return Boolean(process.env["GMGN_API_KEY"]);
}

export async function fetchGmgnEvidence(_input: {
  chainId: string;
  tokenAddress: string;
}): Promise<AdapterResult> {
  if (!gmgnConfigured()) {
    return {
      source: "gmgn",
      configured: false,
      state: "NOT CONFIGURED",
      evidence: [],
      unknowns: [
        "Holder concentration is UNKNOWN: GMGN credentials have not been provided",
        "Developer wallet history is UNKNOWN: GMGN credentials have not been provided",
      ],
      error: null,
    };
  }

  // Credentials present: the request path is defined here so that supplying a
  // key is the only step required. Any failure is reported, never smoothed over.
  const key = process.env["GMGN_API_KEY"]!;
  const base = process.env["GMGN_API_BASE"] ?? "https://gmgn.ai/defi/quotation/v1";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${base}/tokens/${encodeURIComponent(_input.chainId)}/${encodeURIComponent(_input.tokenAddress)}`,
      { headers: { authorization: `Bearer ${key}` }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) {
      return {
        source: "gmgn",
        configured: true,
        state: "DEGRADED",
        evidence: [],
        unknowns: ["Holder and developer evidence is UNKNOWN for this cycle: the source returned an error"],
        error: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const d = body.data ?? {};
    const evidence: AdapterEvidence[] = [];
    const push = (layer: AdapterLayer, label: string, field: string) => {
      const v = d[field];
      if (v === undefined || v === null) return;
      evidence.push({
        layer,
        grade: "OBSERVED",
        source: "GMGN",
        label,
        value: String(v),
        detail: `Reported by GMGN for this token as field \`${field}\``,
      });
    };
    push("HOLDERS", "Holder count", "holder_count");
    push("HOLDERS", "Top 10 holder share", "top_10_holder_rate");
    push("DEVELOPER", "Creator balance share", "creator_balance_rate");
    push("CONTRACT", "Renounced ownership", "renounced_ownership");
    return {
      source: "gmgn",
      configured: true,
      state: "CONNECTED",
      evidence,
      unknowns: evidence.length ? [] : ["GMGN returned no usable fields for this token"],
      error: null,
    };
  } catch (e) {
    return {
      source: "gmgn",
      configured: true,
      state: "DEGRADED",
      evidence: [],
      unknowns: ["Holder and developer evidence is UNKNOWN for this cycle: the request did not complete"],
      error: e instanceof Error ? e.message : "request failed",
    };
  }
}
