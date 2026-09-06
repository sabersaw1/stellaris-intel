/**
 * REASONING LAYER
 *
 * Debate, contradiction, minority opinion, hypotheses, falsification criteria
 * and change explanation — all derived from the deterministic engines and from
 * observations this terminal actually recorded. No agent statement here is
 * generated text: each one is the agent's own observation list, its vote and the
 * supporting values it read. Nothing is asserted without a data basis.
 */

import type { AgentObservation, Assessment } from "./dex-types";
import type { ObservationPoint } from "./local-store";

/* ------------------------------- debate ------------------------------- */

export type Statement = {
  agentId: string;
  agentNumber: string;
  name: string;
  vote: AgentObservation["vote"];
  confidence: number;
  claims: string[];
  warnings: string[];
  support: { label: string; value: string }[];
  ranAt: number;
};

export type Contradiction = {
  topic: string;
  sideA: { vote: string; agents: string[]; basis: string[] };
  sideB: { vote: string; agents: string[]; basis: string[] };
  resolution: string;
};

export type MinorityOpinion = {
  vote: string;
  agents: string[];
  share: string;
  basis: string[];
  note: string;
};

export type Hypothesis = {
  statement: string;
  supportedBy: string[];
  supportPoints: number;
  againstPoints: number;
  standing: "SUPPORTED BY OBSERVATIONS" | "CONTESTED" | "UNSUPPORTED" | "INSUFFICIENT DATA";
  wouldChangeOurMind: string[];
};

export function statementsOf(a: Assessment): Statement[] {
  return a.agents.map((g) => ({
    agentId: g.agentId,
    agentNumber: g.agentNumber,
    name: g.name,
    vote: g.vote,
    confidence: g.confidence,
    claims: g.observations,
    warnings: g.warnings,
    support: g.supportingData,
    ranAt: g.ranAt,
  }));
}

export function contradictionsOf(a: Assessment): Contradiction[] {
  const by = (v: AgentObservation["vote"]) => a.agents.filter((g) => g.vote === v);
  const elevated = by("ELEVATED");
  const contained = by("CONTAINED");
  const out: Contradiction[] = [];

  if (elevated.length && contained.length) {
    out.push({
      topic: "OBSERVED RISK DIRECTION",
      sideA: {
        vote: "ELEVATED",
        agents: elevated.map((g) => `${g.agentNumber} ${g.name}`),
        basis: elevated.flatMap((g) => g.observations).slice(0, 4),
      },
      sideB: {
        vote: "CONTAINED",
        agents: contained.map((g) => `${g.agentNumber} ${g.name}`),
        basis: contained.flatMap((g) => g.observations).slice(0, 4),
      },
      resolution:
        elevated.length === contained.length
          ? "UNRESOLVED — the agent suite is evenly split on the observed evidence"
          : `LEANS ${elevated.length > contained.length ? "ELEVATED" : "CONTAINED"} — ${Math.max(elevated.length, contained.length)} of ${a.agents.length} agents`,
    });
  }

  const insufficient = by("INSUFFICIENT DATA");
  if (insufficient.length && (elevated.length || contained.length)) {
    out.push({
      topic: "DATA SUFFICIENCY",
      sideA: {
        vote: "READ THE DATA",
        agents: [...elevated, ...contained].map((g) => `${g.agentNumber} ${g.name}`),
        basis: ["These agents found enough fields populated to form a view"],
      },
      sideB: {
        vote: "INSUFFICIENT DATA",
        agents: insufficient.map((g) => `${g.agentNumber} ${g.name}`),
        basis: insufficient.flatMap((g) => g.warnings).slice(0, 4),
      },
      resolution: `${insufficient.length} of ${a.agents.length} agents could not evaluate their dimension — treat the aggregate view as partial`,
    });
  }

  return out;
}

export function minorityOf(a: Assessment): MinorityOpinion | null {
  const groups = new Map<string, AgentObservation[]>();
  for (const g of a.agents) {
    const list = groups.get(g.vote) ?? [];
    list.push(g);
    groups.set(g.vote, list);
  }
  const sorted = [...groups.entries()].sort((x, y) => y[1].length - x[1].length);
  if (sorted.length < 2) return null;
  const minority = sorted[sorted.length - 1]!;
  if (minority[1].length === 0) return null;
  return {
    vote: minority[0],
    agents: minority[1].map((g) => `${g.agentNumber} ${g.name}`),
    share: `${minority[1].length} of ${a.agents.length} agents`,
    basis: minority[1].flatMap((g) => [...g.observations, ...g.warnings]).slice(0, 5),
    note: "A minority reading is preserved, not discarded. It may be the correct one.",
  };
}

