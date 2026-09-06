/** Browser-safe shared types for normalized DEX Screener observations. */

export type RawPair = {
  chainId: string;
  dexId: string;
  url?: string;
  pairAddress: string;
  labels?: string[];
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative?: string;
  priceUsd?: string;
  txns?: Record<string, { buys: number; sells: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { label?: string; url: string }[];
    socials?: { type?: string; platform?: string; url: string }[];
  };
  boosts?: { active?: number };
};

/** Normalized raw observation — every field here is a direct API value. */
export type PairObservation = {
  key: string;
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string | null;
  baseSymbol: string;
  baseName: string;
  baseAddress: string;
  quoteSymbol: string;
  priceUsd: number | null;
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  volume: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  txns: {
    m5: { buys: number; sells: number } | null;
    h1: { buys: number; sells: number } | null;
    h6: { buys: number; sells: number } | null;
    h24: { buys: number; sells: number } | null;
  };
  liquidityUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  boostsActive: number | null;
  hasProfile: boolean;
  imageUrl: string | null;
  observedAt: number;
};

export type Severity = "NORMAL" | "NOTABLE" | "UNUSUAL" | "SEVERE";

export type RiskBand =
  | "LOWER OBSERVED RISK"
  | "MODERATE OBSERVED RISK"
  | "HIGH OBSERVED RISK"
  | "EXTREME OBSERVED RISK"
  | "INSUFFICIENT DATA";

export type RiskFactor = {
  dimension: string;
  points: number;
  maxPoints: number;
  basis: string;
  dataAvailable: boolean;
};

export type Confidence = {
  score: number;
  band: "LOW" | "MODERATE" | "HIGH";
  reasons: string[];
  completeness: number;
  freshnessSeconds: number;
};

export type Anomaly = {
  metric: string;
  severity: Severity;
  what: string;
  observedValue: string;
  baseline: string;
  deviation: string;
  why: string;
  confidence: number;
  detectedAt: number;
};

export type AgentStatus = "ONLINE" | "PROCESSING" | "WAITING" | "ERROR";

export type AgentObservation = {
  agentId: string;
  agentNumber: string;
  name: string;
  version: string;
  status: AgentStatus;
  observations: string[];
  warnings: string[];
  confidence: number;
  supportingData: { label: string; value: string }[];
  /** direction this agent leans on observed risk */
  vote: "ELEVATED" | "NEUTRAL" | "CONTAINED" | "INSUFFICIENT DATA";
  ranAt: number;
};

export type Assessment = {
  pair: PairObservation;
  calculated: {
    volumeToLiquidity24h: number | null;
    buySellRatio24h: number | null;
    txns24h: number | null;
    pairAgeHours: number | null;
    volatilityProxy: number | null;
    liquidityPerTxn: number | null;
  };
  risk: {
    score: number | null;
    band: RiskBand;
    factors: RiskFactor[];
    engineVersion: string;
    calculatedAt: number;
  };
  confidence: Confidence;
  anomalies: Anomaly[];
  agents: AgentObservation[];
  consensus: { agree: number; disagree: number; unresolved: number; total: number };
  peerContext: {
    available: boolean;
    peerCount: number;
    liquidityPercentile: number | null;
    volumePercentile: number | null;
    vlRatioPercentile: number | null;
    note: string;
  };
};

export const RISK_ENGINE_VERSION = "risk-engine v1.0";
export const AGENT_SUITE_VERSION = "agents v1.0";
