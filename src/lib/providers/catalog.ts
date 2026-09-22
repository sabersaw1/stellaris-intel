/**
 * PROVIDER CATALOG (browser-safe).
 *
 * Plain-English setup facts for every connection Stellaris can use: what it is
 * for, why Stellaris wants it, the exact credential name, where to obtain it,
 * whether it costs money, what it unlocks, what it explicitly does NOT unlock,
 * and how the in-app test works.
 *
 * This file contains no secrets and no network calls — only documentation that
 * the Connections screen renders. Anything not legitimately offered by a vendor
 * is marked CAPABILITY UNAVAILABLE rather than faked.
 */

export type ConnectionId =
  | "pumpportal"
  | "bitquery"
  | "solana_tracker"
  | "dexscreener"
  | "solana"
  | "x"
  | "fomo"
  | "ai"
  | "local_agent";

/**
 * HONEST DELIVERY MODE per connection. Nothing is called realtime unless the
 * transport actually pushes data; polling and bounded listening windows say so.
 */
export type Delivery = "POLLING" | "LISTENING WINDOW" | "REQUEST ON DEMAND" | "STREAMING" | "OFFLINE — NOT CONNECTED";

export const DELIVERY: Record<ConnectionId, Delivery> = {
  dexscreener: "POLLING",
  pumpportal: "LISTENING WINDOW",
  bitquery: "REQUEST ON DEMAND",
  solana_tracker: "REQUEST ON DEMAND",
  solana: "REQUEST ON DEMAND",
  x: "REQUEST ON DEMAND",
  fomo: "REQUEST ON DEMAND",
  ai: "REQUEST ON DEMAND",
  local_agent: "REQUEST ON DEMAND",
};

export type Requirement = "REQUIRED NOW" | "OPTIONAL" | "NOT AVAILABLE" | "FUTURE";

export type CatalogEntry = {
  id: ConnectionId;
  name: string;
  /** Provider id in the server registry, when this connection maps to one. */
  providerId: string | null;
  requirement: Requirement;
  purpose: string;
  whyStellarisNeedsIt: string;
  /** Exact credential type in the operator's words. */
  credentialType: string;
  /** Exact environment variable name(s) the server reads. */
  envVars: string[];
  whereToGet: string;
  cost: "FREE — PUBLIC ACCESS" | "FREE TIER AVAILABLE" | "PAID REQUIRED" | "NO CREDENTIAL" | "SELF HOSTED";
  unlocks: string[];
  doesNotUnlock: string[];
  howToTest: string;
};

