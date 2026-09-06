/**
 * ATTENTION ENGINE
 *
 * Decides which observed objects deserve computational attention.
 * Every factor below is computed from data the terminal actually received:
 * the current observation, the calculated metrics, the peer baseline and the
 * observation history this browser has recorded. When an input is missing the
 * factor is marked unavailable and excluded from the score — it is never
 * assumed, defaulted or invented.
 */

import type { Assessment } from "./dex-types";
import { getHistory, type ObservationPoint } from "./local-store";

export type AttentionClass =
  | "NORMAL"
  | "INTERESTING"
  | "IMPORTANT"
  | "UNUSUAL"
  | "HIGH PRIORITY"
  | "CRITICAL";

export type AttentionFactor = {
  name: string;
  points: number;
  maxPoints: number;
  basis: string;
  available: boolean;
};

export type AttentionItem = {
  key: string;
  assessment: Assessment;
  score: number | null;
  klass: AttentionClass;
  factors: AttentionFactor[];
  historyPoints: number;
  reasons: string[];
  scoredAt: number;
};

export const ATTENTION_ENGINE_VERSION = "attention-engine v1.0";

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

function factor(
  name: string,
  points: number | null,
  maxPoints: number,
  basis: string,
): AttentionFactor {
  return {
    name,
    points: points === null ? 0 : clamp(points, maxPoints),
    maxPoints,
    basis,
    available: points !== null,
  };
}

