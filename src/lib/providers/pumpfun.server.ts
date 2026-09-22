/**
 * PUMP.FUN provider (server-only).
 *
 * Pump.fun itself does not run a hosted public data API; its web app endpoints
 * are undocumented. The only access paths we will use are documented
 * third-party ones, selected by STELLARIS_PUMPFUN_PROVIDER:
 *
 *   "pumpportal"  PumpPortal websocket — subscribeNewToken / subscribeMigration
 *                 are free; trade streams are metered. Requires an API key.
 *   "bitquery"    Bitquery GraphQL over the Pump.fun program address.
 *
 * No scraping, no undocumented private endpoints, no invented data.
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

export type PumpfunLaunch = {
  mint: string;
  symbol: string | null;
  name: string | null;
  creator: string | null;
  uri: string | null;
  observedAt: number;
  raw: unknown;
};

type Backend = "pumpportal" | "bitquery" | "none";

const env = (k: string): string | null => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : null;
};

function backend(): Backend {
  const choice = (env("STELLARIS_PUMPFUN_PROVIDER") ?? "").toLowerCase();
  if (choice === "bitquery") return "bitquery";
  if (choice === "pumpportal") return "pumpportal";
  if (env("PUMPPORTAL_API_KEY")) return "pumpportal";
  if (env("BITQUERY_API_TOKEN")) return "bitquery";
  return "none";
}

const state = {
  lastRequestAt: null as number | null,
  lastOkAt: null as number | null,
  lastErrorAt: null as number | null,
  lastError: null as string | null,
  latencyMs: null as number | null,
};

function requiredCredential(b: Backend): string | null {
  if (b === "pumpportal") return "PUMPPORTAL_API_KEY";
  if (b === "bitquery") return "BITQUERY_API_TOKEN";
  return "PUMPPORTAL_API_KEY or BITQUERY_API_TOKEN";
}

function capabilities(): CapabilityDeclaration[] {
  const b = backend();
  const configured = b !== "none" && Boolean(env(requiredCredential(b) ?? ""));
  const s = configured ? "SUPPORTED" : "REQUIRES_CREDENTIAL";
  return [
    capability("TOKEN_DISCOVERY", s, "New Pump.fun launches, read via the configured documented third-party API."),
    capability("TOKEN_LIFECYCLE", s, "Bonding-curve launch and migration/graduation events."),
    capability("TOKEN_METADATA", s, "Mint, symbol, name, creator and metadata URI as published on-chain."),
    capability(
      "STREAMING",
      b === "pumpportal" ? s : "UNSUPPORTED",
      b === "pumpportal"
        ? "PumpPortal websocket: subscribeNewToken and subscribeMigration are free; trade streams are metered per message."
        : "Streaming is only available through the PumpPortal backend.",
    ),
    capability("MARKET_SNAPSHOT", "UNSUPPORTED", "Market snapshots come from DEX Screener, not from this provider."),
    capability("HOLDERS", "UNSUPPORTED", "Holder counts require an on-chain indexer or RPC provider."),
  ];
}

async function bitqueryLaunches(limit: number): Promise<ProviderResult<PumpfunLaunch[]>> {
  const token = env("BITQUERY_API_TOKEN");
  if (!token) return providerUnsupported("pumpfun", "BITQUERY_API_TOKEN is not configured.");
  const query = `{
    Solana {
      TokenSupplyUpdates(
        where: {Instruction: {Program: {Address: {is: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"}, Method: {is: "create"}}}}
        limit: {count: ${Math.max(1, Math.min(limit, 100))}}
        orderBy: {descending: Block_Time}
      ) {
        Block { Time }
        TokenSupplyUpdate { Currency { MintAddress Symbol Name Uri UpdateAuthority } }
      }
    }
  }`;
  const started = Date.now();
  state.lastRequestAt = started;
  try {
    const res = await fetch("https://streaming.bitquery.io/eap", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
    state.latencyMs = Date.now() - started;
    if (!res.ok) {
      state.lastErrorAt = Date.now();
      state.lastError = `Bitquery responded ${res.status}.`;
      return providerFailed("pumpfun", state.lastError);
    }
    const json = (await res.json()) as {
      data?: { Solana?: { TokenSupplyUpdates?: unknown[] } };
      errors?: { message?: string }[];
    };
    if (json.errors?.length) {
      state.lastErrorAt = Date.now();
      state.lastError = json.errors[0]?.message ?? "Bitquery returned an error.";
      return providerFailed("pumpfun", state.lastError);
    }
    const rows = json.data?.Solana?.TokenSupplyUpdates ?? [];
    const launches: PumpfunLaunch[] = [];
    for (const row of rows as Record<string, never>[]) {
      const cur = (row as { TokenSupplyUpdate?: { Currency?: Record<string, string | null> } }).TokenSupplyUpdate?.Currency;
      const mint = cur?.["MintAddress"];
      if (!mint) continue;
      const t = (row as { Block?: { Time?: string } }).Block?.Time;
      launches.push({
        mint,
        symbol: cur?.["Symbol"] ?? null,
        name: cur?.["Name"] ?? null,
        creator: cur?.["UpdateAuthority"] ?? null,
        uri: cur?.["Uri"] ?? null,
        observedAt: t ? Date.parse(t) : Date.now(),
        raw: row,
      });
    }
    state.lastOkAt = Date.now();
    state.lastError = null;
    return providerOk("pumpfun", launches, launches[0]?.observedAt ?? null);
  } catch (e) {
    state.lastErrorAt = Date.now();
    state.lastError = e instanceof Error ? e.message : "Bitquery request failed.";
    return providerFailed("pumpfun", state.lastError);
  }
}

/**
 * PumpPortal publishes new launches over a websocket stream, not a REST
 * endpoint. Each collection cycle therefore opens one short-lived connection,
 * subscribes to subscribeNewToken, drains whatever arrives inside a bounded
 * window and closes again. Launches that happen while nothing is listening are
 * simply not observed — they are never back-filled or guessed.
 */
