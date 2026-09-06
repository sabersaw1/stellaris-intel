import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { CURIOSITY_ENGINE_VERSION, clearQuestions, getQuestions, setQuestionStatus, subscribeQuestions, type QuestionStatus } from "@/lib/questions";
import { upsertJob } from "@/lib/jobs";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/questions")({
  head: () => ({
    meta: [
      { title: "Open Questions — Market Intelligence OS" },
      {
        name: "description",
        content: "Questions the system generated itself from real gaps: unexplained changes, contradictory evidence, missing data and uncertain classifications.",
      },
      { property: "og:title", content: "Open Questions — Market Intelligence OS" },
      { property: "og:description", content: "Questions that cannot be answered with available data are marked UNANSWERABLE — DATA MISSING." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuestionsPage,
});

const STATUSES: (QuestionStatus | "ALL")[] = ["ALL", "OPEN", "RESEARCHING", "ANSWERED", "UNANSWERABLE — DATA MISSING"];

function QuestionsPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeQuestions);
  const all = useMemo(() => getQuestions(), [tick, brain.cycle]);
  const [status, setStatus] = useState<QuestionStatus | "ALL">("ALL");
  const rows = status === "ALL" ? all : all.filter((q) => q.status === status);

  return (
    <TerminalShell>
      <SectionTitle sub="The curiosity engine raises a question whenever the data itself is incomplete, contradictory or unexplained. Nothing here is invented; each question names the condition that produced it.">
        OPEN QUESTIONS
      </SectionTitle>

      <Panel className="mb-4" title="STATUS" right={<Tag kind="CALCULATED" />}>
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
                status === s ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s} <span className="text-unknown">{s === "ALL" ? all.length : all.filter((q) => q.status === s).length}</span>
            </button>
          ))}
          <Btn tone="danger" onClick={() => clearQuestions()}>CLEAR</Btn>
        </div>
      </Panel>

      {!rows.length ? (
        <EmptyState title="NO OPEN QUESTIONS" hint="Questions are raised from real conditions — a material unexplained change, an agent contradiction, missing required fields or low confidence. None of those currently apply." />
      ) : (
        <div className="space-y-3">
          {rows.map((q) => {
            const a = brain.assessments.find((x) => x.pair.key === q.targetKey) ?? null;
            return (
              <Panel key={q.id} title={q.kind} right={<StatePill label={q.status} tone={toneFor(q.status)} />}>
                <p className="text-sm text-foreground">{q.question}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">BECAUSE — {q.because}</p>
                <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                  <KV label="TARGET" value={q.targetLabel} />
                  <KV label="RAISED" value={new Date(q.createdAt).toLocaleString()} />
                  <KV label="LAST UPDATE" value={clockOf(q.updatedAt)} />
                  <KV label="LINKED JOB" value={q.jobId ?? "NONE"} />
                </div>
                <p className="label-xs mt-3 mb-1">DATA REQUIRED TO ANSWER</p>
                {q.requiredData.length === 0 ? (
                  <p className="text-xs text-unknown">NOT SPECIFIED</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {q.requiredData.map((d) => (
                      <li key={d}><StatePill label={d} tone="muted" /></li>
                    ))}
                  </ul>
                )}
                {q.answer && <p className="mt-2 text-[11px] text-signal-low">ANSWER — {q.answer}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn
                    tone="primary"
                    disabled={!a || q.status === "RESEARCHING"}
                    onClick={() => {
                      if (!a) return;
                      const item = brain.queue.find((i) => i.key === q.targetKey);
                      if (!item) return;
                      const job = upsertJob(item, "USER", `Opened to answer: ${q.question}`);
                      setQuestionStatus(q.id, "RESEARCHING", { jobId: job.id });
                    }}
                    title={a ? "Opens a real research job for this question" : "The target is not in the current observation set"}
                  >
                    INVESTIGATE
                  </Btn>
                  <Btn onClick={() => setQuestionStatus(q.id, "UNANSWERABLE — DATA MISSING")}>MARK UNANSWERABLE</Btn>
                  {q.status !== "ANSWERED" && <Btn onClick={() => setQuestionStatus(q.id, "OPEN")}>REOPEN</Btn>}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={CURIOSITY_ENGINE_VERSION} />
      </div>
    </TerminalShell>
  );
}
