import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { attentionQueue, warrantsResearch } from "@/lib/attention";
import {
  JOB_ENGINE_VERSION,
  cancelJob,
  clearJobs,
  getJobs,
  subscribeJobs,
  upsertJob,
  type JobStatus,
  type ResearchJob,
} from "@/lib/jobs";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/research")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Research Queue — Market Intelligence OS" },
      {
        name: "description",
        content:
          "Research job manager: what is being investigated, why it was queued, which agents are assigned, and which required data is missing.",
      },
      { property: "og:title", content: "Research Queue — Market Intelligence OS" },
      {
        property: "og:description",
        content: "Real research jobs over real observations. Jobs missing required data stay in WAITING_FOR_DATA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResearchPage,
});

const STATUS_TONE: Record<JobStatus, string> = {
  QUEUED: "border-border text-muted-foreground",
  RUNNING: "border-cyan/60 text-cyan",
  WAITING_FOR_DATA: "border-signal-mid/60 text-signal-mid",
  DEBATING: "border-violet/60 text-violet",
  SYNTHESIZING: "border-electric/60 text-electric",
  MONITORING: "border-signal-low/60 text-signal-low",
  COMPLETE: "border-signal-low/60 text-signal-low",
  FAILED: "border-signal-extreme/60 text-signal-extreme",
};

function ResearchPage() {
  const { assessments, envelope, query } = useMarketIntelligence();
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    setJobs(getJobs());
    return subscribeJobs(() => setJobs(getJobs()));
  }, []);

  const queue = useMemo(() => attentionQueue(assessments), [assessments]);

  // AUTOMATIC SCHEDULING: only classifications at UNUSUAL or above are worth
  // spending analysis on, and only the top slice per cycle.
  useEffect(() => {
    if (!auto || !queue.length) return;
    for (const item of queue.filter(warrantsResearch).slice(0, 12)) {
      upsertJob(item, "ATTENTION ENGINE", item.reasons[0] ?? `Attention classification ${item.klass}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, query.dataUpdatedAt]);

  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <TerminalShell>
      <SectionTitle sub="Every job records the reason it exists, the agents assigned to it and the data it could not obtain. Nothing advances past the data it actually has.">
        RESEARCH QUEUE
      </SectionTitle>

      <Panel className="mb-4" title="SCHEDULER" right={<Tag kind="AGENT" />}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAuto((v) => !v)}
            className={cn(
              "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
              auto ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-border text-muted-foreground",
            )}
          >
            AUTOMATIC SCHEDULING {auto ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => clearJobs()}
            className="num rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            CLEAR QUEUE
          </button>
          {Object.entries(counts).map(([s, n]) => (
            <span key={s} className="label-xs">
              {s} {n}
            </span>
          ))}
          <span className="label-xs ml-auto">{JOB_ENGINE_VERSION}</span>
        </div>
      </Panel>

      {!jobs.length ? (
        <EmptyState
          title="NO RESEARCH JOBS"
          hint="Jobs are created when the attention engine classifies an observation at UNUSUAL or above. Open the attention engine to queue one manually."
          action={
            <Link to="/attention" className="num text-[11px] tracking-[0.14em] text-cyan hover:underline">
              ATTENTION ENGINE →
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <Panel key={j.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="num text-sm">{j.targetLabel}</p>
                  <p className="label-xs mt-1">
                    {j.id} · {j.origin} · created {clockOf(j.createdAt)} · updated {clockOf(j.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]", STATUS_TONE[j.status])}>
                    {j.status}
                  </span>
                  <span className="num text-[10px] text-unknown">
                    PRIORITY {j.priority} · {j.urgency}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">REASON: {j.reason}</p>

              <div className="mt-3 grid gap-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="label-xs">ASSIGNED AGENTS</p>
                  <p className="num mt-0.5 leading-snug text-muted-foreground">{j.assignedAgents.length} agents</p>
                </div>
                <div>
                  <p className="label-xs">ANALYSIS PASSES</p>
                  <p className="num mt-0.5 text-muted-foreground">{j.apiCalls}</p>
                </div>
                <div>
                  <p className="label-xs">CONTRADICTIONS / HYPOTHESES</p>
                  <p className="num mt-0.5 text-muted-foreground">
                    {j.contradictions} / {j.hypotheses}
                  </p>
                </div>
                <div>
                  <p className="label-xs">MINORITY OPINION</p>
                  <p className="num mt-0.5 leading-snug text-muted-foreground">{j.minorityVote ?? "NONE RECORDED"}</p>
                </div>
              </div>

              {j.missingData.length > 0 && (
                <p className="mt-3 text-[11px] text-signal-mid">
                  MISSING REQUIRED DATA: {j.missingData.join(", ")}
                </p>
              )}

              <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                {j.findings.map((f, i) => (
                  <li key={i}>— {f}</li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  to="/room"
                  search={{ key: j.targetKey }}
                  className="num text-[10px] tracking-[0.14em] text-cyan hover:underline"
                >
                  OPEN AGENT ROOM →
                </Link>
                <button
                  onClick={() => cancelJob(j.id)}
                  className="num text-[10px] tracking-[0.14em] text-muted-foreground hover:text-signal-extreme"
                >
                  CANCEL JOB
                </button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <div className="mt-4">
        <SourceLine
          observedAt={envelope?.observedAt ?? null}
          engineVersion={JOB_ENGINE_VERSION}
          cached={envelope?.cached}
          stale={envelope?.stale}
        />
      </div>
    </TerminalShell>
  );
}