export function scoreAttention(a: Assessment, history?: ObservationPoint[]): AttentionItem {
  const h = history ?? getHistory(a.pair.key);
  const last = h.length ? h[h.length - 1]! : null;
  const prev = h.length > 1 ? h[h.length - 2]! : null;
  const first = h.length ? h[0]! : null;
  const factors: AttentionFactor[] = [];
  const reasons: string[] = [];

  // MAGNITUDE — size of the observed 24h price move
  const move = a.pair.priceChange.h24;
  factors.push(
    factor(
      "MAGNITUDE",
      move === null ? null : Math.abs(move) / 4,
      18,
      move === null ? "24h price change unavailable" : `24h price change ${move.toFixed(2)}%`,
    ),
  );
  if (move !== null && Math.abs(move) >= 40) reasons.push(`24h price moved ${move.toFixed(1)}%`);

  // ABNORMALITY — anomalies already confirmed against the peer baseline
  const severe = a.anomalies.filter((x) => x.severity === "SEVERE").length;
  const unusual = a.anomalies.filter((x) => x.severity === "UNUSUAL").length;
  const abnormal = a.peerContext.available ? severe * 9 + unusual * 5 : null;
  factors.push(
    factor(
      "ABNORMALITY",
      abnormal,
      22,
      a.peerContext.available
        ? `${severe} severe / ${unusual} unusual against ${a.peerContext.peerCount} peers`
        : "no peer baseline yet — anomaly engine idle",
    ),
  );
  if (severe) reasons.push(`${severe} severe anomaly signal${severe > 1 ? "s" : ""}`);

  // RISK — observed risk classification
  factors.push(
    factor(
      "OBSERVED RISK",
      a.risk.score === null ? null : (a.risk.score / 100) * 16,
      16,
      a.risk.score === null ? "risk score not calculable" : `${a.risk.band} (${a.risk.score}/100)`,
    ),
  );

  // NOVELTY — how new this pair is to the market and to this terminal
  const ageHours = a.calculated.pairAgeHours;
  const novelty =
    ageHours === null ? null : ageHours < 24 ? 12 : ageHours < 72 ? 8 : ageHours < 24 * 14 ? 4 : 0;
  factors.push(
    factor(
      "NOVELTY",
      novelty,
      12,
      ageHours === null ? "pair creation time unavailable" : `pair age ${Math.round(ageHours)}h`,
    ),
  );
  if (ageHours !== null && ageHours < 24) reasons.push("pair is less than 24h old");

  // ACCELERATION — change between the two most recent recorded observations
  const accel = prev && last ? pctChange(prev.volume24h, last.volume24h) : null;
  factors.push(
    factor(
      "ACCELERATION",
      accel === null ? null : Math.abs(accel) / 5,
      14,
      accel === null
        ? "fewer than 2 recorded observations"
        : `24h volume changed ${accel.toFixed(1)}% between the last two observations`,
    ),
  );
  if (accel !== null && Math.abs(accel) >= 50)
    reasons.push(`volume accelerating (${accel.toFixed(0)}% between observations)`);

  // PERSISTENCE — how long the signal has been visible in recorded history
  const persistence =
    h.length < 3 ? null : (h.filter((p) => p.anomalyCount > 0).length / h.length) * 10;
  factors.push(
    factor(
      "PERSISTENCE",
      persistence,
      10,
      h.length < 3
        ? "insufficient recorded observations"
        : `${h.filter((p) => p.anomalyCount > 0).length} of ${h.length} recorded observations carried anomalies`,
    ),
  );

  // MARKET RELEVANCE — turnover against liquidity, percentile-ranked when possible
  const vl = a.calculated.volumeToLiquidity24h;
  factors.push(
    factor(
      "TURNOVER RELEVANCE",
      vl === null ? null : Math.min(vl, 10) * 1.2,
      12,
      vl === null ? "volume or liquidity unavailable" : `24h volume / liquidity = ${vl.toFixed(2)}x`,
    ),
  );

  // CONTRADICTION — agents disagreeing raises the value of further research
  const contradiction =
    a.consensus.total === 0 ? null : (a.consensus.disagree / a.consensus.total) * 10;
  factors.push(
    factor(
      "AGENT CONTRADICTION",
      contradiction,
      10,
      a.consensus.total === 0
        ? "agent suite has not produced votes"
        : `${a.consensus.disagree} of ${a.consensus.total} agents dissent`,
    ),
  );
  if (a.consensus.disagree >= 3) reasons.push("agents contradict each other");

  // DATA CONFIDENCE — low confidence lowers attention value, it never raises it
  factors.push(
    factor(
      "DATA CONFIDENCE",
      (a.confidence.score / 100) * 8,
      8,
      `${a.confidence.band} confidence (${a.confidence.score}/100), observation ${a.confidence.freshnessSeconds}s old`,
    ),
  );

  // TRAJECTORY — drift since the first recorded observation
  const drift = first && last ? pctChange(first.liquidityUsd, last.liquidityUsd) : null;
  factors.push(
    factor(
      "LIQUIDITY TRAJECTORY",
      drift === null ? null : Math.abs(drift) / 6,
      10,
      drift === null
        ? "no recorded liquidity baseline"
        : `liquidity ${drift >= 0 ? "up" : "down"} ${Math.abs(drift).toFixed(1)}% since first recorded observation`,
    ),
  );
  if (drift !== null && drift <= -30)
    reasons.push(`liquidity down ${Math.abs(drift).toFixed(0)}% since first observation`);

  const available = factors.filter((f) => f.available);
  const availableMax = available.reduce((s, f) => s + f.maxPoints, 0);
  const earned = available.reduce((s, f) => s + f.points, 0);
  const score = available.length < 4 || availableMax === 0 ? null : Math.round((earned / availableMax) * 100);

  const klass: AttentionClass =
    score === null
      ? "NORMAL"
      : score >= 70
        ? "CRITICAL"
        : score >= 58
          ? "HIGH PRIORITY"
          : score >= 46
            ? "UNUSUAL"
            : score >= 34
              ? "IMPORTANT"
              : score >= 22
                ? "INTERESTING"
                : "NORMAL";

  return {
    key: a.pair.key,
    assessment: a,
    score,
    klass,
    factors,
    historyPoints: h.length,
    reasons,
    scoredAt: Date.now(),
  };
}

export const ATTENTION_ORDER: AttentionClass[] = [
  "NORMAL",
  "INTERESTING",
  "IMPORTANT",
  "UNUSUAL",
  "HIGH PRIORITY",
  "CRITICAL",
];

export function attentionQueue(assessments: Assessment[]): AttentionItem[] {
  return assessments
    .map((a) => scoreAttention(a))
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
}

/** Attention classes at or above this threshold justify a research job. */
export function warrantsResearch(item: AttentionItem): boolean {
  return ATTENTION_ORDER.indexOf(item.klass) >= ATTENTION_ORDER.indexOf("UNUSUAL");
}
