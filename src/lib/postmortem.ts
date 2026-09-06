/**
 * POST-MORTEMS
 *
 * A post-mortem is assembled from stored records only: the original research
 * question, the first recorded classification, the initial evidence and
 * confidence, the agents involved, recorded disagreements, what changed, the
 * subsequent observations and the final recorded state.
 *
 * Where no later observation exists to evaluate against, the outcome reads
 * OUTCOME INSUFFICIENT / UNAVAILABLE. No conclusion is invented.
 */

import { getJobs, type ResearchJob } from "./jobs";
import { getMemory, type MemoryRecord } from "./memory";
import { contradictionsForTarget } from "./contradictions";
import { questionsForTarget } from "./questions";
import { getMeta } from "./research";
import { getHistory } from "./local-store";
import { changeReport, type ChangeRow } from "./changes";

export const POSTMORTEM_ENGINE_VERSION = "post-mortem v1.0";

export type PostMortem = {
  job: ResearchJob;
  question: string;
  initialClassification: string | null;
  initialConfidence: number | null;
  initialEvidence: string[];
  agents: string[];
  disagreements: { topic: string; claimA: string; claimB: string; status: string; minority: string | null }[];
  changes: ChangeRow[];
  changeWindow: string | null;
  subsequentObservations: number;
  finalClassification: string | null;
  finalConfidence: number | null;
  learned: string[];
  outcome: "OUTCOME INSUFFICIENT / UNAVAILABLE" | "CLASSIFICATION HELD" | "CLASSIFICATION CHANGED";
  outcomeBasis: string;
  passState: string;
};

function classifications(targetKey: string): MemoryRecord[] {
  return getMemory()
    .filter((r) => r.kind === "CLASSIFICATION" && r.targetKey === targetKey)
    .sort((a, b) => a.t - b.t);
}

export function postMortemFor(job: ResearchJob): PostMortem {
  const cls = classifications(job.targetKey);
  const first = cls[0] ?? null;
  const last = cls.length > 1 ? cls[cls.length - 1]! : null;
  const evidence = getMemory()
    .filter((r) => r.targetKey === job.targetKey && (r.kind === "EVIDENCE" || r.kind === "AGENT_FINDING"))
    .sort((a, b) => a.t - b.t)
    .slice(0, 6)
    .map((r) => `${r.source}: ${r.summary}`);
  const cons = contradictionsForTarget(job.targetKey);
  const history = getHistory(job.targetKey);
  const firstBand = first?.detail.find((d) => d.label === "BAND")?.value ?? null;
  const lastBand = last?.detail.find((d) => d.label === "BAND")?.value ?? null;
  const report = changeReport(history, {
    classificationPrev: firstBand,
    classificationNow: lastBand ?? firstBand,
    researchStateNow: job.status,
  });

  const meta = getMeta(job.id);
  const q = questionsForTarget(job.targetKey)[0]?.question ?? job.reason;

  let outcome: PostMortem["outcome"] = "OUTCOME INSUFFICIENT / UNAVAILABLE";
  let basis = `Only ${cls.length} classification record(s) exist for this target; at least two separated recordings are required to evaluate an outcome.`;
  if (first && last && firstBand && lastBand) {
    outcome = firstBand === lastBand ? "CLASSIFICATION HELD" : "CLASSIFICATION CHANGED";
    basis = `First recorded ${firstBand} at ${new Date(first.t).toLocaleTimeString([], { hour12: false })}; latest recorded ${lastBand} at ${new Date(last.t).toLocaleTimeString([], { hour12: false })}.`;
  }

  const learned: string[] = [];
  if (outcome === "CLASSIFICATION CHANGED") learned.push(`Classification moved ${firstBand} → ${lastBand} — the initial reading was revised by later observations.`);
  if (outcome === "CLASSIFICATION HELD") learned.push(`Classification held at ${firstBand} across ${cls.length} recorded passes.`);
  if (cons.length) learned.push(`${cons.length} recorded disagreement(s); minority views retained rather than discarded.`);
  if (job.missingData.length) learned.push(`Investigation ran with ${job.missingData.length} required field(s) unavailable: ${job.missingData.join(", ")}.`);
  if (!learned.length) learned.push("Nothing has been learned yet — insufficient recorded passes for this investigation.");

  return {
    job,
    question: q,
    initialClassification: first?.summary ?? null,
    initialConfidence: first?.confidence ?? null,
    initialEvidence: evidence,
    agents: job.assignedAgents,
    disagreements: cons.map((c) => ({
      topic: c.topic,
      claimA: c.claimA,
      claimB: c.claimB,
      status: c.status,
      minority: c.minorityPreserved,
    })),
    changes: report.rows,
    changeWindow: report.window,
    subsequentObservations: Math.max(0, history.length - 1),
    finalClassification: (last ?? first)?.summary ?? null,
    finalConfidence: (last ?? first)?.confidence ?? null,
    learned,
    outcome,
    outcomeBasis: basis,
    passState: meta ? `PASS ${meta.passIndex}/${meta.totalPasses} ${meta.passName}` : "PASS STATE NOT RECORDED",
  };
}

export function allPostMortems(): PostMortem[] {
  return getJobs().map(postMortemFor);
}
