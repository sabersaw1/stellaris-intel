import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { AGENT_DEFS } from "@/lib/analysis";
import { PERFORMANCE_ENGINE_VERSION, agentActivity, agentPerformance, schedulingWeights, subscribeTiming } from "@/lib/performance";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/performance")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Agent Performance — Market Intelligence OS" },
      {
        name: "description",
        content: "Measured agent activity — runs, findings, evidence, contradictions, processing time — kept strictly separate from outcome-based performance.",
      },
      { property: "og:title", content: "Agent Performance — Market Intelligence OS" },
      { property: "og:description", content: "Performance stays INSUFFICIENT OUTCOME DATA until resolved cases exist. Agreement is never scored as accuracy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PerformancePage,
});

function PerformancePage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeTiming);
  const activity = useMemo(() => agentActivity([...AGENT_DEFS]), [tick, brain.cycle]);
  const performance = useMemo(() => agentPerformance(), [tick, brain.cycle]);
  const weights = useMemo(() => schedulingWeights(), [tick, brain.cycle]);

  return (
    <TerminalShell>
      <SectionTitle sub="Activity is measured directly from what each agent actually produced. Performance is a separate question and stays unavailable until later observations resolve enough cases.">
        AGENT PERFORMANCE CENTER
      </SectionTitle>

      <Panel className="mb-4" title="MEASURED ACTIVITY" right={<Tag kind="AGENT" />}>
        <Table head={["AGENT", "RUNS", "FINDINGS", "EVIDENCE", "CONTRADICTIONS", "MISSING-DATA EVENTS", "ERRORS", "MEAN CONF", "MEAN TIME", "LAST RUN"]}>
          {activity.map((r) => (
            <tr key={r.agentId}>
              <Td className="num whitespace-nowrap">{r.agentNumber} {r.name}</Td>
              <Td className="num">{r.runs}</Td>
              <Td className="num">{r.findings}</Td>
              <Td className="num">{r.evidence}</Td>
              <Td className="num">{r.contradictionsIdentified}</Td>
              <Td className="num">{r.unavailableDataEvents}</Td>
              <Td className={cn("num", r.errors > 0 && "text-signal-extreme")}>{r.errors}</Td>
              <Td className={cn("num", r.meanConfidence === null && "text-unknown")}>{r.meanConfidence === null ? "NOT AVAILABLE" : `${r.meanConfidence}/100`}</Td>
              <Td className={cn("num", r.meanProcessingMs === null && "text-unknown")}>{r.meanProcessingMs === null ? "NOT MEASURED" : `${r.meanProcessingMs}ms`}</Td>
              <Td className="num text-unknown">{r.lastRanAt ? clockOf(r.lastRanAt) : "NEVER"}</Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="OUTCOME-BASED PERFORMANCE" right={<Tag kind="CALCULATED" />}>
          {performance.length === 0 ? (
            <p className="text-xs text-unknown">INSUFFICIENT OUTCOME DATA — no calibration cases recorded yet</p>
          ) : (
            <Table head={["AGENT", "RESOLVED", "CONSISTENT", "INCONSISTENT", "CONSISTENCY", "STATE"]}>
              {performance.map((p) => (
                <tr key={p.agent}>
                  <Td className="num max-w-[12rem] truncate">{p.agent}</Td>
                  <Td className="num">{p.resolvedCases}</Td>
                  <Td className="num text-signal-low">{p.consistent}</Td>
                  <Td className="num text-signal-extreme">{p.inconsistent}</Td>
                  <Td className={cn("num", p.consistencyPct === null && "text-unknown")}>{p.consistencyPct === null ? "INSUFFICIENT OUTCOME DATA" : `${p.consistencyPct}%`}</Td>
                  <Td><StatePill label={p.state} tone={toneFor(p.state)} /></Td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            An agent holding a minority position that later matches recorded observations counts as consistent. Agreement with other agents is never counted.
          </p>
        </Panel>

        <Panel title="FUTURE SCHEDULING WEIGHT" right={<Tag kind="CALCULATED" />}>
          {weights.length === 0 ? (
            <p className="text-xs text-unknown">ALL AGENTS WEIGHTED EQUALLY — no measured outcomes yet</p>
          ) : (
            <Table head={["AGENT", "WEIGHT", "BASIS"]}>
              {weights.map((w) => (
                <tr key={w.agent}>
                  <Td className="num max-w-[12rem] truncate">{w.agent}</Td>
                  <Td className="num">{w.weight.toFixed(2)}</Td>
                  <Td className="text-muted-foreground">{w.basis}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={PERFORMANCE_ENGINE_VERSION} />
      </div>
    </TerminalShell>
  );
}
