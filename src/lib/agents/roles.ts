/**
 * MULTI-AGENT ANALYSIS (pure, deterministic, testable)
 *
 * STELLARIS does not produce one blended "AI score". Each analytical role reads
 * only the evidence it is competent to judge and returns its own finding. Roles
 * are allowed to disagree; disagreement is preserved, never averaged away.
 *
 * Hard rules enforced here:
 *  - A role with no data returns UNAVAILABLE and names what is missing.
 *    It never guesses, and missing data never becomes zero.
 *  - No role emits BUY or SELL. The synthesis is decision support only.
 */

export type AgentRole =
  | "MARKET"
  | "ON-CHAIN"
  | "TRADER"
  | "SOCIAL"
  | "TOKEN/RISK"
  | "HISTORICAL";

export type FindingStance = "SUPPORTING" | "CONTRADICTING" | "NEUTRAL" | "UNAVAILABLE";

export type AgentFinding = {
  role: AgentRole;
  stance: FindingStance;
  /** One plain-English sentence the operator can read on its own. */
  statement: string;
  /** The observations the stance rests on. */
  basis: string[];
  /** Data this role needed and did not have. */
  missing: string[];
  confidence: "VERIFIED" | "HIGH CONFIDENCE" | "POSSIBLE" | "UNKNOWN";
};

export type ResearchState =
  | "INSUFFICIENT DATA"
  | "WATCH"
  | "INTERESTING — HIGH UNCERTAINTY"
  | "INTERESTING — EVIDENCE ALIGNED"
  | "DETERIORATING"
  | "REJECTED — RISK";

export type DecisionSupport = {
  tokenLabel: string;
  observation: string;
  supporting: string[];
  contradicting: string[];
  unknown: string[];
  findings: AgentFinding[];
  state: ResearchState;
  /** Explicitly not a recommendation. */
  disagreement: boolean;
  whatWouldChangeIt: string[];
  /** Real-money execution is hard-disabled system-wide. */
  executionAllowed: false;
  producedAt: number;
};

/* ------------------------------------------------------------------ inputs -- */

export type Snapshot = {
  observedAt: number | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  volume5mUsd: number | null;
  txns5mBuys: number | null;
  txns5mSells: number | null;
  holders: number | null;
};

export type WalletObservation = {
  wallet: string | null;
  action: "BUY" | "SELL" | "UNKNOWN";
  observedAt: number | null;
  source: string;
  /** False until an independent on-chain read confirms it. */
  verified: boolean;
  amountUsd: number | null;
  txSignature: string | null;
};

export type SocialObservation = {
  mentions1h: number | null;
  mentions1hPrior: number | null;
  uniqueAuthors1h: number | null;
  source: string | null;
};

export type ChainFacts = {
  holders: number | null;
  topHolderSharePct: number | null;
  mintAuthorityPresent: boolean | null;
  freezeAuthorityPresent: boolean | null;
  source: string | null;
};

export type HistoricalAnalogs = {
  sampleSize: number;
  survivedPct: number | null;
  medianOutcomePct: number | null;
  /** Losers and abandoned candidates must be included in the sample. */
  includesFailures: boolean;
};

