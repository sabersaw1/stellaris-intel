import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { subscribeJobs } from "@/lib/jobs";
import { allPostMortems, POSTMORTEM_ENGINE_VERSION } from "@/lib/postmortem";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/postmortems")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Research Post-Mortems — Market Intelligence OS" },
      {
        name: "description",
        content: "Structured review of every research job: initial reading, evidence, disagreements, what changed, and whether the classification held.",
      },
      { property: "og:title", content: "Research Post-Mortems — Market Intelligence OS" },
      { property: "og:description", content: "Outcome is reported only when later recorded observations permit an evaluation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PostMortemPage,
});

function PostMortemPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeJobs);
  const reports = useMemo(() => allPostMortems(), [tick, brain.cycle]);
  const [id, setId] = useState<string | null>(null);
  const active = reports.find((r) => r.job.id === id) ?? reports[0] ?? null;

  return (
    <TerminalShell>
      <SectionTitle sub="Each completed or long-running investigation is reviewed against what was actually recorded afterwards. Where no later observation exists, the outcome stays unavailable rather than assumed.">
        RESEARCH POST-MORTEMS
      </SectionTitle>

      {!reports.length ? (
        <EmptyState title="NO RESEARCH JOBS TO REVIEW" hint="Post-mortems appear once the system has opened research jobs. Jobs are opened from real attention scores, not on a schedule." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
          <Panel title={`REVIEWABLE INVESTIGATIONS · ${reports.length}`} right={<Tag kind="CALCULATED" />}>
            <Table head={["TARGET", "PASS STATE", "OUTCOME"]}>
              {reports.map((r) => (
                <tr key={r.job.id} onClick={() => setId(r.job.id)} className={cn("cursor-pointer", active?.job.id === r.job.id && "bg-accent/40")}>
                  <Td className="num max-w-[10rem] truncate">{r.job.targetLabel}</Td>
                  <Td className="text-muted-foreground">{r.passState}</Td>
                  <Td><StatePill label={r.outcome} tone={toneFor(r.outcome)} /></Td>
                </tr>
              ))}
            </Table>
          </Panel>

          {active && (
            <div className="space-y-4">
              <Panel title="WHAT WAS THE QUESTION?" right={<Tag kind="AGENT" />}>
                <p className="text-xs text-foreground">{active.question}</p>
                <div className="mt-3">
                  <KV label="TARGET" value={active.job.targetLabel} />
                  <KV label="OPENED" value={new Date(active.job.createdAt).toLocaleString()} />
                  <KV label="ORIGIN" value={active.job.origin} />
                  <KV label="REASON" value={active.job.reason} />
                  <KV label="PASS STATE" value={active.passState} />
                  <KV label="AGENTS INVOLVED" value={active.agents.length ? active.agents.join(", ") : "NOT AVAILABLE"} />
                </div>
              </Panel>

              <Panel title="WHAT DID WE INITIALLY THINK?" right={<Tag kind="CALCULATED" />}>
                <KV label="INITIAL CLASSIFICATION" value={active.initialClassification ?? "NOT AVAILABLE"} />
                <KV label="INITIAL CONFIDENCE" value={active.initialConfidence === null ? "NOT AVAILABLE" : `${active.initialConfidence}/100`} />
                <p className="label-xs mt-3 mb-1">EVIDENCE RECORDED AT THE TIME</p>
                {active.initialEvidence.length === 0 ? (
                  <p className="text-xs text-unknown">NO EVIDENCE RECORDS STORED FOR THIS TARGET</p>
                ) : (
                  <ul className="space-y-1">
                    {active.initialEvidence.map((e, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">— {e}</li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="WHERE DID AGENTS DISAGREE?" right={<Tag kind="AGENT" />}>
                {active.disagreements.length === 0 ? (
                  <p className="text-xs text-unknown">NO CONTRADICTIONS RECORDED FOR THIS INVESTIGATION</p>
                ) : (
                  <ul className="space-y-2">
                    {active.disagreements.map((d, i) => (
                      <li key={i} className="border-b border-border/40 pb-2 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="num text-[11px] text-foreground">{d.topic}</span>
                          <StatePill label={d.status} tone={toneFor(d.status)} />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">A — {d.claimA}</p>
                        <p className="text-[11px] text-muted-foreground">B — {d.claimB}</p>
                        {d.minority && <p className="mt-1 text-[11px] text-violet">MINORITY PRESERVED — {d.minority}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="WHAT CHANGED AFTERWARDS?" right={<Tag kind="CALCULATED" />}>
                <KV label="COMPARISON WINDOW" value={active.changeWindow ?? "INSUFFICIENT DATA"} />
                <KV label="SUBSEQUENT OBSERVATIONS" value={String(active.subsequentObservations)} />
                {active.changes.length === 0 ? (
                  <p className="mt-2 text-xs text-unknown">INSUFFICIENT DATA — at least two recorded observations are required</p>
                ) : (
                  <Table head={["METRIC", "PREVIOUS", "CURRENT", "CHANGE"]}>
                    {active.changes.map((c) => (
                      <tr key={c.metric}>
                        <Td className="num">{c.metric}</Td>
                        <Td className={cn("num", c.state === "NOT AVAILABLE" && "text-unknown")}>{c.previous}</Td>
                        <Td className={cn("num", c.state === "NOT AVAILABLE" && "text-unknown")}>{c.current}</Td>
                        <Td className="num">{c.change}</Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>

              <Panel title="WHAT DO WE THINK NOW, AND WHAT DID WE LEARN?" right={<Tag kind="AGENT" />}>
                <KV label="FINAL CLASSIFICATION" value={active.finalClassification ?? "NOT AVAILABLE"} />
                <KV label="FINAL CONFIDENCE" value={active.finalConfidence === null ? "NOT AVAILABLE" : `${active.finalConfidence}/100`} />
                <KV label="OUTCOME" value={active.outcome} />
                <KV label="OUTCOME BASIS" value={active.outcomeBasis} />
                <p className="label-xs mt-3 mb-1">LEARNED</p>
                {active.learned.length === 0 ? (
                  <p className="text-xs text-unknown">NOTHING RECORDED YET — lessons are written only from observed differences</p>
                ) : (
                  <ul className="space-y-1">
                    {active.learned.map((l, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">— {l}</li>
                    ))}
                  </ul>
                )}
                <p className="num mt-3 text-[10px] tracking-[0.12em] text-unknown">LAST JOB UPDATE {clockOf(active.job.updatedAt)}</p>
              </Panel>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={POSTMORTEM_ENGINE_VERSION} />
      </div>
    </TerminalShell>
  );
}
