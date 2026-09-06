/**
 * GLOBAL BRAIN
 *
 * One coordination cycle, run once per real market observation cycle. It connects
 * the subsystems in the order the architecture requires:
 *
 *   observations → attention → research queue → agents → evidence → debate →
 *   hypotheses → historical → synthesis → confidence → monitoring → memory →
 *   post-mortem → agent performance → back into scheduling
 *
 * Nothing in this cycle runs on a timer for appearance: every step consumes the
 * observation that was actually received, and stops where data is missing.
 */

import { useEffect, useMemo, useState } from "react";

import { useMarketIntelligence } from "./useMarket";
import { attentionQueue, warrantsResearch, type AttentionItem } from "@/lib/attention";
import { getJobs, jobFor, upsertJob, subscribeJobs } from "@/lib/jobs";
import { advancePass, duplicateResearch, mergeDuplicates, getMeta } from "@/lib/research";
import { commitAssessment, recallTarget, subscribeMemory } from "@/lib/memory";
import { syncHypotheses, monitoringConditions } from "@/lib/hypotheses";
import { syncContradictions } from "@/lib/contradictions";
import { askAbout } from "@/lib/questions";
import { evaluateOpenCases, recordCalibrationCase } from "@/lib/calibration";
import { recordAgentTiming } from "@/lib/performance";
import { emitEvent, subscribeEvents } from "@/lib/events";
import { openIncident } from "@/lib/incidents";
import { getGovernor } from "@/lib/governor";
import { getHistory } from "@/lib/local-store";

export type BrainCycle = {
  ranAt: number;
  observations: number;
  attentionConsidered: number;
  jobsOpened: number;
  passesAdvanced: number;
  memoryRecords: number;
  hypotheses: number;
  contradictions: number;
  questions: number;
  calibrationCases: number;
  resolvedCases: number;
  reopened: number;
  durationMs: number;
  note: string;
};

export function useGlobalBrain() {
  const mi = useMarketIntelligence();
  const [cycle, setCycle] = useState<BrainCycle | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const a = subscribeJobs(bump);
    const b = subscribeMemory(bump);
    const c = subscribeEvents(bump);
    return () => {
      a();
      b();
      c();
    };
  }, []);

  const queue: AttentionItem[] = useMemo(() => attentionQueue(mi.assessments), [mi.assessments]);

  useEffect(() => {
    if (!mi.assessments.length) return;
    const started = Date.now();
    const gov = getGovernor();

    const candidates = queue.filter(warrantsResearch).slice(0, gov.maxScheduledPerCycle);
    let jobsOpened = 0;
    let passes = 0;
    let memoryRecords = 0;
    let hyp = 0;
    let cons = 0;
    let qs = 0;
    let cal = 0;
    let reopened = 0;

    for (const item of candidates) {
      const a = item.assessment;
      const existing = jobFor(a.pair.key);

      // ATTENTION → RESEARCH
      const reason =
        `Attention ${item.score ?? "NOT SCORED"} (${item.klass}). ` +
        (item.reasons[0] ?? "Scored from the factors available on this observation.");
      const job = upsertJob(item, "ATTENTION ENGINE", reason);
      if (!existing) {
        jobsOpened++;
        emitEvent({
          type: "RESEARCH_CREATED",
          source: "GLOBAL BRAIN",
          target: job.targetLabel,
          targetKey: job.targetKey,
          message: reason,
          severity: item.klass === "CRITICAL" ? "UNUSUAL" : "INFO",
          confidence: a.confidence.score,
        });
      }

      // RESEARCH → MULTI-PASS EXECUTION (never past available data)
      const history = getHistory(a.pair.key);
      const meta = advancePass(job, a, history.length, gov.defaultDepth);
      passes++;

      // AGENTS → EVIDENCE → MEMORY
      memoryRecords += commitAssessment(a, { jobId: job.id, source: `JOB ${job.id}` });
      recordAgentTiming(a, 8);

      // EVIDENCE → HYPOTHESES, DEBATE
      hyp += syncHypotheses(a, history.length > 1 ? `${history.length} observations recorded locally` : undefined).length;
      cons += syncContradictions(a).length;

      // CURIOSITY
      const recall = recallTarget(a.pair.key, a);
      qs += askAbout(a, history, { seenBefore: recall.seenBefore }).length;

      // CONFIDENCE CALIBRATION
      if (recordCalibrationCase(a, meta.passName)) cal++;

      // MONITORING → REASSESSMENT
      if (recall.changedSince.length) {
        reopened++;
        emitEvent({
          type: "CONFIDENCE_CHANGED",
          source: "MONITORING",
          target: job.targetLabel,
          targetKey: job.targetKey,
          message: recall.changedSince.join(" · "),
          severity: "NOTABLE",
          confidence: a.confidence.score,
        });
      }
    }

    // duplicate research coordination
    for (const g of duplicateResearch()) mergeDuplicates(g);

    // outcome evaluation feeds calibration and agent performance
    const resolved = evaluateOpenCases();

    // real failure → incident
    if (mi.query.isError || (mi.envelope && !mi.envelope.ok)) {
      openIncident({
        kind: "API FAILURE",
        title: "Market data request failed",
        what: mi.envelope?.error ?? "The market snapshot request did not return data",
        why: "Upstream returned an error or timed out after retries with exponential backoff",
        affected: "Observations, attention scoring, all research passes",
        action: "Requests retry automatically; cached observations are served and clearly marked STALE",
        source: "DATA ROUTER",
      });
    }

    setCycle({
      ranAt: started,
      observations: mi.assessments.length,
      attentionConsidered: queue.length,
      jobsOpened,
      passesAdvanced: passes,
      memoryRecords,
      hypotheses: hyp,
      contradictions: cons,
      questions: qs,
      calibrationCases: cal,
      resolvedCases: resolved,
      reopened,
      durationMs: Date.now() - started,
      note: candidates.length
        ? `${candidates.length} target(s) met the research threshold this cycle`
        : "No target met the research threshold on this observation — no jobs were created",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mi.query.dataUpdatedAt, mi.assessments.length]);

  const jobs = useMemo(() => getJobs(), [tick, cycle]);
  const monitoring = useMemo(() => monitoringConditions(), [tick, cycle]);

  return { ...mi, queue, cycle, jobs, monitoring, getMeta, tick };
}

/** Subscribe a component to any local store change. */
export function useStoreTick(subscribe: (fn: () => void) => () => void): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), [subscribe]);
  return tick;
}