export type AnalysisInput = {
  tokenLabel: string;
  memeVerdict: "MEME" | "NOT MEME" | "UNKNOWN";
  memeReasons: string[];
  pairCreatedAt: number | null;
  latest: Snapshot | null;
  previous: Snapshot | null;
  chain: ChainFacts | null;
  wallets: WalletObservation[];
  traderLabels: string[];
  social: SocialObservation | null;
  analogs: HistoricalAnalogs | null;
  now?: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const pct = (before: number | null, after: number | null): number | null => {
  if (before === null || after === null || !Number.isFinite(before) || !Number.isFinite(after)) return null;
  if (before === 0) return null;
  return (after - before) / Math.abs(before);
};

const fmtPct = (v: number): string => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

function unavailable(role: AgentRole, missing: string[], why: string): AgentFinding {
  return { role, stance: "UNAVAILABLE", statement: why, basis: [], missing, confidence: "UNKNOWN" };
}

/* ------------------------------------------------------------------ agents -- */

export function marketAgent(input: AnalysisInput): AgentFinding {
  const l = input.latest;
  if (!l) return unavailable("MARKET", ["token snapshot"], "No market snapshot has been stored for this token yet.");
  const missing: string[] = [];
  if (l.liquidityUsd === null) missing.push("liquidity");
  if (l.volume24hUsd === null) missing.push("24h volume");
  if (!input.previous) missing.push("a previous snapshot for comparison");

  const basis: string[] = [];
  let up = 0;
  let down = 0;

  const dLiq = pct(input.previous?.liquidityUsd ?? null, l.liquidityUsd);
  if (dLiq !== null) {
    basis.push(`liquidity ${fmtPct(dLiq)} since the previous observation`);
    if (dLiq >= 0.15) up++;
    if (dLiq <= -0.15) down++;
  }
  const dVol = pct(input.previous?.volume24hUsd ?? null, l.volume24hUsd);
  if (dVol !== null) {
    basis.push(`24h volume ${fmtPct(dVol)}`);
    if (dVol >= 0.4) up++;
    if (dVol <= -0.4) down++;
  }
  const dPrice = pct(input.previous?.priceUsd ?? null, l.priceUsd);
  if (dPrice !== null) basis.push(`price ${fmtPct(dPrice)}`);

  if (l.txns5mBuys !== null && l.txns5mSells !== null) {
    const total = l.txns5mBuys + l.txns5mSells;
    if (total > 0) {
      const buyShare = l.txns5mBuys / total;
      basis.push(`${Math.round(buyShare * 100)}% of the last 5 minutes of transactions were buys (${total} trades)`);
      if (buyShare >= 0.6 && total >= 20) up++;
      if (buyShare <= 0.4 && total >= 20) down++;
    }
  } else {
    missing.push("5m buy/sell split");
  }

  if (!basis.length)
    return unavailable("MARKET", missing.length ? missing : ["comparable observations"], "Only one observation exists, so no market movement can be measured yet.");

  const stance: FindingStance = up > down ? "SUPPORTING" : down > up ? "CONTRADICTING" : "NEUTRAL";
  const statement =
    stance === "SUPPORTING"
      ? "Market activity is expanding across the measured fields."
      : stance === "CONTRADICTING"
        ? "Market activity is contracting across the measured fields."
        : "Market activity has moved without a clear direction.";
  return { role: "MARKET", stance, statement, basis, missing, confidence: missing.length ? "POSSIBLE" : "HIGH CONFIDENCE" };
}

export function onChainAgent(input: AnalysisInput): AgentFinding {
  const c = input.chain;
  if (!c || (c.holders === null && c.topHolderSharePct === null && c.mintAuthorityPresent === null))
    return unavailable(
      "ON-CHAIN",
      ["holder counts", "holder concentration", "mint authority"],
      "No on-chain read is available: a Solana RPC or indexer connection has not been configured.",
    );

  const basis: string[] = [];
  const missing: string[] = [];
  let bad = 0;
  let good = 0;

  if (c.holders !== null) {
    basis.push(`${c.holders} holders observed via ${c.source ?? "on-chain read"}`);
    if (c.holders >= 500) good++;
    if (c.holders < 50) bad++;
  } else missing.push("holder count");

  if (c.topHolderSharePct !== null) {
    basis.push(`largest holder controls ${c.topHolderSharePct.toFixed(1)}% of supply`);
    if (c.topHolderSharePct >= 25) bad++;
    if (c.topHolderSharePct < 10) good++;
  } else missing.push("holder concentration");

  if (c.mintAuthorityPresent === true) {
    basis.push("mint authority is still active, so supply can be increased");
    bad++;
  } else if (c.mintAuthorityPresent === false) {
    basis.push("mint authority has been revoked");
    good++;
  } else missing.push("mint authority");

  if (c.freezeAuthorityPresent === true) {
    basis.push("freeze authority is still active");
    bad++;
  }

  const stance: FindingStance = bad > good ? "CONTRADICTING" : good > bad ? "SUPPORTING" : "NEUTRAL";
  return {
    role: "ON-CHAIN",
    stance,
    statement:
      stance === "CONTRADICTING"
        ? "On-chain structure carries elevated risk."
        : stance === "SUPPORTING"
          ? "On-chain structure looks comparatively clean."
          : "On-chain structure is mixed.",
    basis,
    missing,
    confidence: missing.length ? "POSSIBLE" : "VERIFIED",
  };
}

export function traderAgent(input: AnalysisInput): AgentFinding {
  if (!input.wallets.length)
    return unavailable("TRADER", ["wallet or trader observations"], "No trader or wallet observation has been recorded for this token.");

  const now = input.now ?? Date.now();
  const recent = input.wallets.filter((w) => w.observedAt !== null && now - w.observedAt <= 6 * HOUR);
  const buys = recent.filter((w) => w.action === "BUY");
  const sells = recent.filter((w) => w.action === "SELL");
  const verified = recent.filter((w) => w.verified);
  const distinct = new Set(recent.map((w) => w.wallet).filter(Boolean)).size;

  const basis = [
    `${buys.length} buy and ${sells.length} sell observations in the last 6 hours`,
    `${distinct} distinct wallets involved`,
    `${verified.length} of ${recent.length} observations independently verified on-chain`,
  ];
  if (input.traderLabels.length) basis.push(`tracked traders: ${input.traderLabels.join(", ")}`);

  const missing: string[] = [];
  if (verified.length < recent.length) missing.push("independent on-chain verification for some reported trades");
  if (recent.some((w) => w.amountUsd === null)) missing.push("trade size for some observations");

  const stance: FindingStance = buys.length > sells.length ? "SUPPORTING" : sells.length > buys.length ? "CONTRADICTING" : "NEUTRAL";
  return {
    role: "TRADER",
    stance,
    statement:
      stance === "SUPPORTING"
        ? "Tracked wallets are net buyers in the recent window."
        : stance === "CONTRADICTING"
          ? "Tracked wallets are net sellers in the recent window."
          : "Tracked wallet activity is balanced.",
    basis,
    missing,
    confidence: verified.length === recent.length && recent.length > 0 ? "VERIFIED" : "POSSIBLE",
  };
}

export function socialAgent(input: AnalysisInput): AgentFinding {
  const s = input.social;
  if (!s || s.mentions1h === null)
    return unavailable("SOCIAL", ["social mentions"], "No social data is available: no authorised social provider is connected.");
  const basis = [`${s.mentions1h} mentions in the last hour via ${s.source ?? "social provider"}`];
  const missing: string[] = [];
  if (s.uniqueAuthors1h !== null) basis.push(`${s.uniqueAuthors1h} distinct authors`);
  else missing.push("distinct author count");

  const d = pct(s.mentions1hPrior, s.mentions1h);
  if (d === null) {
    missing.push("a prior hour to compare against");
    return { role: "SOCIAL", stance: "NEUTRAL", statement: "Social mentions exist but no prior hour is stored, so acceleration cannot be measured.", basis, missing, confidence: "POSSIBLE" };
  }
  basis.push(`mentions ${fmtPct(d)} versus the prior hour`);
  const stance: FindingStance = d >= 0.75 ? "SUPPORTING" : d <= -0.5 ? "CONTRADICTING" : "NEUTRAL";
  return {
    role: "SOCIAL",
    stance,
    statement:
      stance === "SUPPORTING" ? "Social attention is accelerating." : stance === "CONTRADICTING" ? "Social attention is fading." : "Social attention is steady.",
    basis,
    missing,
    confidence: missing.length ? "POSSIBLE" : "HIGH CONFIDENCE",
  };
}

export function riskAgent(input: AnalysisInput): AgentFinding {
  const basis: string[] = [];
  const missing: string[] = [];
  const now = input.now ?? Date.now();
  let risk = 0;

  if (input.memeVerdict === "UNKNOWN") {
    basis.push("the meme classifier could not reach a verdict, so this token is not in the research universe");
    risk++;
  }

  if (input.pairCreatedAt !== null) {
    const ageH = (now - input.pairCreatedAt) / HOUR;
    basis.push(`pair age ${ageH < 48 ? `${Math.round(ageH)} hours` : `${Math.round(ageH / 24)} days`}`);
    if (ageH < 24) risk++;
  } else missing.push("pair creation time");

  const l = input.latest;
  if (l?.liquidityUsd !== null && l?.liquidityUsd !== undefined) {
    basis.push(`liquidity $${Math.round(l.liquidityUsd).toLocaleString()}`);
    if (l.liquidityUsd < 15_000) risk++;
    if (l.marketCapUsd !== null && l.liquidityUsd > 0) {
      const ratio = l.marketCapUsd / l.liquidityUsd;
      basis.push(`market cap is ${ratio.toFixed(1)}x liquidity`);
      if (ratio > 50) risk++;
    } else missing.push("market cap for the liquidity ratio");
  } else missing.push("liquidity");

  if (input.chain?.topHolderSharePct !== null && input.chain?.topHolderSharePct !== undefined) {
    if (input.chain.topHolderSharePct >= 25) {
      basis.push(`holder concentration ${input.chain.topHolderSharePct.toFixed(1)}%`);
      risk++;
    }
  } else missing.push("holder concentration");

  if (!basis.length) return unavailable("TOKEN/RISK", missing, "Not enough token data is stored to assess risk.");

  const stance: FindingStance = risk >= 2 ? "CONTRADICTING" : risk === 1 ? "NEUTRAL" : "SUPPORTING";
  return {
    role: "TOKEN/RISK",
    stance,
    statement:
      stance === "CONTRADICTING"
        ? `${risk} independent risk conditions are present.`
        : stance === "NEUTRAL"
          ? "One risk condition is present."
          : "No measured risk condition is present in the stored data.",
    basis,
    missing,
    confidence: missing.length ? "POSSIBLE" : "HIGH CONFIDENCE",
  };
}

export function historicalAgent(input: AnalysisInput): AgentFinding {
  const a = input.analogs;
  if (!a || a.sampleSize === 0)
    return unavailable("HISTORICAL", ["resolved historical analogs"], "No comparable historical setups have been resolved yet, so no analog evidence exists.");
  const basis = [`${a.sampleSize} resolved analogs in memory`];
  const missing: string[] = [];
  if (!a.includesFailures) missing.push("failed and abandoned candidates (sample may be survivorship-biased)");
  if (a.survivedPct !== null) basis.push(`${Math.round(a.survivedPct * 100)}% of analogs survived the measured horizon`);
  else missing.push("survival rate");
  if (a.medianOutcomePct !== null) basis.push(`median analog outcome ${fmtPct(a.medianOutcomePct)}`);
  else missing.push("median outcome");

  if (a.sampleSize < 10)
    return { role: "HISTORICAL", stance: "NEUTRAL", statement: "The analog sample is too small to carry weight.", basis, missing, confidence: "POSSIBLE" };

  const stance: FindingStance =
    a.survivedPct !== null && a.survivedPct >= 0.5 ? "SUPPORTING" : a.survivedPct !== null && a.survivedPct < 0.3 ? "CONTRADICTING" : "NEUTRAL";
  return {
    role: "HISTORICAL",
    stance,
    statement:
      stance === "SUPPORTING"
        ? "Comparable historical setups more often than not survived."
        : stance === "CONTRADICTING"
          ? "Comparable historical setups mostly failed."
          : "Historical analogs are inconclusive.",
    basis,
    missing,
    confidence: a.includesFailures ? "HIGH CONFIDENCE" : "POSSIBLE",
  };
}

export const AGENTS: ((input: AnalysisInput) => AgentFinding)[] = [
  marketAgent,
  onChainAgent,
  traderAgent,
  socialAgent,
  riskAgent,
  historicalAgent,
];

/* --------------------------------------------------------------- synthesis -- */

/**
 * RESEARCH AGENT. Combines findings while preserving every dimension: support,
 * contradiction, unknowns and what would change the assessment. It never
 * produces a trade instruction.
 */
export function researchAgent(input: AnalysisInput): DecisionSupport {
  const findings = AGENTS.map((a) => a(input));
  const supporting: string[] = [];
  const contradicting: string[] = [];
  const unknown: string[] = [];

  for (const f of findings) {
    const prefix = `${f.role}: `;
    if (f.stance === "SUPPORTING") supporting.push(prefix + f.statement);
    if (f.stance === "CONTRADICTING") contradicting.push(prefix + f.statement);
    if (f.stance === "UNAVAILABLE") unknown.push(prefix + f.statement);
    for (const m of f.missing) unknown.push(`${f.role}: missing ${m}`);
  }

  const answered = findings.filter((f) => f.stance !== "UNAVAILABLE");
  const disagreement = supporting.length > 0 && contradicting.length > 0;
  const riskFinding = findings.find((f) => f.role === "TOKEN/RISK");

  let state: ResearchState;
  if (input.memeVerdict !== "MEME") state = "INSUFFICIENT DATA";
  else if (answered.length < 2) state = "INSUFFICIENT DATA";
  else if (riskFinding?.stance === "CONTRADICTING" && supporting.length === 0) state = "REJECTED — RISK";
  else if (contradicting.length > supporting.length) state = "DETERIORATING";
  else if (supporting.length === 0) state = "WATCH";
  else if (disagreement || unknown.length >= 3) state = "INTERESTING — HIGH UNCERTAINTY";
  else state = "INTERESTING — EVIDENCE ALIGNED";

  const whatWouldChangeIt: string[] = [];
  if (findings.find((f) => f.role === "ON-CHAIN")?.stance === "UNAVAILABLE")
    whatWouldChangeIt.push("An on-chain read of holders, concentration and mint authority.");
  if (findings.find((f) => f.role === "SOCIAL")?.stance === "UNAVAILABLE")
    whatWouldChangeIt.push("Authorised social data showing whether attention is accelerating.");
  if (findings.find((f) => f.role === "TRADER")?.stance === "UNAVAILABLE")
    whatWouldChangeIt.push("Independent wallet activity from tracked traders.");
  if (input.wallets.some((w) => !w.verified))
    whatWouldChangeIt.push("On-chain verification of the reported wallet trades.");
  if (findings.find((f) => f.role === "MARKET")?.stance === "SUPPORTING")
    whatWouldChangeIt.push("Liquidity or volume reversing would remove the market support.");
  if (input.chain?.topHolderSharePct !== null && input.chain?.topHolderSharePct !== undefined && input.chain.topHolderSharePct >= 25)
    whatWouldChangeIt.push("Holder concentration falling as supply distributes.");
  if (!input.analogs || input.analogs.sampleSize < 10)
    whatWouldChangeIt.push("More resolved analogs, including failures, so historical evidence carries weight.");

  const first = input.wallets[0];
  const observation = first
    ? `${first.wallet ?? "an unidentified wallet"} ${first.action === "BUY" ? "bought" : first.action === "SELL" ? "sold" : "traded"} ${input.tokenLabel} per ${first.source}${first.verified ? " (verified on-chain)" : " (not independently verified)"}.`
    : `${input.tokenLabel} is under observation from stored market data only.`;

  return {
    tokenLabel: input.tokenLabel,
    observation,
    supporting,
    contradicting,
    unknown,
    findings,
    state,
    disagreement,
    whatWouldChangeIt,
    executionAllowed: false,
    producedAt: input.now ?? Date.now(),
  };
}