async function drainPumpPortal(limit: number, windowMs: number): Promise<ProviderResult<PumpfunLaunch[]>> {
  if (typeof WebSocket !== "function")
    return providerUnsupported("pumpfun", "This runtime has no websocket client, so the PumpPortal stream cannot be drained here.");

  const started = Date.now();
  state.lastRequestAt = started;
  const launches: PumpfunLaunch[] = [];

  try {
    const result = await new Promise<{ error: string | null }>((resolve) => {
      const ws = new WebSocket("wss://pumpportal.fun/api/data");
      let settled = false;
      const finish = (error: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* already closing */
        }
        resolve({ error });
      };
      const timer = setTimeout(() => finish(null), Math.max(2_000, Math.min(20_000, windowMs)));

      ws.onopen = () => ws.send(JSON.stringify({ method: "subscribeNewToken" }));
      ws.onerror = () => finish("PumpPortal websocket connection failed.");
      ws.onclose = () => finish(null);
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const raw = typeof ev.data === "string" ? ev.data : "";
          if (!raw) return;
          const msg = JSON.parse(raw) as Record<string, unknown>;
          const mint = typeof msg["mint"] === "string" ? (msg["mint"] as string) : null;
          if (!mint) return; // subscription acknowledgements carry no mint
          launches.push({
            mint,
            symbol: typeof msg["symbol"] === "string" ? (msg["symbol"] as string) : null,
            name: typeof msg["name"] === "string" ? (msg["name"] as string) : null,
            creator: typeof msg["traderPublicKey"] === "string" ? (msg["traderPublicKey"] as string) : null,
            uri: typeof msg["uri"] === "string" ? (msg["uri"] as string) : null,
            observedAt: Date.now(),
            raw: msg,
          });
          if (launches.length >= limit) finish(null);
        } catch {
          /* a malformed frame is ignored rather than invented */
        }
      };
    });

    state.latencyMs = Date.now() - started;
    if (result.error) {
      state.lastErrorAt = Date.now();
      state.lastError = result.error;
      return providerFailed("pumpfun", result.error);
    }
    state.lastOkAt = Date.now();
    state.lastError = null;
    return providerOk("pumpfun", launches, launches[0]?.observedAt ?? null);
  } catch (e) {
    state.lastErrorAt = Date.now();
    state.lastError = e instanceof Error ? e.message : "PumpPortal stream failed.";
    return providerFailed("pumpfun", state.lastError);
  }
}

export const pumpfunProvider: Provider<PumpfunLaunch, never> = {
  id: "pumpfun",
  name: "Pump.fun (via documented third-party API)",
  authKind: "API_KEY",
  get credential() {
    return requiredCredential(backend());
  },
  whereToGet:
    "PumpPortal API key: pumpportal.fun (free new-token and migration streams; a linked funded wallet is only needed for metered trade streams). Bitquery token: bitquery.io.",
  configured: () => {
    const b = backend();
    return b !== "none" && Boolean(env(requiredCredential(b) ?? ""));
  },
  capabilities,
  health: async (): Promise<ProviderHealth> => {
    const b = backend();
    const configured = pumpfunProvider.configured();
    return {
      id: "pumpfun",
      name: pumpfunProvider.name,
      status: configured ? (state.lastError ? "DEGRADED" : "CONNECTED") : "NOT CONNECTED",
      authKind: "API_KEY",
      credential: requiredCredential(b),
      whereToGet: pumpfunProvider.whereToGet,
      configured,
      lastRequestAt: state.lastRequestAt,
      lastOkAt: state.lastOkAt,
      lastErrorAt: state.lastErrorAt,
      lastError: state.lastError,
      latencyMs: state.latencyMs,
      rateLimitNote:
        b === "pumpportal"
          ? "One websocket connection only; new-token and migration streams are free, trade streams cost 0.01 SOL per 10,000 messages."
          : b === "bitquery"
            ? "Bitquery bills per query/point; keep polling intervals conservative."
            : null,
      capabilities: capabilities(),
      blockedReason: configured
        ? null
        : "Pump.fun publishes no hosted public data API. STELLARIS needs a key for a documented third-party source (PumpPortal or Bitquery) before it can discover launches.",
    };
  },
  discover: async (input) => {
    const limit = typeof input?.["limit"] === "number" ? (input["limit"] as number) : 50;
    const windowMs = typeof input?.["windowMs"] === "number" ? (input["windowMs"] as number) : 8_000;
    const b = backend();
    if (b === "bitquery") return bitqueryLaunches(limit);
    if (b === "pumpportal") return drainPumpPortal(limit, windowMs);
    return providerUnsupported(
      "pumpfun",
      "No Pump.fun data backend is configured. Provide PUMPPORTAL_API_KEY or BITQUERY_API_TOKEN.",
    );
  },
};
