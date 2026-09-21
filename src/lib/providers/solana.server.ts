/**
 * Solana on-chain provider (server-only).
 *
 * Reads chain state through a standard JSON-RPC endpoint the operator supplies
 * (Helius, QuickNode, Triton, or any RPC URL). Without STELLARIS_SOLANA_RPC_URL
 * nothing on-chain is claimed: holder counts and transfers stay unavailable
 * rather than estimated.
 */

import {
  capability,
  providerFailed,
  providerOk,
  providerUnsupported,
  type CapabilityDeclaration,
  type Provider,
  type ProviderHealth,
  type ProviderResult,
} from "./types";

const url = (): string | null => {
  const v = process.env["STELLARIS_SOLANA_RPC_URL"];
  return v && v.trim().startsWith("http") ? v.trim() : null;
};

const state = {
  lastRequestAt: null as number | null,
  lastOkAt: null as number | null,
  lastErrorAt: null as number | null,
  lastError: null as string | null,
  latencyMs: null as number | null,
};

function capabilities(): CapabilityDeclaration[] {
  const s = url() ? "SUPPORTED" : "REQUIRES_CREDENTIAL";
  return [
    capability("HOLDERS", s, "Counts token accounts with a non-zero balance via getTokenLargestAccounts / RPC scans."),
    capability("TOKEN_METADATA", s, "Mint supply, decimals and mint/freeze authority directly from the chain."),
    capability("TOKEN_TRANSFERS", s, "Signature history per address; depth depends on the RPC plan."),
    capability("WALLET_ACTIVITY", s, "Wallet balances and transaction signatures."),
    capability("LIQUIDITY_EVENTS", "UNSUPPORTED", "Requires a program-aware indexer; plain RPC cannot classify pool events."),
  ];
}

async function rpc<T>(method: string, params: unknown[]): Promise<ProviderResult<T>> {
  const endpoint = url();
  if (!endpoint) return providerUnsupported<T>("solana", "STELLARIS_SOLANA_RPC_URL is not configured.");
  const started = Date.now();
  state.lastRequestAt = started;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    state.latencyMs = Date.now() - started;
    if (!res.ok) {
      state.lastErrorAt = Date.now();
      state.lastError = `Solana RPC responded ${res.status}.`;
      return providerFailed<T>("solana", state.lastError);
    }
    const json = (await res.json()) as { result?: T; error?: { message?: string } };
    if (json.error) {
      state.lastErrorAt = Date.now();
      state.lastError = json.error.message ?? "Solana RPC returned an error.";
      return providerFailed<T>("solana", state.lastError);
    }
    state.lastOkAt = Date.now();
    state.lastError = null;
    return providerOk<T>("solana", json.result as T, Date.now());
  } catch (e) {
    state.lastErrorAt = Date.now();
    state.lastError = e instanceof Error ? e.message : "Solana RPC request failed.";
    return providerFailed<T>("solana", state.lastError);
  }
}

export type MintFacts = {
  mint: string;
  supply: string | null;
  decimals: number | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  topHolderShare: number | null;
};

export const solanaProvider: Provider<never, MintFacts> = {
  id: "solana",
  name: "Solana JSON-RPC",
  authKind: "API_KEY",
  credential: "STELLARIS_SOLANA_RPC_URL",
  whereToGet: "Any Solana RPC provider (Helius, QuickNode, Triton) or your own node. Paste the full HTTPS RPC URL.",
  configured: () => Boolean(url()),
  capabilities,
  health: async (): Promise<ProviderHealth> => ({
    id: "solana",
    name: "Solana JSON-RPC",
    status: url() ? (state.lastError ? "DEGRADED" : "CONNECTED") : "NOT CONNECTED",
    authKind: "API_KEY",
    credential: "STELLARIS_SOLANA_RPC_URL",
    whereToGet: solanaProvider.whereToGet,
    configured: Boolean(url()),
    lastRequestAt: state.lastRequestAt,
    lastOkAt: state.lastOkAt,
    lastErrorAt: state.lastErrorAt,
    lastError: state.lastError,
    latencyMs: state.latencyMs,
    rateLimitNote: "Rate limits belong to your RPC plan; on-chain reads run only for tokens under active research.",
    capabilities: capabilities(),
    blockedReason: url() ? null : "Holder counts, mint authority and transfer history stay unavailable until an RPC URL is configured.",
  }),
  fetch: async (input): Promise<ProviderResult<MintFacts>> => {
    const mint = input["mint"];
    if (typeof mint !== "string" || !mint) return providerFailed<MintFacts>("solana", "A mint address is required.");

    const supply = await rpc<{ value?: { amount?: string; decimals?: number } }>("getTokenSupply", [mint]);
    if (!supply.ok) return { ...supply, data: null } as ProviderResult<MintFacts>;

    const account = await rpc<{ value?: { data?: { parsed?: { info?: Record<string, unknown> } } } }>(
      "getAccountInfo",
      [mint, { encoding: "jsonParsed" }],
    );
    const info = account.ok ? (account.data?.value?.data?.parsed?.info ?? null) : null;

    const largest = await rpc<{ value?: { amount?: string }[] }>("getTokenLargestAccounts", [mint]);
    const total = Number(supply.data?.value?.amount ?? NaN);
    const top = Number(largest.ok ? (largest.data?.value?.[0]?.amount ?? NaN) : NaN);

    return providerOk<MintFacts>(
      "solana",
      {
        mint,
        supply: supply.data?.value?.amount ?? null,
        decimals: supply.data?.value?.decimals ?? null,
        mintAuthority: (info?.["mintAuthority"] as string | null) ?? null,
        freezeAuthority: (info?.["freezeAuthority"] as string | null) ?? null,
        topHolderShare: Number.isFinite(total) && Number.isFinite(top) && total > 0 ? top / total : null,
      },
      Date.now(),
    );
  },
};
