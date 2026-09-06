import {
  AGENT_SUITE_VERSION,
  RISK_ENGINE_VERSION,
  type AgentObservation,
  type Anomaly,
  type Assessment,
  type Confidence,
  type PairObservation,
  type RiskBand,
  type RiskFactor,
} from "./dex-types";

/* ------------------------------------------------------------------ */
/* CALCULATED METRICS                                                  */
/* ------------------------------------------------------------------ */

export function calcMetrics(p: PairObservation) {
  const liq = p.liquidityUsd;
  const vol = p.volume.h24;
  const tx = p.txns.h24;
  const txns24h = tx ? tx.buys + tx.sells : null;
  return {
    volumeToLiquidity24h: liq && liq > 0 && vol !== null ? vol / liq : null,
    buySellRatio24h: tx && tx.sells > 0 ? tx.buys / tx.sells : null,
    txns24h,
    pairAgeHours: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3_600_000 : null,
    volatilityProxy:
      p.priceChange.h1 !== null && p.priceChange.h24 !== null
        ? (Math.abs(p.priceChange.m5 ?? 0) + Math.abs(p.priceChange.h1) + Math.abs(p.priceChange.h6 ?? 0)) / 3
        : null,
    liquidityPerTxn: liq && txns24h && txns24h > 0 ? liq / txns24h : null,
  };
}

/* ------------------------------------------------------------------ */
/* BASELINE ENGINE — peer-aware percentiles                            */
/* ------------------------------------------------------------------ */

export type PeerSet = {
  liquidity: number[];
  volume: number[];
  vlRatio: number[];
  count: number;
};

export function buildPeerSet(pairs: PairObservation[]): PeerSet {
  const liquidity: number[] = [];
  const volume: number[] = [];
  const vlRatio: number[] = [];
  for (const p of pairs) {
    if (p.liquidityUsd !== null) liquidity.push(p.liquidityUsd);
    if (p.volume.h24 !== null) volume.push(p.volume.h24);
    const m = calcMetrics(p).volumeToLiquidity24h;
    if (m !== null) vlRatio.push(m);
  }
  return {
    liquidity: liquidity.sort((a, b) => a - b),
    volume: volume.sort((a, b) => a - b),
    vlRatio: vlRatio.sort((a, b) => a - b),
    count: pairs.length,
  };
}

export function percentile(sorted: number[], value: number): number | null {
  if (sorted.length < 8) return null;
  let below = 0;
  for (const v of sorted) if (v <= value) below++;
  return Math.round((below / sorted.length) * 100);
}

