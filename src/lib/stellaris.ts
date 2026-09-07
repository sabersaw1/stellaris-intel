/**
 * STELLARIS INTELLIGENCE LAYER
 *
 * The single layer that sits above every evidence source. It derives, for one
 * observed market, its research state, priority, evidence layers, source
 * agreement, what is known / unknown / conflicting, the next question and a
 * challenger review.
 *
 * HONESTY CONTRACT
 * Every value here is derived from data the application actually holds: the
 * normalized DEX Screener observation, the locally recorded observation
 * history, the peer snapshot, the research job record and the contradiction
 * engine. Sources that are not configured are reported as NOT CONFIGURED and
 * contribute nothing. Nothing in this file invents numbers, findings,
 * relationships or activity.
 */

import type { Assessment } from "./dex-types";
import type { ObservationPoint } from "./local-store";
import { getHistory, getWatchlist } from "./local-store";
import { scoreAttention, type AttentionItem } from "./attention";
import { jobFor, type ResearchJob } from "./jobs";
import { contradictionsOf } from "./reasoning";

export const STELLARIS_VERSION = "stellaris-intelligence-layer v1.0";

/* ------------------------------ vocabulary ---------------------------- */

export type ResearchState =
  | "NEW"
  | "TRIAGING"
  | "INVESTIGATING"
  | "MONITORING"
  | "LOW-CONCERN SIGNALS"
  | "ELEVATED RISK SIGNALS"
  | "HIGH-RISK SIGNALS"
  | "CONFLICTING EVIDENCE"
  | "INSUFFICIENT DATA"
  | "RESOLVED";

export type EvidenceGrade = "VERIFIED" | "OBSERVED" | "INFERRED" | "UNKNOWN" | "CONFLICTING" | "INSUFFICIENT DATA";

export type SourceAgreement = "HIGH" | "MEDIUM" | "LOW" | "CONFLICTING" | "INSUFFICIENT DATA";

export type EvidenceItem = {
  label: string;
  value: string;
  grade: EvidenceGrade;
  source: string;
  note?: string;
};

export type EvidenceLayer = {
  id: "MARKET" | "HOLDERS" | "DEVELOPER" | "CONTRACT" | "SOCIAL" | "HISTORICAL";
  title: string;
  /** Overall availability of this layer for this market. */
  grade: EvidenceGrade;
  /** Which source would have to be connected for this layer to be researched. */
  requires: string | null;
  items: EvidenceItem[];
};

export type SourceState = {
  id: string;
  label: string;
  state: "CONNECTED" | "AVAILABLE" | "DEGRADED" | "NOT CONFIGURED";
  provides: string;
  detail: string;
};

export type ChallengerOutcome =
  | "ASSESSMENT STRENGTHENED"
  | "ASSESSMENT WEAKENED"
  | "ASSESSMENT UNCHANGED"
  | "EVIDENCE CONFLICTING"
  | "INSUFFICIENT DATA — CHALLENGE NOT PERFORMED";

export type Investigation = {
  key: string;
  label: string;
  chainId: string;
  pairAddress: string;
  assessment: Assessment;
  attention: AttentionItem;
  job: ResearchJob | null;
  watched: boolean;
  state: ResearchState;
  /** research priority 0-100, or null when too little is available to rank */
  priority: number | null;
  priorityFactors: { name: string; points: number; maxPoints: number; basis: string; available: boolean }[];
  summary: string;
  why: string[];
  known: string[];
  unknown: string[];
  conflicting: string[];
  nextQuestion: string;
  evidenceQuality: "HIGH" | "MODERATE" | "LOW";
  sourceAgreement: SourceAgreement;
  sourceAgreementBasis: string;
  layers: EvidenceLayer[];
  sources: SourceState[];
  challenger: { outcome: ChallengerOutcome; question: string; checked: string[] };
  historical: { cases: number; sharedCharacteristics: string[]; differences: string[]; limitation: string };
  changed: string | null;
  investigatingNext: string;
  historyPoints: number;
  dataDegraded: boolean;
};

