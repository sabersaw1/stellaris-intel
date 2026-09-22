/**
 * PROVIDER ABSTRACTION (STELLARIS)
 *
 * Every external data source implements this contract, so the intelligence
 * engine never depends on a specific vendor. A provider that cannot supply a
 * capability must declare it UNSUPPORTED rather than returning invented values.
 *
 * This module is pure types + pure helpers: it is safe to import anywhere.
 */

export type ProviderId =
  | "pumpfun"
  | "dexscreener"
  | "solana"
  | "x"
  | "fomo"
  | "research"
  | "ai"
  | "supabase";

/** Capabilities the engine may ask a provider for. */
export type Capability =
  | "TOKEN_DISCOVERY"
  | "TOKEN_METADATA"
  | "TOKEN_LIFECYCLE"
  | "MARKET_SNAPSHOT"
  | "PAIR_DISCOVERY"
  | "HOLDERS"
  | "WALLET_ACTIVITY"
  | "TOKEN_TRANSFERS"
  | "LIQUIDITY_EVENTS"
  | "TRADER_ACTIVITY"
  | "TRADER_DISCOVERY"
  | "SOCIAL_POSTS"
  | "SOCIAL_SEARCH"
  | "ACCOUNT_IDENTITY"
  | "NEWS"
  | "STREAMING"
  | "TEXT_REASONING";

/** Declared support for a capability. Never guess; UNSUPPORTED is a valid answer. */
export type CapabilityState = "SUPPORTED" | "REQUIRES_CREDENTIAL" | "UNSUPPORTED";

export type CapabilityDeclaration = {
  capability: Capability;
  state: CapabilityState;
  /** Plain-English note shown in CONNECTIONS / PROVIDER HEALTH. */
  note: string;
};

export type AuthKind =
  | "NONE"
  | "API_KEY"
  | "OAUTH2"
  | "SERVICE_KEY"
  /** The provider offers no documented programmatic access we may lawfully use. */
  | "NO_SUPPORTED_MECHANISM";

export type ProviderStatus =
  | "CONNECTED"
  | "AVAILABLE"
  | "NOT CONNECTED"
  | "DEGRADED"
  | "UNSUPPORTED";

export type ProviderHealth = {
  id: ProviderId;
  name: string;
  status: ProviderStatus;
  authKind: AuthKind;
  /** Exact env var / credential required, or null when none is needed. */
  credential: string | null;
  whereToGet: string | null;
  configured: boolean;
  lastRequestAt: number | null;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  latencyMs: number | null;
  rateLimitNote: string | null;
  capabilities: CapabilityDeclaration[];
  /** Why the provider is not usable, in the operator's words. */
  blockedReason: string | null;
};

/** Uniform envelope. Providers never throw and never fabricate. */
export type ProviderResult<T> = {
  ok: boolean;
  data: T | null;
  source: ProviderId;
  /** When the upstream observed the data, when known. */
  observedAt: number | null;
  /** When this process received it. */
  receivedAt: number;
  cached: boolean;
  stale: boolean;
  error: string | null;
  /** Set when the provider cannot do this at all (missing credential, unsupported). */
  unsupportedReason: string | null;
};

export function providerUnsupported<T>(source: ProviderId, reason: string): ProviderResult<T> {
  return {
    ok: false,
    data: null,
    source,
    observedAt: null,
    receivedAt: Date.now(),
    cached: false,
    stale: false,
    error: null,
    unsupportedReason: reason,
  };
}

export function providerOk<T>(source: ProviderId, data: T, observedAt: number | null = null): ProviderResult<T> {
  return {
    ok: true,
    data,
    source,
    observedAt,
    receivedAt: Date.now(),
    cached: false,
    stale: false,
    error: null,
    unsupportedReason: null,
  };
}

export function providerFailed<T>(source: ProviderId, error: string): ProviderResult<T> {
  return {
    ok: false,
    data: null,
    source,
    observedAt: null,
    receivedAt: Date.now(),
    cached: false,
    stale: false,
    error,
    unsupportedReason: null,
  };
}

/**
 * The interface every adapter implements. Optional methods are genuinely
 * optional: absence means the provider does not offer that mode.
 */
export type Provider<TDiscovered = unknown, TFetched = unknown> = {
  id: ProviderId;
  name: string;
  authKind: AuthKind;
  credential: string | null;
  whereToGet: string | null;
  /** True only when every credential it needs is actually present. */
  configured: () => boolean;
  capabilities: () => CapabilityDeclaration[];
  health: () => Promise<ProviderHealth>;
  /** Discover new entities (new tokens, new pairs, new posts). */
  discover?: (input?: Record<string, unknown>) => Promise<ProviderResult<TDiscovered[]>>;
  /** Fetch detail for a known entity. */
  fetch?: (input: Record<string, unknown>) => Promise<ProviderResult<TFetched>>;
  /** Push/stream mode, when the provider supports it. */
  stream?: (onEvent: (payload: unknown) => void) => Promise<{ close: () => void }>;
  /** Begin an authorization flow; returns the URL the operator must visit. */
  authenticate?: () => Promise<{ ok: boolean; authorizeUrl: string | null; error: string | null }>;
  disconnect?: () => Promise<{ ok: boolean; error: string | null }>;
};

export function capability(
  cap: Capability,
  state: CapabilityState,
  note: string,
): CapabilityDeclaration {
  return { capability: cap, state, note };
}

/* ---------------------------------------------------------------------------
 * CONTINUOUS EVENT STREAMS (contract only — no provider fakes one)
 *
 * Today's launch collection opens a websocket, drains a bounded window and
 * closes, so anything that happens while it is not listening is simply absent.
 * That is declared, not hidden: a provider states its real delivery mode.
 * A future continuous provider (Bitquery, Solana Tracker, a hosted websocket
 * relay) implements `openStream` and declares CONTINUOUS — the engine consumes
 * the same normalized events either way, so nothing else has to be rebuilt.
 * ------------------------------------------------------------------------- */

export type DeliveryMode =
  /** No push channel at all; the engine must poll. */
  | "POLL_ONLY"
  /** Push channel exists, but is drained in short windows; gaps are expected. */
  | "BOUNDED_WINDOW"
  /** Long-lived subscription with reconnect; gaps only on recorded disconnects. */
  | "CONTINUOUS";

export type StreamEvent = {
  provider: ProviderId;
  /** Provider-native event name, kept verbatim for provenance. */
  kind: string;
  /** When the upstream says it happened, when it says so at all. */
  observedAt: number | null;
  receivedAt: number;
  payload: unknown;
};

export type StreamHandle = {
  /** Delivery mode actually in force for this handle. */
  mode: DeliveryMode;
  /** Set when the subscription ended early; describes the gap truthfully. */
  closedReason: () => string | null;
  /** Events dropped or missed while disconnected, when countable. */
  missed: () => number | null;
  close: () => Promise<void> | void;
};

export type StreamCapableProvider = Provider & {
  deliveryMode: DeliveryMode;
  /** Only present when the provider can hold a subscription open. */
  openStream?: (
    onEvent: (event: StreamEvent) => void,
    options?: { subscriptions?: string[]; signal?: AbortSignal },
  ) => Promise<ProviderResult<StreamHandle>>;
};

export function isStreamCapable(p: Provider): p is StreamCapableProvider {
  return typeof (p as StreamCapableProvider).openStream === "function";
}
