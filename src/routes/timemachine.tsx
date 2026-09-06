import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, FreshnessBadge, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useGlobalBrain } from "@/hooks/useBrain";
import { getHistory, historyCounts, type ObservationPoint } from "@/lib/local-store";
import { getMemory } from "@/lib/memory";
import { getEvents } from "@/lib/events";
import { changeReport } from "@/lib/changes";
import { clockOf, price, usd, count } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/timemachine")({
  head: () => ({
    meta: [
      { title: "Historical Time Machine — Market Intelligence OS" },
      {
        name: "description",
        content: "Step through recorded observations and see the system exactly as it was at that moment, with no future information injected.",
      },
      { property: "og:title", content: "Historical Time Machine — Market Intelligence OS" },
      { property: "og:description", content: "LIVE, HISTORICAL and SIMULATION states are always distinguished." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TimeMachinePage,
});

type Mode = "LIVE" | "HISTORICAL" | "SIMULATION";

function TimeMachinePage() {
  const brain = useGlobalBrain();
  const counts = useMemo(() => historyCounts(), [brain.cycle]);
  const targets = useMemo(
    () =>
      Object.entries(counts)
        .filter(([, n]) => n >= 1)
        .sort((a, b) => b[1] - a[1]),
    [counts],
  );
  const [key, setKey] = useState<string | null>(null);
  const activeKey = key ?? targets[0]?.[0] ?? null;
  const points: ObservationPoint[] = activeKey ? getHistory(activeKey) : [];
  const [idx, setIdx] = useState<number | null>(null);
  const cursor = idx === null ? points.length - 1 : Math.min(idx, points.length - 1);
  const mode: Mode = idx === null || cursor === points.length - 1 ? "LIVE" : "HISTORICAL";
  const point = points[cursor] ?? null;

  const assessment = brain.assessments.find((a) => a.pair.key === activeKey) ?? null;
  const item = brain.queue.find((q) => q.key === activeKey) ?? null;
  const upTo = points.slice(0, cursor + 1);
  const report = changeReport(upTo, {
    attentionNow: mode === "LIVE" ? item?.score ?? null : null,
    researchStateNow: mode === "LIVE" ? brain.jobs.find((j) => j.targetKey === activeKey)?.status ?? null : null,
  });

  // Records and events are filtered to the cursor time: no future information.
  const cutoff = point?.t ?? Date.now();
  const records = getMemory().filter((r) => r.targetKey === activeKey && r.t <= cutoff + 1000);
  const events = getEvents().filter((e) => e.targetKey === activeKey && e.t <= cutoff + 1000);

  if (!targets.length)
    return (
      <TerminalShell>
        <SectionTitle sub="The time machine replays observations this terminal actually recorded.">HISTORICAL TIME MACHINE</SectionTitle>
        <EmptyState title="NO RECORDED OBSERVATIONS YET" hint="Observations are recorded on every market cycle. Leave the terminal open and history accumulates; nothing is back-filled." />
      </TerminalShell>
    );

  return (
    <TerminalShell>
      <SectionTitle sub="Move through recorded observations. Historical views contain only what was known at that point — no later information is injected.">
        HISTORICAL TIME MACHINE
      </SectionTitle>

      <Panel className="mb-4" title="STATE" right={<Tag kind="VISUAL" />}>
        <div className="flex flex-wrap items-center gap-2">
          <StatePill label={mode} tone={mode === "LIVE" ? "ok" : "agent"} />
          <StatePill label="SIMULATION: NOT RUN" tone="muted" title="Simulation replays a recorded sequence; it never fabricates a future state" />
          <span className="num text-[10px] tracking-[0.12em] text-muted-foreground">
            OBSERVATION {cursor + 1} / {points.length} · {point ? new Date(point.t).toLocaleString() : "—"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Btn onClick={() => setIdx(0)}>FIRST</Btn>
          <Btn onClick={() => setIdx(Math.max(0, cursor - 1))}>◀ PREVIOUS</Btn>
          <Btn onClick={() => setIdx(Math.min(points.length - 1, cursor + 1))}>NEXT ▶</Btn>
          <Btn tone="primary" onClick={() => setIdx(null)}>RETURN TO LIVE</Btn>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          value={cursor}
          onChange={(e) => setIdx(Number(e.target.value))}
          className="mt-3 w-full accent-[var(--cyan)]"
        />
      </Panel>

      <Panel className="mb-4" title="TARGET" right={<Tag kind="LIVE" />}>
        <div className="flex flex-wrap gap-2">
          {targets.slice(0, 24).map(([k, n]) => {
            const a = brain.assessments.find((x) => x.pair.key === k);
            return (
              <button
                key={k}
                onClick={() => {
                  setKey(k);
                  setIdx(null);
                }}
                className={cn(
                  "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.12em]",
                  activeKey === k ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {a ? a.pair.baseSymbol : k.split(":")[0]} <span className="text-unknown">{n}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="MARKET OBSERVATION AT CURSOR" right={<FreshnessBadge observedAt={point?.t ?? null} historical={mode === "HISTORICAL"} />}>
          {!point ? (
            <DataState state="WAITING FOR DATA" detail="No observation is recorded at this position." />
          ) : (
            <>
              <KV label="RECORDED AT" value={new Date(point.t).toLocaleString()} />
              <KV label="PRICE USD" value={price(point.priceUsd)} />
              <KV label="LIQUIDITY USD" value={usd(point.liquidityUsd)} />
              <KV label="VOLUME 24H" value={usd(point.volume24h)} />
              <KV label="TRANSACTIONS 24H" value={count(point.txns24h)} />
              <KV label="FDV" value={usd(point.fdv)} />
              <KV label="OBSERVED RISK SCORE" value={point.riskScore === null ? "NOT AVAILABLE" : `${point.riskScore}/100`} />
              <KV label="CONFIDENCE" value={point.confidence === null ? "NOT AVAILABLE" : `${point.confidence}/100`} />
              <KV label="ANOMALIES AT THAT TIME" value={String(point.anomalyCount)} />
            </>
          )}
        </Panel>

        <Panel title="INTELLIGENCE STATE AT CURSOR" right={<Tag kind="AGENT" />}>
          {mode === "LIVE" && assessment ? (
            <>
              <KV label="ATTENTION" value={item?.score === null || item === null ? "NOT SCORED" : `${item.score} (${item.klass})`} />
              <KV label="CLASSIFICATION" value={assessment.risk.score === null ? "INSUFFICIENT DATA" : `${assessment.risk.band} ${assessment.risk.score}/100`} />
              <KV label="CONFIDENCE" value={`${assessment.confidence.band} ${assessment.confidence.score}/100`} />
              <KV label="AGENT READINGS" value={`${assessment.agents.length} agents · ${assessment.consensus.disagree} dissenting`} />
              <KV label="ANOMALIES" value={String(assessment.anomalies.length)} />
              <KV label="RESEARCH STATE" value={brain.jobs.find((j) => j.targetKey === activeKey)?.status ?? "NO JOB OPEN"} />
            </>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Historical view: only records written at or before {point ? new Date(point.t).toLocaleTimeString([], { hour12: false }) : "—"} are shown.
              </p>
              {records.length === 0 ? (
                <DataState state="INSUFFICIENT DATA" detail="No intelligence records were stored at or before this observation." />
              ) : (
                <ul className="space-y-1.5">
                  {records.slice(0, 10).map((r) => (
                    <li key={r.id} className="border-b border-border/40 pb-1.5 last:border-0">
                      <div className="flex items-center gap-2">
                        <StatePill label={r.kind} tone={toneFor(r.kind)} />
                        <span className="num text-[10px] text-unknown">{clockOf(r.t)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{r.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>

        <Panel title="CHANGES UP TO THIS POINT" right={<Tag kind="CALCULATED" />}>
          {!report.comparable ? (
            <DataState state="INSUFFICIENT DATA" detail="At least two recorded observations are required for a comparison." />
          ) : (
            <Table head={["METRIC", "PREVIOUS", "CURRENT", "CHANGE"]}>
              {report.rows.map((r) => (
                <tr key={r.metric}>
                  <Td className="num">{r.metric}</Td>
                  <Td className={cn("num", r.state === "NOT AVAILABLE" && "text-unknown")}>{r.previous}</Td>
                  <Td className={cn("num", r.state === "NOT AVAILABLE" && "text-unknown")}>{r.current}</Td>
                  <Td className={cn("num", r.direction === "UP" ? "text-signal-low" : r.direction === "DOWN" ? "text-signal-extreme" : "text-unknown")}>{r.change}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="EVENTS AT OR BEFORE CURSOR" right={<Tag kind="CALCULATED" />}>
          {events.length === 0 ? (
            <p className="text-xs text-unknown">NO EVENTS RECORDED FOR THIS TARGET UP TO THIS POINT</p>
          ) : (
            <ul className="space-y-1.5">
              {events.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-start gap-2 border-b border-border/40 pb-1.5 last:border-0">
                  <span className="num shrink-0 text-[10px] text-unknown">{clockOf(e.t)}</span>
                  <StatePill label={e.type} tone={toneFor(e.severity)} />
                  <span className="min-w-0 text-[11px] text-muted-foreground">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion="time-machine v1.0" />
      </div>
    </TerminalShell>
  );
}