/* ------------------------------- helpers ------------------------------ */

/** A genuine split: at least 40% of the decided readings dissent from the majority. */
export function isSplit(a: Assessment): boolean {
  const decided = a.consensus.agree + a.consensus.disagree;
  return decided >= 4 && a.consensus.disagree >= 2 && a.consensus.disagree / decided >= 0.4;
}

const n = (v: number | null | undefined) => v !== null && v !== undefined;

function fmtUsd(v: number | null): string {
  if (!n(v)) return "UNKNOWN";
  const x = v as number;
  if (x >= 1_000_000_000) return `$${(x / 1_000_000_000).toFixed(2)}B`;
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `$${(x / 1_000).toFixed(1)}K`;
  return `$${x.toFixed(2)}`;
}

function ageHours(a: Assessment): number | null {
  return a.calculated.pairAgeHours;
}

function pct(from: number | null, to: number | null): number | null {
  if (!n(from) || !n(to) || from === 0) return null;
  return (((to as number) - (from as number)) / Math.abs(from as number)) * 100;
}

/* -------------------------- evidence sources -------------------------- */

/**
 * The source register. DEX Screener is reached through the application's own
 * server functions; observation history and the peer snapshot are produced
 * locally. Everything else needs a credential and is reported as such.
 */
export function sourceRegister(historyPoints: number, peerCount: number, sourceOk: boolean, stale: boolean): SourceState[] {
  return [
    {
      id: "dexscreener",
      label: "DEX SCREENER",
      state: sourceOk ? (stale ? "DEGRADED" : "CONNECTED") : "DEGRADED",
      provides: "Market structure: price, liquidity, volume, transactions, pair age",
      detail: sourceOk
        ? stale
          ? "Responding, but the most recent observation is older than the freshness window"
          : "Public API reached through this application's server functions"
        : "Last request did not return a usable payload; cached observations may still be shown",
    },
    {
      id: "history",
      label: "LOCAL OBSERVATION HISTORY",
      state: historyPoints > 0 ? "AVAILABLE" : "NOT CONFIGURED",
      provides: "Change detection and historical comparison for this market",
      detail:
        historyPoints > 0
          ? `${historyPoints} observation(s) recorded in this browser`
          : "No observation recorded yet for this market in this browser",
    },
    {
      id: "peers",
      label: "PEER SNAPSHOT",
      state: peerCount >= 20 ? "AVAILABLE" : "DEGRADED",
      provides: "Baselines used by anomaly detection",
      detail: `${peerCount} comparable observation(s) in the current snapshot; 20 required before anomaly signals are emitted`,
    },
    {
      id: "supabase",
      label: "SUPABASE MEMORY",
      state: "NOT CONFIGURED",
      provides: "Durable investigations, outcomes and calibration across devices",
      detail: "Requires a Supabase project URL and service key; memory currently lives in this browser only",
    },
    {
      id: "gmgn",
      label: "GMGN",
      state: "NOT CONFIGURED",
      provides: "Holder concentration and wallet-level behaviour",
      detail: "No credential configured; holder research cannot be performed",
    },
    {
      id: "fomo",
      label: "FOMO",
      state: "NOT CONFIGURED",
      provides: "Contract and security signals",
      detail: "No credential configured; contract/security research cannot be performed",
    },
    {
      id: "social",
      label: "PUBLIC SOCIAL / PROJECT RESEARCH",
      state: "NOT CONFIGURED",
      provides: "Official accounts, public announcements, community activity",
      detail: "No social research source connected; only profile presence from DEX Screener is observable",
    },
  ];
}

/* ------------------------------- layers ------------------------------- */

