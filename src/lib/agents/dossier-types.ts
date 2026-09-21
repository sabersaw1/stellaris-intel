/**
 * Shared dossier shapes (browser-safe: types only, no server imports).
 */

import type { FunnelStage, StageResult } from "./funnel";
import type { AgentFinding, ResearchState } from "./roles";

export type Dossier = {
  tokenId: string;
  tokenLabel: string;
  observation: string;
  state: ResearchState;
  disagreement: boolean;
  supporting: string[];
  contradicting: string[];
  unknown: string[];
  findings: AgentFinding[];
  whatWouldChangeIt: string[];
  funnelReached: FunnelStage;
  funnelBlockedBy: FunnelStage | null;
  funnelStages: StageResult[];
  executionAllowed: false;
  producedAt: number;
};

export type AnalyzeResult =
  | { ok: true; dossier: Dossier; persisted: boolean }
  | { ok: false; state: string; detail: string | null };