export function hypothesesOf(a: Assessment): Hypothesis[] {
  const out: Hypothesis[] = [];
  const c = a.calculated;
  const factorPoints = (dim: string) =>
    a.risk.factors.find((f) => f.dimension.toUpperCase().includes(dim))?.points ?? 0;

  // Liquidity-thinness hypothesis
  if (a.pair.liquidityUsd !== null) {
    const support: string[] = [];
    if (a.pair.liquidityUsd < 50_000) support.push(`liquidity ${Math.round(a.pair.liquidityUsd).toLocaleString()} USD`);
    if (c.volumeToLiquidity24h !== null && c.volumeToLiquidity24h > 3)
      support.push(`turnover ${c.volumeToLiquidity24h.toFixed(2)}x liquidity in 24h`);
    if (c.liquidityPerTxn !== null && c.liquidityPerTxn < 50)
      support.push(`liquidity per 24h transaction ${c.liquidityPerTxn.toFixed(1)} USD`);
    out.push({
      statement: "Price on this pair can be moved by comparatively small order flow",
      supportedBy: support,
      supportPoints: support.length,
      againstPoints: a.pair.liquidityUsd > 500_000 ? 1 : 0,
      standing:
        support.length >= 2 ? "SUPPORTED BY OBSERVATIONS" : support.length === 1 ? "CONTESTED" : "UNSUPPORTED",
      wouldChangeOurMind: [
        "Liquidity rising and holding above the peer median across several recorded observations",
        "Turnover falling below 1x liquidity while transaction count stays flat",
      ],
    });
  }

  // Structure hypothesis
  if (c.buySellRatio24h !== null) {
    const skewed = c.buySellRatio24h > 1.8 || c.buySellRatio24h < 0.55;
    out.push({
      statement: "24h order flow is one-sided rather than balanced two-way trading",
      supportedBy: [`buy/sell ratio ${c.buySellRatio24h.toFixed(2)}`,
        c.txns24h !== null ? `${c.txns24h.toLocaleString()} transactions observed in 24h` : ""].filter(Boolean),
      supportPoints: skewed ? 2 : 0,
      againstPoints: skewed ? 0 : 1,
      standing: skewed ? "SUPPORTED BY OBSERVATIONS" : "UNSUPPORTED",
      wouldChangeOurMind: ["Buy/sell ratio returning between 0.8 and 1.25 over the next recorded observations"],
    });
  } else {
    out.push({
      statement: "24h order flow direction cannot be characterised",
      supportedBy: ["transaction breakdown missing from the API response"],
      supportPoints: 0,
      againstPoints: 0,
      standing: "INSUFFICIENT DATA",
      wouldChangeOurMind: ["The upstream response including a populated 24h transaction breakdown"],
    });
  }

  // Age / maturity hypothesis
  if (c.pairAgeHours !== null) {
    const young = c.pairAgeHours < 72;
    out.push({
      statement: "This market has no established trading history to compare against",
      supportedBy: [`pair age ${Math.round(c.pairAgeHours)}h`, `${factorPoints("AGE")} risk points assigned to pair age`],
      supportPoints: young ? 2 : 0,
      againstPoints: young ? 0 : 1,
      standing: young ? "SUPPORTED BY OBSERVATIONS" : "UNSUPPORTED",
      wouldChangeOurMind: ["Accumulating recorded observations across a longer window so a baseline exists"],
    });
  }

  return out;
}

/* ---------------------------- what changed ---------------------------- */

export type Change = {
  metric: string;
  from: string;
  to: string;
  delta: string;
  direction: "UP" | "DOWN" | "FLAT";
  window: string;
};

const fmt = (v: number | null, digits = 2) =>
  v === null ? "DATA UNAVAILABLE" : v.toLocaleString(undefined, { maximumFractionDigits: digits });

function change(metric: string, from: number | null, to: number | null, window: string, digits = 2): Change | null {
  if (from === null || to === null) return null;
  const diff = to - from;
  if (from === 0 && diff === 0) return null;
  const pct = from === 0 ? null : (diff / Math.abs(from)) * 100;
  if (pct !== null && Math.abs(pct) < 1) return null;
  return {
    metric,
    from: fmt(from, digits),
    to: fmt(to, digits),
    delta: pct === null ? fmt(diff, digits) : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`,
    direction: diff > 0 ? "UP" : diff < 0 ? "DOWN" : "FLAT",
    window,
  };
}

/** Compares the two most recent observations this terminal recorded. */
export function whatChanged(history: ObservationPoint[]): { changes: Change[]; window: string | null } {
  if (history.length < 2) return { changes: [], window: null };
  const to = history[history.length - 1]!;
  const from = history[history.length - 2]!;
  const seconds = Math.max(1, Math.round((to.t - from.t) / 1000));
  const window = `${seconds}s between recorded observations`;
  const changes = [
    change("PRICE USD", from.priceUsd, to.priceUsd, window, 8),
    change("LIQUIDITY USD", from.liquidityUsd, to.liquidityUsd, window, 0),
    change("VOLUME 24H", from.volume24h, to.volume24h, window, 0),
    change("TRANSACTIONS 24H", from.txns24h, to.txns24h, window, 0),
    change("MARKET CAP", from.marketCap, to.marketCap, window, 0),
    change("RISK SCORE", from.riskScore, to.riskScore, window, 0),
    change("CONFIDENCE", from.confidence, to.confidence, window, 0),
  ].filter((c): c is Change => c !== null);
  return { changes, window };
}

/** Plain explanation of the current risk classification, factor by factor. */
export function whyRisk(a: Assessment): { line: string; detail: string }[] {
  return a.risk.factors
    .slice()
    .sort((x, y) => y.points - x.points)
    .map((f) => ({
      line: f.dataAvailable
        ? `${f.dimension}: ${f.points} of ${f.maxPoints} risk points`
        : `${f.dimension}: not scored — required data unavailable`,
      detail: f.basis,
    }));
}
