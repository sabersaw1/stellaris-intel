import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Fullscreenable, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { AiCore } from "@/components/cosmos/AiCore";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { healthQuery } from "@/hooks/useMarket";
import { getEvents, eventRate, subscribeEvents } from "@/lib/events";
import { telemetry, freshnessBuckets } from "@/lib/telemetry";
import { resourceReport, GOVERNOR_VERSION } from "@/lib/governor";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/neural")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Neural Link — Market Intelligence OS" },
      {
        name: "description",
        content: "Live view of the reasoning system: which stage is active, what each agent is doing right now, event throughput and measured resource use.",
      },
      { property: "og:title", content: "Neural Link — Market Intelligence OS" },
      { property: "og:description", content: "Animation reflects real activity; idle is shown as idle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NeuralPage,
});

const STAGES = ["OBSERVATION", "ATTENTION", "RESEARCH", "AGENT ANALYSIS", "DEBATE", "SYNTHESIS", "MEMORY", "MONITORING"] as const;

function NeuralPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeEvents);
  const health = useQuery(healthQuery);
  const events = useMemo(() => getEvents().slice(0, 14), [tick, brain.cycle]);
  const rate = useMemo(() => eventRate(60_000), [tick]);
  const api = health.data?.api ?? null;
  const rows = useMemo(() => telemetry(brain.envelope?.observedAt ?? null, api ? { requests: api.requests, cacheHits: api.cacheHits, errors: api.errors } : null), [brain.envelope?.observedAt, api]);
  const resources = useMemo(
    () => resourceReport(api ? { requests: api.requests, cacheHits: api.cacheHits, rateLimitDeferrals: api.rateLimitDeferrals } : null),
    [api],
  );
  const buckets = useMemo(() => freshnessBuckets(brain.assessments.map((a) => ({ observedAt: a.pair.observedAt }))), [brain.assessments]);

  const cycle = brain.cycle;
  const stageState = (s: (typeof STAGES)[number]): { state: string; detail: string } => {
    if (!cycle) return { state: "WAITING FOR DATA", detail: "no observation cycle has completed yet" };
    switch (s) {
      case "OBSERVATION":
        return { state: cycle.observations > 0 ? "ACTIVE" : "WAITING FOR DATA", detail: `${cycle.observations} observations in the last cycle` };
      case "ATTENTION":
        return { state: cycle.attentionConsidered > 0 ? "ACTIVE" : "IDLE", detail: `${cycle.attentionConsidered} targets scored` };
      case "RESEARCH":
        return { state: brain.jobs.length ? "ACTIVE" : "IDLE", detail: `${brain.jobs.length} jobs · ${cycle.jobsOpened} opened this cycle` };
      case "AGENT ANALYSIS":
        return { state: cycle.memoryRecords > 0 ? "ACTIVE" : "IDLE", detail: `${cycle.memoryRecords} records written this cycle` };
      case "DEBATE":
        return { state: cycle.contradictions > 0 ? "ACTIVE" : "IDLE", detail: `${cycle.contradictions} contradictions tracked` };
      case "SYNTHESIS":
        return { state: cycle.hypotheses > 0 ? "ACTIVE" : "IDLE", detail: `${cycle.hypotheses} hypotheses updated` };
      case "MEMORY":
        return { state: cycle.memoryRecords > 0 ? "ACTIVE" : "IDLE", detail: `${cycle.calibrationCases} calibration cases recorded` };
      case "MONITORING":
        return { state: brain.monitoring.length ? "ACTIVE" : "IDLE", detail: `${brain.monitoring.length} conditions under monitoring` };
    }
  };

  return (
    <TerminalShell>
      <SectionTitle sub="The visualisation is driven by real cycle counters. When a stage has nothing to do it is shown as idle, and host-level metrics that cannot be measured in the browser are shown as unavailable.">
        NEURAL LINK
      </SectionTitle>

      <Fullscreenable title="LIVE REASONING VIEW">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Panel title="CORE" right={<Tag kind="VISUAL" />}>
            <AiCore />
            <div className="mt-3">
              <KV label="OBSERVATIONS" value={String(brain.assessments.length)} />
              <KV label="EVENT RATE" value={`${rate} per minute`} />
              <KV label="LAST CYCLE" value={cycle ? `${cycle.durationMs}ms at ${clockOf(cycle.ranAt)}` : "WAITING FOR DATA"} />
              <KV label="CYCLE NOTE" value={cycle?.note ?? "WAITING FOR DATA"} />
            </div>
          </Panel>

          <Panel title="PIPELINE STAGES" right={<Tag kind="CALCULATED" />}>
            <Table head={["STAGE", "STATE", "BASIS"]}>
              {STAGES.map((s) => {
                const st = stageState(s);
                return (
                  <tr key={s}>
                    <Td className="num">{s}</Td>
                    <Td><StatePill label={st.state} tone={st.state === "ACTIVE" ? "ok" : st.state === "IDLE" ? "info" : "muted"} /></Td>
                    <Td className="text-muted-foreground">{st.detail}</Td>
                  </tr>
                );
              })}
            </Table>
          </Panel>
        </div>
      </Fullscreenable>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="RECENT SYSTEM ACTIVITY" right={<Tag kind="LIVE" />}>
          {events.length === 0 ? (
            <p className="text-xs text-unknown">NO ACTIVITY RECORDED YET</p>
          ) : (
            <ul className="space-y-1">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2 border-b border-border/40 pb-1 last:border-0">
                  <span className="num shrink-0 text-[10px] text-unknown">{clockOf(e.t)}</span>
                  <span className="num shrink-0 text-[10px] text-cyan">{e.type}</span>
                  <span className="min-w-0 text-[11px] text-muted-foreground">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="LIVE TELEMETRY" right={<Tag kind="CALCULATED" />}>
          <Table head={["METRIC", "VALUE", "STATE", "DETAIL"]}>
            {rows.map((r) => (
              <tr key={r.label}>
                <Td className="num">{r.label}</Td>
                <Td className={cn("num", r.state === "UNAVAILABLE" && "text-unknown")}>{r.value}</Td>
                <Td><StatePill label={r.state} tone={toneFor(r.state)} /></Td>
                <Td className="text-[11px] text-muted-foreground">{r.detail}</Td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title="DATA FRESHNESS DISTRIBUTION" right={<Tag kind="CALCULATED" />}>
          {Object.entries(buckets).map(([k, v]) => (
            <KV key={k} label={k} value={String(v)} />
          ))}
        </Panel>

        <Panel title="RESOURCE USE" right={<Tag kind="CALCULATED" />}>
          <Table head={["RESOURCE", "USED", "LIMIT", "UTILISATION", "STATE"]}>
            {resources.map((r) => (
              <tr key={r.resource}>
                <Td className="num">{r.resource}</Td>
                <Td className={cn("num", r.state === "UNAVAILABLE" && "text-unknown")}>{r.used}</Td>
                <Td className="num text-muted-foreground">{r.limit}</Td>
                <Td className="num">{r.utilisationPct === null ? "—" : `${r.utilisationPct}%`}</Td>
                <Td><StatePill label={r.state} tone={toneFor(r.state)} /></Td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={cycle?.ranAt ?? null} engineVersion={GOVERNOR_VERSION} />
      </div>
    </TerminalShell>
  );
}