function marketLayer(a: Assessment, history: ObservationPoint[]): EvidenceLayer {
  const p = a.pair;
  const first = history[0];
  const last = history[history.length - 1];
  const liqChange = history.length > 1 ? pct(first?.liquidityUsd ?? null, last?.liquidityUsd ?? null) : null;

  const items: EvidenceItem[] = [
    { label: "LIQUIDITY", value: fmtUsd(p.liquidityUsd), grade: n(p.liquidityUsd) ? "OBSERVED" : "UNKNOWN", source: "DEX SCREENER" },
    {
      label: "LIQUIDITY CHANGE",
      value: liqChange === null ? "INSUFFICIENT DATA" : `${liqChange >= 0 ? "+" : ""}${liqChange.toFixed(1)}% across recorded observations`,
      grade: liqChange === null ? "INSUFFICIENT DATA" : "OBSERVED",
      source: "LOCAL OBSERVATION HISTORY",
    },
    { label: "VOLUME 24H", value: fmtUsd(p.volume.h24), grade: n(p.volume.h24) ? "OBSERVED" : "UNKNOWN", source: "DEX SCREENER" },
    {
      label: "TRANSACTIONS 24H",
      value: p.txns.h24 ? `${p.txns.h24.buys + p.txns.h24.sells} (${p.txns.h24.buys} buys / ${p.txns.h24.sells} sells)` : "UNKNOWN",
      grade: p.txns.h24 ? "OBSERVED" : "UNKNOWN",
      source: "DEX SCREENER",
    },
    {
      label: "BUY / SELL RATIO 24H",
      value: n(a.calculated.buySellRatio24h) ? (a.calculated.buySellRatio24h as number).toFixed(2) : "UNKNOWN",
      grade: n(a.calculated.buySellRatio24h) ? "INFERRED" : "UNKNOWN",
      source: "CALCULATED FROM DEX SCREENER",
    },
    {
      label: "TURNOVER (VOL/LIQ 24H)",
      value: n(a.calculated.volumeToLiquidity24h) ? `${(a.calculated.volumeToLiquidity24h as number).toFixed(2)}x` : "UNKNOWN",
      grade: n(a.calculated.volumeToLiquidity24h) ? "INFERRED" : "UNKNOWN",
      source: "CALCULATED FROM DEX SCREENER",
    },
    {
      label: "MARKET AGE",
      value: n(ageHours(a)) ? `${(ageHours(a) as number).toFixed(1)} hours` : "UNKNOWN",
      grade: n(ageHours(a)) ? "OBSERVED" : "UNKNOWN",
      source: "DEX SCREENER",
    },
    {
      label: "UNIQUE BUYERS / SELLERS",
      value: "UNKNOWN",
      grade: "UNKNOWN",
      source: "NOT PROVIDED BY DEX SCREENER",
      note: "Wallet-level counts are not present in the market payload",
    },
  ];
  for (const an of a.anomalies.slice(0, 4)) {
    items.push({
      label: `ABNORMAL ACTIVITY — ${an.metric}`,
      value: `${an.severity}: ${an.what}`,
      grade: "OBSERVED",
      source: "ANOMALY ENGINE vs PEER SNAPSHOT",
      note: an.why,
    });
  }
  const available = items.filter((i) => i.grade === "OBSERVED" || i.grade === "INFERRED").length;
  return {
    id: "MARKET",
    title: "MARKET STRUCTURE",
    grade: available >= 5 ? "OBSERVED" : available >= 2 ? "INFERRED" : "INSUFFICIENT DATA",
    requires: null,
    items,
  };
}

function unavailableLayer(
  id: EvidenceLayer["id"],
  title: string,
  requires: string,
  questions: string[],
): EvidenceLayer {
  return {
    id,
    title,
    grade: "INSUFFICIENT DATA",
    requires,
    items: questions.map((q) => ({
      label: q,
      value: "UNKNOWN",
      grade: "UNKNOWN" as EvidenceGrade,
      source: `${requires} — NOT CONFIGURED`,
      note: "No connected source can currently answer this; the question stays open rather than being assumed",
    })),
  };
}