export const CATALOG: CatalogEntry[] = [
  {
    id: "dexscreener",
    name: "DEX SCREENER",
    providerId: "dexscreener",
    requirement: "REQUIRED NOW",
    purpose: "Market observations for every meme pair: price, liquidity, volume, buys, sells, transactions, pair age and change.",
    whyStellarisNeedsIt: "It is the backbone of discovery and monitoring. Without it there is no market data at all.",
    credentialType: "None. The public API needs no key.",
    envVars: [],
    whereToGet: "Nothing to obtain — the public API is already in use.",
    cost: "FREE — PUBLIC ACCESS",
    unlocks: [
      "Price, liquidity, volume (5m / 1h / 6h / 24h)",
      "Buy and sell transaction counts",
      "Pair, chain, quote token, pair age",
      "Market capitalisation and FDV where published",
      "Change detection: volume acceleration, liquidity moves, price moves",
    ],
    doesNotUnlock: [
      "Holder counts or holder distribution",
      "Wallet or trader level activity",
      "Mint / freeze authority",
      "Social posts",
      "A push websocket feed (Stellaris polls instead)",
    ],
    howToTest: "Stellaris runs a live search against the public API and reports the real latency and response.",
  },
  {
    id: "pumpportal",
    name: "PUMP.FUN VIA PUMPPORTAL",
    providerId: "pumpfun",
    requirement: "OPTIONAL",
    purpose: "New Solana meme launches at the moment of creation, plus trades, migrations and lifecycle events.",
    whyStellarisNeedsIt: "Pump.fun publishes no official data API. PumpPortal (or BitQuery) is the documented way to see launches before they appear on DEX Screener.",
    credentialType: "API key (PumpPortal) or API token (BitQuery GraphQL)",
    envVars: ["PUMPPORTAL_API_KEY", "BITQUERY_API_TOKEN"],
    whereToGet: "pumpportal.fun — create an account and copy the data API key. Alternative: bitquery.io, create an application token for the Pump.fun GraphQL dataset.",
    cost: "FREE TIER AVAILABLE",
    unlocks: [
      "New token launches with mint address and creation time",
      "Creator address",
      "Early trades and bonding-curve activity",
      "Graduation / migration events",
    ],
    doesNotUnlock: [
      "Holder distribution (use a Solana RPC)",
      "Social posts",
      "FOMO trader identities",
      "Anything on chains other than Solana",
    ],
    howToTest: "Stellaris performs one documented read with the configured key and reports the real HTTP result.",
  },
  {
    id: "bitquery",
    name: "BITQUERY (OPTIONAL PUMP.FUN / DEX HISTORY)",
    providerId: null,
    requirement: "OPTIONAL",
    purpose: "Historical and queryable Pump.fun and Solana DEX trade data through a documented GraphQL API.",
    whyStellarisNeedsIt: "It fills launch and trade history that a bounded live listening window cannot see. Stellaris runs fine without it.",
    credentialType: "Application API token (GraphQL)",
    envVars: ["BITQUERY_API_TOKEN"],
    whereToGet: "bitquery.io — create an account and generate an application token. A free developer allowance is available; Stellaris never purchases anything.",
    cost: "FREE TIER AVAILABLE",
    unlocks: ["Historical Pump.fun launches and trades", "Backfill for launches missed while not listening", "Queryable Solana DEX trade history"],
    doesNotUnlock: ["A push stream (queries are made on demand)", "Social posts", "Anything once the free allowance is exhausted — Stellaris then continues on the other providers"],
    howToTest: "Stellaris runs one small documented GraphQL query with the configured token and reports the real HTTP result.",
  },
  {
    id: "solana_tracker",
    name: "SOLANA TRACKER (OPTIONAL)",
    providerId: null,
    requirement: "OPTIONAL",
    purpose: "Second opinion on Solana meme market data: token detail, holders and trade activity.",
    whyStellarisNeedsIt: "A second independent source lets an observation be CORROBORATED instead of merely REPORTED. Never required.",
    credentialType: "API key",
    envVars: ["SOLANA_TRACKER_API_KEY"],
    whereToGet: "solanatracker.io — create an account and copy the data API key. A free tier is available.",
    cost: "FREE TIER AVAILABLE",
    unlocks: ["Independent price / liquidity readings for cross-verification", "Holder counts where published", "Trade activity for a token"],
    doesNotUnlock: ["On-chain proof (that is the Solana RPC)", "Social evidence", "Anything on non-Solana chains"],
    howToTest: "Stellaris performs one documented read with the configured key and reports the real HTTP result.",
  },
  {
    id: "solana",
    name: "SOLANA RPC / INDEXER",
    providerId: "solana",
    requirement: "OPTIONAL",
    purpose: "Independent on-chain verification: transactions, transfers, holders, liquidity movement, creator activity, mint and freeze authority.",
    whyStellarisNeedsIt: "It is the only way to turn a reported trade into an ON-CHAIN VERIFIED fact instead of a claim.",
    credentialType: "RPC URL (any legitimate Solana RPC — vendor-neutral; the key, if any, is embedded in the URL)",
    envVars: ["STELLARIS_SOLANA_RPC_URL"],
    whereToGet: "Helius, QuickNode, Triton, Alchemy or your own validator. Copy the HTTPS RPC endpoint including its key.",
    cost: "FREE TIER AVAILABLE",
    unlocks: [
      "Token supply and decimals",
      "Mint authority and freeze authority where present",
      "Largest holders and top-holder concentration",
      "Token transfers and wallet activity",
      "On-chain confirmation of reported trades",
    ],
    doesNotUnlock: ["X posts", "FOMO account information", "DEX Screener market metadata", "Any off-chain narrative"],
    howToTest: "Stellaris calls getHealth and one token read against the URL and reports the real response.",
  },
  {
    id: "x",
    name: "X (SOCIAL)",
    providerId: "x",
    requirement: "OPTIONAL",
    purpose: "Social evidence: token mentions, meme narratives, engagement change, trader discussion, emerging themes.",
    whyStellarisNeedsIt: "Social acceleration often precedes volume. Without it social evidence stays UNAVAILABLE rather than guessed.",
    credentialType: "App bearer token from the official X API v2 (or the X connector's OAuth credentials). Never a password and never cookies.",
    envVars: ["X_BEARER_TOKEN"],
    whereToGet: "developer.x.com — create a project and app, then copy the App-only Bearer Token. Recent search requires a paid tier (Basic or above).",
    cost: "PAID REQUIRED",
    unlocks: ["Recent post search for token symbols and contracts", "Account lookup and public metrics", "Engagement change over time", "Narrative participation"],
    doesNotUnlock: [
      "Full historical archive on lower tiers",
      "Private or protected accounts",
      "Wallet addresses (those come from on-chain data)",
      "Unlimited request volume — the tier's rate limit applies",
    ],
    howToTest: "Stellaris performs one authenticated recent-search request and reports the real status, including rate limits.",
  },
  {
    id: "fomo",
    name: "FOMO (TRADER INTELLIGENCE)",
    providerId: "fomo",
    requirement: "OPTIONAL",
    purpose: "Trader and wallet intelligence: leaderboards, reported buys and sells, position changes, linked wallets.",
    whyStellarisNeedsIt: "It is the entry point for following specific traders. Reported activity is then checked on-chain before it counts as fact.",
    credentialType: "Bearer API key for the documented FOMO API (api.fomoapi.io). fomo.family itself publishes no API — Stellaris will not scrape it or ask for your login.",
    envVars: ["FOMO_API_KEY"],
    whereToGet: "fomoapi.io — create an account and generate an API key. A free key includes a monthly credit allowance.",
    cost: "FREE TIER AVAILABLE",
    unlocks: [
      "Trader leaderboards with realised PnL and volume",
      "Reported trade history per trader (labelled FOMO REPORTED — UNVERIFIED)",
      "Handle to wallet resolution where published",
      "Trader theses / stated reasoning",
    ],
    doesNotUnlock: [
      "Anything from private fomo.family accounts",
      "On-chain confirmation (that requires the Solana RPC)",
      "Market prices or liquidity",
    ],
    howToTest: "Stellaris requests one leaderboard page with the configured key and reports the real HTTP result.",
  },
  {
    id: "ai",
    name: "AI RESEARCH PROVIDER",
    providerId: null,
    requirement: "OPTIONAL",
    purpose: "Written narrative summaries on top of already-computed evidence. Never used to invent numbers.",
    whyStellarisNeedsIt: "All scoring, filtering and risk work is deterministic. AI only writes the explanation, and only when a meaningful event fires, to control cost.",
    credentialType: "Gateway API key",
    envVars: ["LOVABLE_API_KEY"],
    whereToGet: "Provided by the hosting platform when AI features are enabled; no separate vendor account is needed.",
    cost: "FREE TIER AVAILABLE",
    unlocks: ["Narrative summaries of a dossier", "Plain-English change explanations", "Daily intelligence brief prose"],
    doesNotUnlock: ["Any market, on-chain, social or trader fact", "Confidence values (those are computed from evidence)", "Trading decisions"],
    howToTest: "Stellaris checks that the key is present; it is only called when a research event actually fires, so no tokens are spent by the test.",
  },
  {
    id: "local_agent",
    name: "LOCAL AGENT / JARVIS API",
    providerId: null,
    requirement: "FUTURE",
    purpose: "Machine-readable access for your future local LLM: tokens, events, alerts, research, dossiers, providers and trade proposals.",
    whyStellarisNeedsIt: "It is how Stellaris becomes a subsystem of your own assistant instead of a closed dashboard.",
    credentialType: "Shared bearer token you choose (any long random string)",
    envVars: ["STELLARIS_AGENT_TOKEN"],
    whereToGet: "You invent it. Generate a long random value and save it as a server secret; the API stays closed until you do.",
    cost: "NO CREDENTIAL",
    unlocks: [
      "GET /api/public/intelligence/status",
      "GET /api/public/intelligence/events",
      "POST /api/public/research/analyze",
      "POST /api/public/trade/propose (records a proposal only)",
    ],
    doesNotUnlock: [
      "Real-money execution — permanently disabled at every level",
      "Access to secrets or provider credentials",
      "Write access to research memory beyond recorded proposals",
    ],
    howToTest: "Stellaris reports whether the token is configured; call the status route with the bearer token to confirm reachability from your machine.",
  },
];

export function catalogEntry(id: ConnectionId): CatalogEntry | null {
  return CATALOG.find((c) => c.id === id) ?? null;
}
