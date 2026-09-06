/**
 * OPEN QUESTIONS + CURIOSITY ENGINE
 *
 * The curiosity engine reads real observations and only forms a question when a
 * concrete data condition justifies it: an unexplained recorded change, a genuine
 * agent contradiction, a missing required field, a low-confidence classification
 * or incomplete research. It does not manufacture activity, and every question
 * states the observation that produced it.
 */

import { createStore, newId } from "./persist";
import { emitEvent } from "./events";
import { contradictionsOf } from "./reasoning";
import { changeReport } from "./changes";
import type { Assessment } from "./dex-types";
import type { ObservationPoint } from "./local-store";

export type QuestionKind =
  | "UNEXPLAINED CHANGE"
  | "CONTRADICTORY EVIDENCE"
  | "INSUFFICIENT DATA"
  | "UNCERTAIN CLASSIFICATION"
  | "INCOMPLETE RESEARCH"
  | "PRIOR CASE COMPARISON";

export type QuestionStatus = "OPEN" | "RESEARCHING" | "ANSWERED" | "UNANSWERABLE — DATA MISSING";

export type OpenQuestion = {
  id: string;
  targetKey: string;
  targetLabel: string;
  kind: QuestionKind;
  question: string;
  because: string;
  requiredData: string[];
  status: QuestionStatus;
  createdAt: number;
  updatedAt: number;
  jobId: string | null;
  answer: string | null;
};

const store = createStore<OpenQuestion[]>("dmi.questions.v1", []);
const MAX = 300;

export const subscribeQuestions = store.subscribe;
export const CURIOSITY_ENGINE_VERSION = "curiosity-engine v1.0";

export function getQuestions(): OpenQuestion[] {
  return store.get().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function questionsForTarget(targetKey: string): OpenQuestion[] {
  return store.get().filter((q) => q.targetKey === targetKey);
}

function put(q: Omit<OpenQuestion, "id" | "createdAt" | "updatedAt" | "status" | "jobId" | "answer">) {
  const list = store.get();
  const prior = list.find((x) => x.targetKey === q.targetKey && x.question === q.question);
  const now = Date.now();
  if (prior) {
    store.set(list.map((x) => (x.id === prior.id ? { ...x, ...q, updatedAt: now } : x)));
    return prior;
  }
  const created: OpenQuestion = { ...q, id: newId("q"), createdAt: now, updatedAt: now, status: "OPEN", jobId: null, answer: null };
  store.set([created, ...list].slice(0, MAX));
  emitEvent({
    type: "QUESTION_OPENED",
    source: CURIOSITY_ENGINE_VERSION,
    target: q.targetLabel,
    targetKey: q.targetKey,
    message: q.question,
    severity: "INFO",
    status: "OPEN",
  });
  return created;
}

/** Derive questions from one assessment plus this browser's recorded history. */
export function askAbout(a: Assessment, history: ObservationPoint[], opts: { seenBefore?: boolean } = {}): OpenQuestion[] {
  const label = `${a.pair.baseSymbol}/${a.pair.quoteSymbol} · ${a.pair.chainId}/${a.pair.dexId}`;
  const out: OpenQuestion[] = [];

  const { rows } = changeReport(history);
  const material = rows.filter((c) => c.changePct !== null && Math.abs(c.changePct) >= 15);
  for (const c of material.slice(0, 2)) {
    out.push(
      put({
        targetKey: a.pair.key,
        targetLabel: label,
        kind: "UNEXPLAINED CHANGE",
        question: `Why did ${c.metric} change by ${c.changePct === null ? "an unrecorded amount" : `${c.changePct.toFixed(1)}%`}?`,
        because: `Recorded observations moved ${c.previous} → ${c.current} between consecutive passes.`,
        requiredData: ["CONSECUTIVE OBSERVATIONS OF THIS METRIC", "TRANSACTION FLOW FOR THE SAME WINDOW"],
      }),
    );
  }

  for (const c of contradictionsOf(a).slice(0, 2)) {
    out.push(
      put({
        targetKey: a.pair.key,
        targetLabel: label,
        kind: "CONTRADICTORY EVIDENCE",
        question: `Which evidence resolves ${c.topic} between ${c.sideA.vote} and ${c.sideB.vote}?`,
        because: `${c.sideA.agents.length} agent(s) read ${c.sideA.vote} while ${c.sideB.agents.length} read ${c.sideB.vote} on the same observation.`,
        requiredData: ["PEER BASELINE", "HOLDER DISTRIBUTION (UNSUPPORTED BY CURRENT SOURCE)"],
      }),
    );
  }

  const missing: string[] = [];
  if (a.pair.liquidityUsd === null) missing.push("LIQUIDITY USD");
  if (a.pair.txns.h24 === null) missing.push("TRANSACTIONS 24H");
  if (a.pair.pairCreatedAt === null) missing.push("PAIR CREATION TIME");
  if (!a.peerContext.available) missing.push("PEER BASELINE");
  if (missing.length) {
    out.push(
      put({
        targetKey: a.pair.key,
        targetLabel: label,
        kind: "INSUFFICIENT DATA",
        question: `What data is missing before this target can be classified with confidence?`,
        because: `${missing.length} required field(s) were absent from the observation: ${missing.join(", ")}.`,
        requiredData: missing,
      }),
    );
  }

  if (a.risk.score !== null && a.confidence.band === "LOW") {
    out.push(
      put({
        targetKey: a.pair.key,
        targetLabel: label,
        kind: "UNCERTAIN CLASSIFICATION",
        question: `Is the ${a.risk.band} classification reliable at ${a.confidence.score}/100 confidence?`,
        because: `Classification was produced from ${a.risk.factors.filter((f) => f.dataAvailable).length} scored dimensions at ${a.confidence.completeness}% field completeness.`,
        requiredData: ["ADDITIONAL SCORED DIMENSIONS", "FRESHER OBSERVATION"],
      }),
    );
  }

  if (history.length < 3) {
    out.push(
      put({
        targetKey: a.pair.key,
        targetLabel: label,
        kind: "INCOMPLETE RESEARCH",
        question: `Is this behaviour unusual over time, or only in this single observation?`,
        because: `Only ${history.length} observation(s) of this target have been recorded, which is not enough for a temporal comparison.`,
        requiredData: ["AT LEAST 3 RECORDED OBSERVATIONS"],
      }),
    );
  }

  if (opts.seenBefore) {
    out.push(
      put({
        targetKey: a.pair.key,
        targetLabel: label,
        kind: "PRIOR CASE COMPARISON",
        question: `Have we seen this before, and what changed since the previous investigation?`,
        because: "Prior research records exist for this target in memory.",
        requiredData: ["STORED PRIOR CLASSIFICATION", "CURRENT CLASSIFICATION"],
      }),
    );
  }

  return out;
}

export function setQuestionStatus(id: string, status: QuestionStatus, extra: { jobId?: string; answer?: string } = {}) {
  store.set(
    store.get().map((q) =>
      q.id === id
        ? {
            ...q,
            status,
            updatedAt: Date.now(),
            jobId: extra.jobId ?? q.jobId,
            answer: extra.answer ?? q.answer,
          }
        : q,
    ),
  );
  if (status === "ANSWERED") {
    const q = store.get().find((x) => x.id === id);
    if (q)
      emitEvent({
        type: "QUESTION_RESOLVED",
        source: CURIOSITY_ENGINE_VERSION,
        target: q.targetLabel,
        targetKey: q.targetKey,
        message: `Question resolved: ${q.question}`,
        status: "RESOLVED",
      });
  }
}

export function clearQuestions() {
  store.clear();
}