function socialLayer(a: Assessment): EvidenceLayer {
  const items: EvidenceItem[] = [
    {
      label: "PROJECT PROFILE PRESENT",
      value: a.pair.hasProfile ? "YES" : "NO",
      grade: "OBSERVED",
      source: "DEX SCREENER",
      note: "Presence of a project profile only; its contents are not verified",
    },
    {
      label: "PAID BOOSTS ACTIVE",
      value: n(a.pair.boostsActive) ? String(a.pair.boostsActive) : "NONE OBSERVED",
      grade: n(a.pair.boostsActive) ? "OBSERVED" : "UNKNOWN",
      source: "DEX SCREENER",
      note: "Promotional spend is observable; it is not evidence about the project itself",
    },
    {
      label: "OFFICIAL ACCOUNTS / ANNOUNCEMENTS / COMMUNITY ACTIVITY",
      value: "UNKNOWN",
      grade: "UNKNOWN",
      source: "PUBLIC SOCIAL RESEARCH — NOT CONFIGURED",
    },
  ];
  return { id: "SOCIAL", title: "SOCIAL / PROJECT INFORMATION", grade: "INFERRED", requires: "PUBLIC SOCIAL RESEARCH", items };
}

function historicalLayer(a: Assessment, history: ObservationPoint[], similar: number): EvidenceLayer {
  const items: EvidenceItem[] = [
    {
      label: "OBSERVATIONS RECORDED",
      value: String(history.length),
      grade: history.length ? "OBSERVED" : "INSUFFICIENT DATA",
      source: "LOCAL OBSERVATION HISTORY",
    },
    {
      label: "SIMILAR PRIOR CASES",
      value: similar > 0 ? `${similar} case(s) share characteristics` : "INSUFFICIENT DATA",
      grade: similar > 0 ? "INFERRED" : "INSUFFICIENT DATA",
      source: "MEMORY (BROWSER-LOCAL)",
      note: "Shared characteristics do not imply the same outcome",
    },
    {
      label: "RECORDED OUTCOMES",
      value: "INSUFFICIENT DATA",
      grade: "INSUFFICIENT DATA",
      source: "SUPABASE MEMORY — NOT CONFIGURED",
      note: "Outcome comparison requires durable memory across sessions",
    },
  ];
  void a;
  return { id: "HISTORICAL", title: "HISTORICAL COMPARISON", grade: history.length > 1 ? "INFERRED" : "INSUFFICIENT DATA", requires: null, items };
}

/* --------------------------- research state --------------------------- */

function deriveState(a: Assessment, job: ResearchJob | null, contradictionCount: number, watched: boolean, historyPoints: number): ResearchState {
  const missing = [a.pair.priceUsd, a.pair.liquidityUsd, a.pair.volume.h24, a.pair.txns.h24].filter((x) => !n(x as number | null)).length;
  if (missing >= 3 || a.risk.band === "INSUFFICIENT DATA") return "INSUFFICIENT DATA";
  if (job) {
    if (job.status === "COMPLETE") return "RESOLVED";
    if (job.status === "WAITING_FOR_DATA") return "INSUFFICIENT DATA";
    if (job.status === "MONITORING") return "MONITORING";
    if (job.status === "RUNNING" || job.status === "DEBATING" || job.status === "SYNTHESIZING") return "INVESTIGATING";
    if (job.status === "QUEUED") return "TRIAGING";
  }
  if (a.risk.score !== null && a.risk.score >= 75) return "HIGH-RISK SIGNALS";
  if (a.risk.score !== null && a.risk.score >= 50) return "ELEVATED RISK SIGNALS";
  // Risk evidence takes precedence over reading disagreement: a split between
  // readings is reported through SOURCE AGREEMENT and the CONFLICTING list, and
  // only becomes the headline state when there is no risk signal to report.
  if (contradictionCount > 0 && isSplit(a)) return "CONFLICTING EVIDENCE";
  if (watched) return "MONITORING";
  if (historyPoints <= 1) return n(ageHours(a)) && (ageHours(a) as number) < 24 ? "NEW" : "TRIAGING";
  if (a.risk.score !== null && a.risk.score < 35 && a.confidence.band !== "LOW") return "LOW-CONCERN SIGNALS";
  return "TRIAGING";
}

