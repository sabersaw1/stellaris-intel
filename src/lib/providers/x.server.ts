/**
 * X (Twitter) provider (server-only).
 *
 * Access is through X's official v2 API with a legitimate credential — either
 * the Lovable X connector (which supplies the token as an environment variable)
 * or an app bearer token the operator provides. No scraping, no unofficial
 * endpoints, no logged-in session replay.
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

const BASE = "https://api.x.com/2";

const token = (): string | null => {
  for (const k of ["X_BEARER_TOKEN", "X_ACCESS_TOKEN", "TWITTER_BEARER_TOKEN"]) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return null;
};

const state = {
  lastRequestAt: null as number | null,
  lastOkAt: null as number | null,
  lastErrorAt: null as number | null,
  lastError: null as string | null,
  latencyMs: null as number | null,
  rateLimitNote: null as string | null,
};

function capabilities(): CapabilityDeclaration[] {
  const s = token() ? "SUPPORTED" : "REQUIRES_CREDENTIAL";
  return [
    capability("SOCIAL_SEARCH", s, "Recent-post search for a ticker or contract address (search window depends on your X access tier)."),
    capability("SOCIAL_POSTS", s, "Posts with public metrics: replies, reposts, likes, quotes."),
    capability("ACCOUNT_IDENTITY", s, "Account handle, creation date, follower counts and verification flag."),
    capability("NEWS", "UNSUPPORTED", "No curated news feed; only posts."),
    capability("STREAMING", "REQUIRES_CREDENTIAL", "Filtered stream needs an elevated X access tier; STELLARIS polls instead."),
  ];
}

export type XPost = {
  id: string;
  text: string;
  authorId: string | null;
  createdAt: number | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  quotes: number | null;
};

async function call<T>(path: string): Promise<ProviderResult<T>> {
  const t = token();
  if (!t)
    return providerUnsupported<T>(
      "x",
      "No X credential is configured. Connect the X connector, or set X_BEARER_TOKEN.",
    );
  const started = Date.now();
  state.lastRequestAt = started;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${t}`, accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    state.latencyMs = Date.now() - started;
    const remaining = res.headers.get("x-rate-limit-remaining");
    if (remaining) state.rateLimitNote = `${remaining} requests left in the current X rate-limit window.`;
    if (res.status === 401 || res.status === 403) {
      state.lastErrorAt = Date.now();
      state.lastError = `X rejected the credential (${res.status}). The access tier may not include this endpoint.`;
      return providerFailed<T>("x", state.lastError);
    }
    if (res.status === 429) {
      state.lastErrorAt = Date.now();
      state.lastError = "X rate limit reached (429). STELLARIS will back off.";
      return providerFailed<T>("x", state.lastError);
    }
    if (!res.ok) {
      state.lastErrorAt = Date.now();
      state.lastError = `X responded ${res.status}.`;
      return providerFailed<T>("x", state.lastError);
    }
    const data = (await res.json()) as T;
    state.lastOkAt = Date.now();
    state.lastError = null;
    return providerOk<T>("x", data, null);
  } catch (e) {
    state.lastErrorAt = Date.now();
    state.lastError = e instanceof Error ? e.message : "X request failed.";
    return providerFailed<T>("x", state.lastError);
  }
}

export const xProvider: Provider<XPost, Record<string, unknown>> = {
  id: "x",
  name: "X (Twitter) API v2",
  authKind: "OAUTH2",
  credential: "X connector connection (or X_BEARER_TOKEN)",
  whereToGet:
    "Connect the X connector in Lovable, or create an app at developer.x.com and use its bearer token. Recent-post search requires a paid X API tier.",
  configured: () => Boolean(token()),
  capabilities,
  health: async (): Promise<ProviderHealth> => ({
    id: "x",
    name: xProvider.name,
    status: token() ? (state.lastError ? "DEGRADED" : "CONNECTED") : "NOT CONNECTED",
    authKind: "OAUTH2",
    credential: xProvider.credential,
    whereToGet: xProvider.whereToGet,
    configured: Boolean(token()),
    lastRequestAt: state.lastRequestAt,
    lastOkAt: state.lastOkAt,
    lastErrorAt: state.lastErrorAt,
    lastError: state.lastError,
    latencyMs: state.latencyMs,
    rateLimitNote: state.rateLimitNote ?? "X enforces per-endpoint windows; social pulls run only for tokens under research.",
    capabilities: capabilities(),
    blockedReason: token() ? null : "Social evidence from X stays unavailable until a legitimate X credential is connected.",
  }),
  discover: async (input): Promise<ProviderResult<XPost[]>> => {
    const q = input?.["query"];
    if (typeof q !== "string" || !q) return providerFailed<XPost[]>("x", "A search query is required.");
    const max = typeof input?.["max"] === "number" ? Math.min(Math.max(input["max"] as number, 10), 100) : 25;
    const path =
      `/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=${max}` +
      `&tweet.fields=created_at,public_metrics,author_id`;
    const r = await call<{ data?: Record<string, never>[] }>(path);
    if (!r.ok) return { ...r, data: null } as ProviderResult<XPost[]>;
    const rows = (r.data?.data ?? []) as unknown as {
      id: string;
      text: string;
      author_id?: string;
      created_at?: string;
      public_metrics?: Record<string, number>;
    }[];
    const posts: XPost[] = rows.map((p) => ({
      id: p.id,
      text: p.text,
      authorId: p.author_id ?? null,
      createdAt: p.created_at ? Date.parse(p.created_at) : null,
      likes: p.public_metrics?.["like_count"] ?? null,
      reposts: p.public_metrics?.["retweet_count"] ?? null,
      replies: p.public_metrics?.["reply_count"] ?? null,
      quotes: p.public_metrics?.["quote_count"] ?? null,
    }));
    return { ...r, data: posts } as ProviderResult<XPost[]>;
  },
  fetch: async (input) => {
    const handle = input["handle"];
    if (typeof handle !== "string" || !handle)
      return providerFailed<Record<string, unknown>>("x", "An account handle is required.");
    return call<Record<string, unknown>>(
      `/users/by/username/${encodeURIComponent(handle)}?user.fields=created_at,public_metrics,verified,description`,
    );
  },
};