export function median(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/* ------------------------------------------------------------------ */
/* CONFIDENCE ENGINE — independent of risk                             */
/* ------------------------------------------------------------------ */

export function assessConfidence(
  p: PairObservation,
  peers: PeerSet,
  historyPoints: number,
): Confidence {
  const required: [string, unknown][] = [
    ["price", p.priceUsd],
    ["liquidity", p.liquidityUsd],
    ["volume 24h", p.volume.h24],
    ["transactions 24h", p.txns.h24],
    ["price change 24h", p.priceChange.h24],
    ["price change 1h", p.priceChange.h1],
    ["pair age", p.pairCreatedAt],
    ["market cap or FDV", p.marketCap ?? p.fdv],
  ];
  const present = required.filter(([, v]) => v !== null && v !== undefined).length;
  const completeness = present / required.length;
  const freshnessSeconds = Math.max(0, Math.round((Date.now() - p.observedAt) / 1000));

  const reasons: string[] = [];
  let score = completeness * 55;

  if (freshnessSeconds < 60) score += 15;
  else if (freshnessSeconds < 300) score += 8;
  else {
    reasons.push("Observation is older than 5 minutes (STALE DATA).");
  }

  if (historyPoints >= 12) score += 18;
  else if (historyPoints >= 4) score += 9;
  else reasons.push("Insufficient historical observations recorded for this pair.");

  if (peers.count >= 20) score += 12;
  else reasons.push("Peer sample is too small for contextual baselines.");

  if (completeness < 1) {
    const missing = required.filter(([, v]) => v === null || v === undefined).map(([k]) => k);
    reasons.push(`Missing fields from data source: ${missing.join(", ")}.`);
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: bounded,
    band: bounded >= 70 ? "HIGH" : bounded >= 40 ? "MODERATE" : "LOW",
    reasons: reasons.length ? reasons : ["All required metrics present and fresh."],
    completeness: Math.round(completeness * 100),
    freshnessSeconds,
  };
}

/* ------------------------------------------------------------------ */
/* RISK ENGINE — transparent, weighted, versioned                      */
/* ------------------------------------------------------------------ */

export const RISK_WEIGHTS = {
  liquidity: 22,
  volatility: 18,
  marketStructure: 15,
  activity: 12,
  pairAge: 10,
  dataQuality: 10,
  promotional: 6,
  anomaly: 7,
} as const;

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function assessRisk(
  p: PairObservation,
  peers: PeerSet,
  anomalies: Anomaly[],
  confidence: Confidence,
): { score: number | null; band: RiskBand; factors: RiskFactor[]; engineVersion: string; calculatedAt: number } {
  const m = calcMetrics(p);
  const factors: RiskFactor[] = [];

  // Liquidity risk
  if (p.liquidityUsd === null) {
    factors.push({ dimension: "Liquidity", points: RISK_WEIGHTS.liquidity * 0.6, maxPoints: RISK_WEIGHTS.liquidity, basis: "Liquidity not reported by source", dataAvailable: false });
  } else {
    const liq = p.liquidityUsd;
    const scale = liq >= 1_000_000 ? 0.05 : liq >= 250_000 ? 0.25 : liq >= 50_000 ? 0.55 : liq >= 10_000 ? 0.8 : 1;
    factors.push({ dimension: "Liquidity", points: RISK_WEIGHTS.liquidity * scale, maxPoints: RISK_WEIGHTS.liquidity, basis: `Observed liquidity $${Math.round(liq).toLocaleString()}`, dataAvailable: true });
  }

  // Volatility risk
  if (m.volatilityProxy === null) {
    factors.push({ dimension: "Volatility", points: RISK_WEIGHTS.volatility * 0.6, maxPoints: RISK_WEIGHTS.volatility, basis: "Price change windows incomplete", dataAvailable: false });
  } else {
    const scale = clamp01(m.volatilityProxy / 30);
    factors.push({ dimension: "Volatility", points: RISK_WEIGHTS.volatility * scale, maxPoints: RISK_WEIGHTS.volatility, basis: `Mean absolute short-window move ${m.volatilityProxy.toFixed(2)}%`, dataAvailable: true });
  }

  // Market structure risk (volume vs liquidity turnover)
  if (m.volumeToLiquidity24h === null) {
    factors.push({ dimension: "Market Structure", points: RISK_WEIGHTS.marketStructure * 0.6, maxPoints: RISK_WEIGHTS.marketStructure, basis: "Volume or liquidity unavailable", dataAvailable: false });
  } else {
    const scale = clamp01(m.volumeToLiquidity24h / 12);
    factors.push({ dimension: "Market Structure", points: RISK_WEIGHTS.marketStructure * scale, maxPoints: RISK_WEIGHTS.marketStructure, basis: `Volume/liquidity turnover ${m.volumeToLiquidity24h.toFixed(2)}x`, dataAvailable: true });
  }

  // Activity risk (thin or lopsided flow)
  if (m.txns24h === null) {
    factors.push({ dimension: "Activity", points: RISK_WEIGHTS.activity * 0.6, maxPoints: RISK_WEIGHTS.activity, basis: "Transaction counts unavailable", dataAvailable: false });
  } else {
    const thin = m.txns24h < 50 ? 1 : m.txns24h < 250 ? 0.6 : m.txns24h < 1000 ? 0.3 : 0.12;
    const lop = m.buySellRatio24h === null ? 0.3 : clamp01(Math.abs(Math.log(Math.max(m.buySellRatio24h, 0.01))) / 1.6);
    factors.push({ dimension: "Activity", points: RISK_WEIGHTS.activity * clamp01((thin + lop) / 2), maxPoints: RISK_WEIGHTS.activity, basis: `${m.txns24h.toLocaleString()} txns / 24h, buy:sell ${m.buySellRatio24h ? m.buySellRatio24h.toFixed(2) : "n/a"}`, dataAvailable: true });
  }

  // Pair age risk
  if (m.pairAgeHours === null) {
    factors.push({ dimension: "Pair Age", points: RISK_WEIGHTS.pairAge * 0.6, maxPoints: RISK_WEIGHTS.pairAge, basis: "Pair creation time unavailable", dataAvailable: false });
  } else {
    const h = m.pairAgeHours;
    const scale = h < 6 ? 1 : h < 24 ? 0.8 : h < 24 * 7 ? 0.5 : h < 24 * 30 ? 0.25 : 0.08;
    factors.push({ dimension: "Pair Age", points: RISK_WEIGHTS.pairAge * scale, maxPoints: RISK_WEIGHTS.pairAge, basis: `Pair age ${h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`}`, dataAvailable: true });
  }

  // Data quality risk (inverse of confidence)
  factors.push({
    dimension: "Data Quality",
    points: RISK_WEIGHTS.dataQuality * (1 - confidence.score / 100),
    maxPoints: RISK_WEIGHTS.dataQuality,
    basis: `Confidence ${confidence.score}/100, completeness ${confidence.completeness}%`,
    dataAvailable: true,
  });

  // Promotional activity risk
  const boosts = p.boostsActive ?? 0;
  factors.push({
    dimension: "Promotional",
    points: RISK_WEIGHTS.promotional * (boosts > 0 ? clamp01(0.4 + boosts / 100) : 0.05),
    maxPoints: RISK_WEIGHTS.promotional,
    basis: boosts > 0 ? `${boosts} active boosts observed` : "No active boosts observed",
    dataAvailable: true,
  });

  // Anomaly risk
  const worst = anomalies.reduce((acc, a) => Math.max(acc, a.severity === "SEVERE" ? 1 : a.severity === "UNUSUAL" ? 0.66 : a.severity === "NOTABLE" ? 0.33 : 0), 0);
  factors.push({
    dimension: "Anomaly",
    points: RISK_WEIGHTS.anomaly * worst,
    maxPoints: RISK_WEIGHTS.anomaly,
    basis: anomalies.length ? `${anomalies.length} anomaly signal(s) present` : "No anomaly signals present",
    dataAvailable: true,
  });

  const availableDims = factors.filter((f) => f.dataAvailable).length;
  if (availableDims < 4) {
    return { score: null, band: "INSUFFICIENT DATA", factors, engineVersion: RISK_ENGINE_VERSION, calculatedAt: Date.now() };
  }

  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
  const band: RiskBand =
    score >= 75 ? "EXTREME OBSERVED RISK" : score >= 55 ? "HIGH OBSERVED RISK" : score >= 32 ? "MODERATE OBSERVED RISK" : "LOWER OBSERVED RISK";

  void peers;
  return { score, band, factors, engineVersion: RISK_ENGINE_VERSION, calculatedAt: Date.now() };
}

/* ------------------------------------------------------------------ */
/* ANOMALY ENGINE                                                      */
/* ------------------------------------------------------------------ */

export function detectAnomalies(p: PairObservation, peers: PeerSet): Anomaly[] {
  const out: Anomaly[] = [];
  const m = calcMetrics(p);
  const now = Date.now();
  const peersReady = peers.count >= 20;

  const sev = (ratio: number): Anomaly["severity"] =>
    ratio >= 6 ? "SEVERE" : ratio >= 3 ? "UNUSUAL" : ratio >= 1.8 ? "NOTABLE" : "NORMAL";

  // Turnover vs peer median
  if (peersReady && m.volumeToLiquidity24h !== null) {
    const med = median(peers.vlRatio);
    if (med && med > 0) {
      const ratio = m.volumeToLiquidity24h / med;
      const s = sev(ratio);
      if (s !== "NORMAL") {
        out.push({
          metric: "Volume / Liquidity turnover",
          severity: s,
          what: "24h turnover relative to liquidity is far above comparable monitored pairs",
          observedValue: `${m.volumeToLiquidity24h.toFixed(2)}x`,
          baseline: `peer median ${med.toFixed(2)}x (${peers.count} pairs)`,
          deviation: `${ratio.toFixed(1)}x baseline`,
          why: "Volume greatly exceeding available liquidity indicates thin-book churn or concentrated flow.",
          confidence: peers.count >= 60 ? 78 : 58,
          detectedAt: now,
        });
      }
    }
  }

  // Short-window price acceleration
  if (p.priceChange.m5 !== null && p.priceChange.h1 !== null) {
    const projected = Math.abs(p.priceChange.m5) * 12;
    const actual = Math.abs(p.priceChange.h1);
    if (actual > 0.5 && projected / Math.max(actual, 0.5) >= 1.8) {
      out.push({
        metric: "Price acceleration",
        severity: sev(projected / Math.max(actual, 0.5)),
        what: "5-minute move is accelerating relative to the 1-hour trend",
        observedValue: `${p.priceChange.m5.toFixed(2)}% / 5m`,
        baseline: `${p.priceChange.h1.toFixed(2)}% / 1h`,
        deviation: `${(projected / Math.max(actual, 0.5)).toFixed(1)}x extrapolated`,
        why: "Recent minutes are moving faster than the hour-scale trend, indicating a change of regime.",
        confidence: 62,
        detectedAt: now,
      });
    }
  }

  // Buy/sell distribution
  if (m.buySellRatio24h !== null && (m.txns24h ?? 0) >= 100) {
    const skew = Math.max(m.buySellRatio24h, 1 / m.buySellRatio24h);
    if (skew >= 2) {
      out.push({
        metric: "Buy/sell distribution",
        severity: skew >= 5 ? "UNUSUAL" : "NOTABLE",
        what: "Transaction flow is strongly one-sided over 24h",
        observedValue: `ratio ${m.buySellRatio24h.toFixed(2)}`,
        baseline: "balanced flow ≈ 1.00",
        deviation: `${skew.toFixed(1)}x skew`,
        why: "Persistent one-sided flow can reflect distribution, accumulation or automated activity.",
        confidence: 66,
        detectedAt: now,
      });
    }
  }

  // Thin liquidity vs peer distribution
  if (peersReady && p.liquidityUsd !== null) {
    const pct = percentile(peers.liquidity, p.liquidityUsd);
    if (pct !== null && pct <= 10 && (p.volume.h24 ?? 0) > 25_000) {
      out.push({
        metric: "Liquidity depth",
        severity: "UNUSUAL",
        what: "Liquidity sits in the bottom decile of monitored peers while volume is material",
        observedValue: `$${Math.round(p.liquidityUsd).toLocaleString()} (p${pct})`,
        baseline: `peer median $${Math.round(median(peers.liquidity) ?? 0).toLocaleString()}`,
        deviation: `percentile ${pct}`,
        why: "Material volume against very thin depth implies elevated slippage and price fragility.",
        confidence: 70,
        detectedAt: now,
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* MULTI-AGENT SYSTEM                                                  */
/* ------------------------------------------------------------------ */

export const AGENT_DEFS = [
  { agentId: "market-structure", agentNumber: "01", name: "MARKET STRUCTURE" },
  { agentId: "liquidity", agentNumber: "02", name: "LIQUIDITY" },
  { agentId: "activity", agentNumber: "03", name: "ACTIVITY" },
  { agentId: "volatility", agentNumber: "04", name: "VOLATILITY" },
  { agentId: "data-quality", agentNumber: "05", name: "DATA QUALITY" },
  { agentId: "promotional", agentNumber: "06", name: "PROMOTIONAL ACTIVITY" },
  { agentId: "anomaly", agentNumber: "07", name: "ANOMALY DETECTION" },
  { agentId: "risk-synthesis", agentNumber: "08", name: "RISK SYNTHESIS" },
] as const;

export function runAgents(
  p: PairObservation,
  peers: PeerSet,
  anomalies: Anomaly[],
  confidence: Confidence,
  risk: ReturnType<typeof assessRisk>,
): AgentObservation[] {
  const m = calcMetrics(p);
  const ranAt = Date.now();
  const base = { version: AGENT_SUITE_VERSION, status: "ONLINE" as const, ranAt };
  const out: AgentObservation[] = [];

  const push = (
    def: (typeof AGENT_DEFS)[number],
    o: Omit<AgentObservation, "agentId" | "agentNumber" | "name" | "version" | "status" | "ranAt">,
  ) => out.push({ ...def, ...base, ...o });

  // 01 market structure
  const vl = m.volumeToLiquidity24h;
  push(AGENT_DEFS[0], {
    observations: vl === null ? ["Turnover could not be computed — INSUFFICIENT DATA."] : [`24h turnover is ${vl.toFixed(2)}x observed liquidity.`],
    warnings: vl !== null && vl > 5 ? ["Turnover far exceeds depth; execution structure is fragile."] : [],
    confidence: vl === null ? 20 : 74,
    supportingData: [
      { label: "Volume 24h", value: p.volume.h24 !== null ? `$${Math.round(p.volume.h24).toLocaleString()}` : "DATA UNAVAILABLE" },
      { label: "Liquidity", value: p.liquidityUsd !== null ? `$${Math.round(p.liquidityUsd).toLocaleString()}` : "DATA UNAVAILABLE" },
    ],
    vote: vl === null ? "INSUFFICIENT DATA" : vl > 5 ? "ELEVATED" : vl > 1.5 ? "NEUTRAL" : "CONTAINED",
  });

  // 02 liquidity
  const liqPct = p.liquidityUsd !== null ? percentile(peers.liquidity, p.liquidityUsd) : null;
  push(AGENT_DEFS[1], {
    observations:
      p.liquidityUsd === null
        ? ["Liquidity not reported — INSUFFICIENT DATA."]
        : [
            `Observed liquidity $${Math.round(p.liquidityUsd).toLocaleString()}.`,
            liqPct !== null ? `Sits at percentile ${liqPct} of ${peers.count} comparable monitored pairs.` : "Peer baseline unavailable — INSUFFICIENT DATA for percentile context.",
          ],
    warnings: p.liquidityUsd !== null && p.liquidityUsd < 25_000 ? ["Depth below $25k; slippage risk elevated."] : [],
    confidence: p.liquidityUsd === null ? 15 : liqPct !== null ? 80 : 55,
    supportingData: [{ label: "Liquidity percentile", value: liqPct !== null ? `p${liqPct}` : "INSUFFICIENT DATA" }],
    vote: p.liquidityUsd === null ? "INSUFFICIENT DATA" : p.liquidityUsd < 25_000 ? "ELEVATED" : p.liquidityUsd > 500_000 ? "CONTAINED" : "NEUTRAL",
  });

  // 03 activity
  push(AGENT_DEFS[2], {
    observations:
      m.txns24h === null
        ? ["Transaction counts unavailable — INSUFFICIENT DATA."]
        : [`${m.txns24h.toLocaleString()} transactions observed in 24h.`, m.buySellRatio24h !== null ? `Buy/sell ratio ${m.buySellRatio24h.toFixed(2)}.` : "Buy/sell split unavailable."],
    warnings: m.txns24h !== null && m.txns24h < 50 ? ["Participation is very thin; metrics are easily distorted."] : [],
    confidence: m.txns24h === null ? 18 : 72,
    supportingData: [
      { label: "Txns 24h", value: m.txns24h !== null ? m.txns24h.toLocaleString() : "DATA UNAVAILABLE" },
      { label: "Buys / Sells", value: p.txns.h24 ? `${p.txns.h24.buys} / ${p.txns.h24.sells}` : "DATA UNAVAILABLE" },
    ],
    vote: m.txns24h === null ? "INSUFFICIENT DATA" : m.txns24h < 50 ? "ELEVATED" : m.txns24h > 2000 ? "CONTAINED" : "NEUTRAL",
  });

  // 04 volatility
  push(AGENT_DEFS[3], {
    observations:
      m.volatilityProxy === null
        ? ["Price-change windows incomplete — INSUFFICIENT DATA."]
        : [`Mean absolute short-window movement ${m.volatilityProxy.toFixed(2)}%.`, `24h change ${p.priceChange.h24 !== null ? `${p.priceChange.h24.toFixed(2)}%` : "DATA UNAVAILABLE"}.`],
    warnings: m.volatilityProxy !== null && m.volatilityProxy > 12 ? ["Short-window volatility is elevated."] : [],
    confidence: m.volatilityProxy === null ? 20 : 70,
    supportingData: [
      { label: "5m", value: p.priceChange.m5 !== null ? `${p.priceChange.m5.toFixed(2)}%` : "n/a" },
      { label: "1h", value: p.priceChange.h1 !== null ? `${p.priceChange.h1.toFixed(2)}%` : "n/a" },
      { label: "6h", value: p.priceChange.h6 !== null ? `${p.priceChange.h6.toFixed(2)}%` : "n/a" },
    ],
    vote: m.volatilityProxy === null ? "INSUFFICIENT DATA" : m.volatilityProxy > 12 ? "ELEVATED" : m.volatilityProxy < 3 ? "CONTAINED" : "NEUTRAL",
  });

  // 05 data quality
  push(AGENT_DEFS[4], {
    observations: [`Field completeness ${confidence.completeness}%.`, `Observation age ${confidence.freshnessSeconds}s.`],
    warnings: confidence.band === "LOW" ? ["Confidence is LOW; downstream conclusions are weakly supported."] : [],
    confidence: 85,
    supportingData: confidence.reasons.map((r, i) => ({ label: `Reason ${i + 1}`, value: r })),
    vote: confidence.band === "LOW" ? "ELEVATED" : confidence.band === "HIGH" ? "CONTAINED" : "NEUTRAL",
  });

  // 06 promotional
  const boosts = p.boostsActive ?? 0;
  push(AGENT_DEFS[5], {
    observations: [boosts > 0 ? `${boosts} active boosts observed on this token.` : "No active boosts observed.", p.hasProfile ? "Token profile metadata present." : "No token profile metadata observed."],
    warnings: boosts > 0 ? ["Promotional metadata is not evidence of quality or safety."] : [],
    confidence: 68,
    supportingData: [{ label: "Boosts active", value: String(boosts) }, { label: "Profile", value: p.hasProfile ? "PRESENT" : "ABSENT" }],
    vote: boosts > 20 ? "ELEVATED" : "NEUTRAL",
  });

  // 07 anomaly
  push(AGENT_DEFS[6], {
    observations: anomalies.length ? anomalies.map((a) => `${a.severity}: ${a.what}`) : peers.count >= 20 ? ["No anomaly thresholds crossed against current baselines."] : ["Peer baseline too small — INSUFFICIENT DATA for anomaly detection."],
    warnings: anomalies.filter((a) => a.severity === "SEVERE" || a.severity === "UNUSUAL").map((a) => `${a.metric}: ${a.deviation} vs ${a.baseline}`),
    confidence: peers.count >= 20 ? 74 : 25,
    supportingData: anomalies.map((a) => ({ label: a.metric, value: `${a.observedValue} vs ${a.baseline}` })),
    vote: peers.count < 20 ? "INSUFFICIENT DATA" : anomalies.some((a) => a.severity === "SEVERE" || a.severity === "UNUSUAL") ? "ELEVATED" : "CONTAINED",
  });

  // 08 risk synthesis
  push(AGENT_DEFS[7], {
    observations: [
      risk.score === null ? "Insufficient dimensions available to synthesize a risk score." : `Synthesized observed risk score ${risk.score}/100 (${risk.band}).`,
      `Confidence in this assessment: ${confidence.score}/100 (${confidence.band}).`,
    ],
    warnings: risk.score !== null && risk.score >= 55 && confidence.band === "LOW" ? ["High observed risk reported at LOW confidence — investigate before relying on it."] : [],
    confidence: confidence.score,
    supportingData: risk.factors.map((f) => ({ label: f.dimension, value: `${f.points.toFixed(1)} / ${f.maxPoints}` })),
    vote: risk.score === null ? "INSUFFICIENT DATA" : risk.score >= 55 ? "ELEVATED" : risk.score < 32 ? "CONTAINED" : "NEUTRAL",
  });

  return out;
}

export function consensusOf(agents: AgentObservation[]) {
  const votes = agents.map((a) => a.vote);
  const elevated = votes.filter((v) => v === "ELEVATED").length;
  const contained = votes.filter((v) => v === "CONTAINED").length;
  const neutral = votes.filter((v) => v === "NEUTRAL").length;
  const unresolved = votes.filter((v) => v === "INSUFFICIENT DATA").length;
  const majority = Math.max(elevated, contained, neutral);
  return {
    agree: majority,
    disagree: elevated + contained + neutral - majority,
    unresolved,
    total: agents.length,
  };
}

/* ------------------------------------------------------------------ */
/* FULL ASSESSMENT                                                     */
/* ------------------------------------------------------------------ */

export function assessPair(p: PairObservation, peers: PeerSet, historyPoints = 0): Assessment {
  const confidence = assessConfidence(p, peers, historyPoints);
  const anomalies = detectAnomalies(p, peers);
  const risk = assessRisk(p, peers, anomalies, confidence);
  const agents = runAgents(p, peers, anomalies, confidence, risk);
  const m = calcMetrics(p);
  return {
    pair: p,
    calculated: m,
    risk,
    confidence,
    anomalies,
    agents,
    consensus: consensusOf(agents),
    peerContext: {
      available: peers.count >= 20,
      peerCount: peers.count,
      liquidityPercentile: p.liquidityUsd !== null ? percentile(peers.liquidity, p.liquidityUsd) : null,
      volumePercentile: p.volume.h24 !== null ? percentile(peers.volume, p.volume.h24) : null,
      vlRatioPercentile: m.volumeToLiquidity24h !== null ? percentile(peers.vlRatio, m.volumeToLiquidity24h) : null,
      note:
        peers.count >= 20
          ? `Percentiles computed against ${peers.count} pairs observed in the same request batch.`
          : "INSUFFICIENT DATA — peer sample below 20 pairs.",
    },
  };
}