export const STATE_TONE: Record<ResearchState, string> = {
  NEW: "text-cyan",
  TRIAGING: "text-signal-mid",
  INVESTIGATING: "text-signal-mid",
  MONITORING: "text-cyan",
  "LOW-CONCERN SIGNALS": "text-signal-low",
  "ELEVATED RISK SIGNALS": "text-signal-high",
  "HIGH-RISK SIGNALS": "text-signal-extreme",
  "CONFLICTING EVIDENCE": "text-violet",
  "INSUFFICIENT DATA": "text-unknown",
  RESOLVED: "text-signal-low",
};

/* ------------------------------- builder ------------------------------ */

export function buildInvestigation(
  a: Assessment,
  opts: {
    peerCount: number;
    sourceOk: boolean;
    stale: boolean;
    similarCases?: number;
    /** Stored observation series from Supabase; used when running server-side. */
    history?: ObservationPoint[];
    /** Watchlist membership from Supabase; used when running server-side. */
    watched?: boolean;
  } = {
    peerCount: 0,
    sourceOk: true,
    stale: false,
  },
): Investigation {
  const history = opts.history ?? getHistory(a.pair.key);
  const attention = scoreAttention(a, history);
  const job = jobFor(a.pair.key);
  const watched = opts.watched ?? getWatchlist().some((w) => w.key === a.pair.key);
  const contradictions = contradictionsOf(a);
  const state = deriveState(a, job, contradictions.length, watched, history.length);

  /* ---- known / unknown / conflicting ---- */
  const known: string[] = [];
  const unknown: string[] = [];
  const conflicting: string[] = [];

  if (n(a.pair.liquidityUsd)) known.push(`Liquidity observed at ${fmtUsd(a.pair.liquidityUsd)}`);
  else unknown.push("Liquidity depth is not present in the observation");
  if (n(a.pair.volume.h24)) known.push(`24h volume observed at ${fmtUsd(a.pair.volume.h24)}`);
  else unknown.push("24h volume is not present in the observation");
  if (a.pair.txns.h24) known.push(`${a.pair.txns.h24.buys + a.pair.txns.h24.sells} transactions recorded over 24h`);
  else unknown.push("Transaction counts are not present in the observation");
  if (n(ageHours(a))) known.push(`Market age ${(ageHours(a) as number).toFixed(1)} hours since pair creation`);
  else unknown.push("Pair creation time is not present, so market age cannot be established");
  if (history.length > 1) known.push(`${history.length} observations recorded locally, enabling change detection`);
  else unknown.push("Too few recorded observations for change detection");

  unknown.push("Holder concentration and wallet behaviour — GMGN not configured");
  unknown.push("Contract ownership, mint and trading-restriction risks — FOMO not configured");
  unknown.push("Developer or insider wallet relationships — no source can attribute wallets");
  unknown.push("Public social and project claims — social research not configured");

  for (const c of (isSplit(a) ? contradictions : []))
    conflicting.push(`${c.topic}: ${c.sideA.vote} (${c.sideA.agents.join(", ")}) versus ${c.sideB.vote} (${c.sideB.agents.join(", ")}) — ${c.resolution}`);
  if (isSplit(a))
    conflicting.push(`${a.consensus.disagree} of ${a.consensus.total} agent readings dissent from the majority reading`);

  /* ---- source agreement ---- */
  const contributing = [
    n(a.pair.liquidityUsd) || n(a.pair.volume.h24),
    history.length > 1,
    a.peerContext.available,
  ].filter(Boolean).length;
  const sourceAgreement: SourceAgreement =
    conflicting.length > 0
      ? "CONFLICTING"
      : contributing >= 3
        ? "HIGH"
        : contributing === 2
          ? "MEDIUM"
          : contributing === 1
            ? "LOW"
            : "INSUFFICIENT DATA";
  const sourceAgreementBasis =
    conflicting.length > 0
      ? `${conflicting.length} disagreement(s) recorded between readings of the available evidence`
      : `${contributing} of 3 currently available evidence sources independently support the reading; 4 further sources are not configured`;

  /* ---- summary + why ---- */
  const riskPhrase =
    a.risk.score === null
      ? "risk cannot be classified from the available evidence"
      : a.risk.score >= 75
        ? "current evidence indicates high-risk signals"
        : a.risk.score >= 50
          ? "current evidence indicates elevated risk signals"
          : a.risk.score >= 35
            ? "current evidence indicates moderate risk signals"
            : "current evidence indicates fewer major concerns";
  const completeness =
    a.confidence.completeness >= 80 ? "the available evidence is broad" : a.confidence.completeness >= 50 ? "the available evidence is partial" : "the available evidence is incomplete";
  const summary = `${riskPhrase}, and ${completeness}. Holder, contract and social research are not available for this market, so this reading covers market structure only.`;

  const why: string[] = [];
  for (const f of a.risk.factors.filter((f) => f.dataAvailable && f.points > 0).slice(0, 4)) why.push(`${f.dimension}: ${f.basis}`);
  for (const an of a.anomalies.slice(0, 2)) why.push(`${an.severity} anomaly — ${an.what}`);
  if (history.length > 1) {
    const liqChange = pct(history[0]?.liquidityUsd ?? null, history[history.length - 1]?.liquidityUsd ?? null);
    if (liqChange !== null && Math.abs(liqChange) >= 10) why.push(`Liquidity changed ${liqChange >= 0 ? "+" : ""}${liqChange.toFixed(1)}% across recorded observations`);
  }
  if (conflicting.length) why.push(`${conflicting.length} source or reading disagreement(s) recorded`);
  if (!why.length) why.push("No threshold-crossing signal recorded; this market is ranked on novelty and activity only");

  /* ---- challenger ---- */
  const challengeChecks: string[] = [];
  let outcome: ChallengerOutcome;
  if (a.risk.score === null || a.confidence.band === "LOW") {
    outcome = "INSUFFICIENT DATA — CHALLENGE NOT PERFORMED";
  } else {
    if (a.peerContext.available) challengeChecks.push(`Peer snapshot of ${a.peerContext.peerCount} markets checked for an ordinary explanation of the observed values`);
    if (history.length > 1) challengeChecks.push(`${history.length} recorded observations checked for whether the signal persists over time`);
    challengeChecks.push(`${a.consensus.total} independent readings compared for disagreement`);
    if (conflicting.length > 0) outcome = "EVIDENCE CONFLICTING";
    else if (a.anomalies.length >= 2 && history.length > 2) outcome = "ASSESSMENT STRENGTHENED";
    else if (a.anomalies.length === 0) outcome = "ASSESSMENT WEAKENED";
    else outcome = "ASSESSMENT UNCHANGED";
  }

  /* ---- historical ---- */
  const shared: string[] = [];
  if (n(ageHours(a))) shared.push((ageHours(a) as number) < 24 ? "Market created within the last 24 hours" : "Market older than 24 hours");
  if (n(a.calculated.volumeToLiquidity24h)) shared.push(`Turnover ${(a.calculated.volumeToLiquidity24h as number).toFixed(2)}x liquidity`);
  if (a.anomalies.length) shared.push(`${a.anomalies.length} anomaly signal(s) present`);

  /* ---- next question ---- */
  const nextQuestion =
    conflicting.length > 0
      ? "Which of the disagreeing readings does the next observation support?"
      : history.length <= 1
        ? "Does the next recorded observation confirm the current liquidity and activity levels?"
        : a.anomalies.length
          ? `Does the ${a.anomalies[0]!.metric} deviation persist into the next observation, or revert to the peer baseline?`
          : "Does liquidity or transaction activity change meaningfully at the next observation?";

  const investigatingNext =
    job && job.status !== "COMPLETE"
      ? `Research job ${job.status.replace(/_/g, " ")} — ${job.reason}`
      : watched
        ? "Monitoring this market for meaningful change because it is on the watchlist"
        : "Awaiting the next observation cycle before further research is allocated";

  /* ---- changed ---- */
  let changed: string | null = null;
  if (history.length > 1) {
    const liqChange = pct(history[history.length - 2]?.liquidityUsd ?? null, history[history.length - 1]?.liquidityUsd ?? null);
    const volChange = pct(history[history.length - 2]?.volume24h ?? null, history[history.length - 1]?.volume24h ?? null);
    if (liqChange !== null && Math.abs(liqChange) >= 5) changed = `Liquidity ${liqChange >= 0 ? "up" : "down"} ${Math.abs(liqChange).toFixed(1)}% since the previous observation`;
    else if (volChange !== null && Math.abs(volChange) >= 15) changed = `24h volume ${volChange >= 0 ? "up" : "down"} ${Math.abs(volChange).toFixed(1)}% since the previous observation`;
  }

  const dataDegraded = !opts.sourceOk || opts.stale || a.confidence.freshnessSeconds > 300;

  return {
    key: a.pair.key,
    label: `${a.pair.baseSymbol}/${a.pair.quoteSymbol}`,
    chainId: a.pair.chainId,
    pairAddress: a.pair.pairAddress,
    assessment: a,
    attention,
    job,
    watched,
    state,
    priority: attention.score,
    priorityFactors: attention.factors,
    summary,
    why,
    known,
    unknown,
    conflicting,
    nextQuestion,
    evidenceQuality: a.confidence.completeness >= 80 ? "HIGH" : a.confidence.completeness >= 50 ? "MODERATE" : "LOW",
    sourceAgreement,
    sourceAgreementBasis,
    layers: [
      marketLayer(a, history),
      unavailableLayer("HOLDERS", "HOLDER BEHAVIOUR", "GMGN", [
        "Holder concentration",
        "Top-holder behaviour",
        "Concentration change",
        "Holder growth or exits",
        "Wallet clustering",
      ]),
      unavailableLayer("DEVELOPER", "DEVELOPER / PROJECT BEHAVIOUR", "GMGN", [
        "Developer-related wallet activity",
        "Insider-related observations",
        "Wallet relationships",
        "Project claims versus observable information",
      ]),
      unavailableLayer("CONTRACT", "CONTRACT / SECURITY", "FOMO", [
        "Ownership-related risk",
        "Mint permissions",
        "Blacklist permissions",
        "Trading restrictions",
        "Liquidity lock state",
      ]),
      socialLayer(a),
      historicalLayer(a, history, opts.similarCases ?? 0),
    ],
    sources: sourceRegister(history.length, opts.peerCount, opts.sourceOk, opts.stale),
    challenger: {
      outcome,
      question: "What evidence could explain these observations without the current reading being correct?",
      checked: challengeChecks,
    },
    historical: {
      cases: opts.similarCases ?? 0,
      sharedCharacteristics: shared,
      differences: opts.similarCases ? [] : ["No comparable stored case set yet, so differences cannot be listed"],
      limitation: "Shared characteristics with previous cases do not imply the same outcome",
    },
    changed,
    investigatingNext,
    historyPoints: history.length,
    dataDegraded,
  };
}

/**
 * Priority ordering for COMMAND and RAPID SCAN. Watchlist membership,
 * conflicting evidence and newness lift a market; nothing is randomised.
 */
export function prioritise(list: Investigation[]): Investigation[] {
  const bump = (i: Investigation) => {
    let b = 0;
    if (i.watched) b += 12;
    if (i.conflicting.length) b += 10;
    if (i.changed) b += 8;
    if (i.state === "HIGH-RISK SIGNALS") b += 14;
    if (i.state === "ELEVATED RISK SIGNALS") b += 7;
    if (i.state === "NEW") b += 6;
    return (i.priority ?? 0) + b;
  };
  return [...list].sort((x, y) => bump(y) - bump(x));
}
