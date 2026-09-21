/**
 * OPPORTUNITY FUNNEL (pure, deterministic, testable)
 *
 * Every candidate moves through explicit stages, and every transition — forward
 * or blocked — carries the reason it happened. Nothing advances silently.
 */

import type { AnalysisInput, DecisionSupport } from "./roles";
import { researchAgent } from "./roles";

export const FUNNEL_STAGES = [
  "DISCOVERED",
  "VALIDATED",
  "MEME FILTER",
  "RISK FILTER",
  "MARKET ANALYSIS",
  "SOCIAL/TRADER ANALYSIS",
  "DEEP RESEARCH",
  "WATCHLIST",
  "PAPER TRADE",
  "HUMAN DECISION",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export type StageResult = {
  stage: FunnelStage;
  passed: boolean;
  /** Why it passed, or exactly what stopped it. */
  reason: string;
};

export type FunnelOutcome = {
  reached: FunnelStage;
  stages: StageResult[];
  blockedBy: FunnelStage | null;
  decision: DecisionSupport;
};

export function runFunnel(input: AnalysisInput): FunnelOutcome {
  const decision = researchAgent(input);
  const stages: StageResult[] = [];
  const push = (stage: FunnelStage, passed: boolean, reason: string) => stages.push({ stage, passed, reason });

  push("DISCOVERED", true, "A provider returned this token and it was stored with source and timestamps.");

  const validated = Boolean(input.latest && input.latest.observedAt !== null);
  push("VALIDATED", validated, validated ? "At least one snapshot with a real observation time exists." : "No snapshot with an observation time is stored.");
  if (!validated) return { reached: "DISCOVERED", stages, blockedBy: "VALIDATED", decision };

  const memePass = input.memeVerdict === "MEME";
  push("MEME FILTER", memePass, memePass ? `Classified MEME: ${input.memeReasons.join("; ") || "meme rules matched"}.` : `Classified ${input.memeVerdict}, so it stays out of the research universe.`);
  if (!memePass) return { reached: "VALIDATED", stages, blockedBy: "MEME FILTER", decision };

  const risk = decision.findings.find((f) => f.role === "TOKEN/RISK");
  const riskPass = risk?.stance !== "CONTRADICTING";
  push("RISK FILTER", riskPass, risk ? risk.statement : "Risk could not be assessed from stored data.");
  if (!riskPass) return { reached: "MEME FILTER", stages, blockedBy: "RISK FILTER", decision };

  const market = decision.findings.find((f) => f.role === "MARKET");
  const marketPass = market?.stance === "SUPPORTING" || market?.stance === "NEUTRAL";
  push("MARKET ANALYSIS", marketPass, market?.statement ?? "No market finding.");
  if (!marketPass) return { reached: "RISK FILTER", stages, blockedBy: "MARKET ANALYSIS", decision };

  const social = decision.findings.find((f) => f.role === "SOCIAL");
  const trader = decision.findings.find((f) => f.role === "TRADER");
  const socialPass = social?.stance === "SUPPORTING" || trader?.stance === "SUPPORTING";
  push(
    "SOCIAL/TRADER ANALYSIS",
    socialPass,
    socialPass
      ? "At least one independent social or trader signal supports the candidate."
      : "No social or trader provider supplied supporting evidence, so deep research is not justified yet.",
  );
  if (!socialPass) return { reached: "MARKET ANALYSIS", stages, blockedBy: "SOCIAL/TRADER ANALYSIS", decision };

  push("DEEP RESEARCH", true, `Research state: ${decision.state}.`);

  const watchlistPass = decision.state !== "REJECTED — RISK" && decision.state !== "INSUFFICIENT DATA";
  push("WATCHLIST", watchlistPass, watchlistPass ? "Evidence is strong enough to keep monitoring." : "Research state does not justify monitoring.");
  if (!watchlistPass) return { reached: "DEEP RESEARCH", stages, blockedBy: "WATCHLIST", decision };

  push("PAPER TRADE", true, "A paper position may be simulated. No real order is ever placed.");
  push("HUMAN DECISION", true, "The operator decides. STELLARIS never executes.");

  return { reached: "HUMAN DECISION", stages, blockedBy: null, decision };
}
