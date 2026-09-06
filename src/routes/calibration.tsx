import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import {
  CALIBRATION_ENGINE_VERSION,
  MIN_RESOLVED_CASES,
  calibrationOverview,
  clearCalibration,
  confidenceTrail,
  getCases,
  subscribeCalibration,
  type CalibrationSlice,
} from "@/lib/calibration";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calibration")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confidence Calibration — Market Intelligence OS" },
      {
        name: "description",
        content: "Whether stated confidence matches later recorded observations, sliced by confidence band, agent, market regime and research type.",
      },
      { property: "og:title", content: "Confidence Calibration — Market Intelligence OS" },
      { property: "og:description", content: "No percentage is displayed before 20 resolved cases exist — INSUFFICIENT OUTCOME DATA until then." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalibrationPage,
});

function SliceTable({ title, slices }: { title: string; slices: CalibrationSlice[] }) {
  return (
    <Panel title={title} right={<Tag kind="CALCULATED" />}>
      {slices.length === 0 ? (
        <p className="text-xs text-unknown">NO RECORDED CASES IN THIS BREAKDOWN YET</p>
      ) : (
        <Table head={["SLICE", "CASES", "RESOLVED", "CONSISTENT", "INCONSISTENT", "OBSERVED CONSISTENCY", "STATE"]}>
          {slices.map((s) => (
            <tr key={s.label}>
              <Td className="num max-w-[14rem] truncate">{s.label}</Td>
              <Td className="num">{s.cases}</Td>
              <Td className="num">{s.resolved}</Td>
              <Td className="num text-signal-low">{s.consistent}</Td>
              <Td className="num text-signal-extreme">{s.inconsistent}</Td>
              <Td className={cn("num", s.observedConsistencyPct === null && "text-unknown")}>
                {s.observedConsistencyPct === null ? "INSUFFICIENT OUTCOME DATA" : `${s.observedConsistencyPct}%`}
              </Td>
              <Td><StatePill label={s.state} tone={toneFor(s.state)} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function CalibrationPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeCalibration);
  const overview = useMemo(() => calibrationOverview(), [tick, brain.cycle]);
  const cases = useMemo(() => getCases(), [tick, brain.cycle]);
  const [key, setKey] = useState<string | null>(null);
  const activeKey = key ?? cases[0]?.targetKey ?? null;
  const trail = activeKey ? confidenceTrail(activeKey) : [];

  return (
    <TerminalShell>
      <SectionTitle sub="Calibration compares what the system said with what it later recorded. Nothing is scored as accurate or inaccurate until enough resolved cases exist, and agreeing with the majority is never treated as being right.">
        CONFIDENCE CALIBRATION
      </SectionTitle>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="RECORDED CASES" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{overview.overall.cases}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">one case per classification, deduplicated per 30 minutes</p>
        </Panel>
        <Panel title="RESOLVED CASES" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{overview.overall.resolved}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">requires a later stored classification for the same target</p>
        </Panel>
        <Panel title="MINIMUM FOR REPORTING" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{MIN_RESOLVED_CASES}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {overview.overall.resolved >= MIN_RESOLVED_CASES ? "threshold met" : `${MIN_RESOLVED_CASES - overview.overall.resolved} more resolved cases needed`}
          </p>
        </Panel>
        <Panel title="OVERALL" right={<Tag kind="CALCULATED" />}>
          <StatePill label={overview.overall.state} tone={toneFor(overview.overall.state)} />
          <p className="num mt-2 text-lg">
            {overview.overall.observedConsistencyPct === null ? "—" : `${overview.overall.observedConsistencyPct}%`}
          </p>
          <div className="mt-2"><Btn tone="danger" onClick={() => clearCalibration()}>CLEAR CASES</Btn></div>
        </Panel>
      </div>

      <div className="space-y-4">
        <SliceTable title="BY CONFIDENCE BAND" slices={overview.byBand} />
        <SliceTable title="BY AGENT" slices={overview.byAgent} />
        <SliceTable title="BY MARKET REGIME" slices={overview.byRegime} />
        <SliceTable title="BY RESEARCH TYPE" slices={overview.byResearchType} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="RECORDED CASES" right={<Tag kind="CALCULATED" />}>
            {cases.length === 0 ? (
              <p className="text-xs text-unknown">NO CASES RECORDED YET</p>
            ) : (
              <Table head={["TIME", "TARGET", "CLASSIFICATION", "CONF", "VERDICT"]}>
                {cases.slice(0, 60).map((c) => (
                  <tr key={c.id} onClick={() => setKey(c.targetKey)} className={cn("cursor-pointer", activeKey === c.targetKey && "bg-accent/40")}>
                    <Td className="num text-unknown">{clockOf(c.recordedAt)}</Td>
                    <Td className="num max-w-[9rem] truncate">{c.targetLabel}</Td>
                    <Td className="text-muted-foreground">{c.classification}</Td>
                    <Td className="num">{c.confidence}</Td>
                    <Td>
                      <StatePill label={c.outcome ? c.outcome.verdict : "UNRESOLVED"} tone={c.outcome ? toneFor(c.outcome.verdict === "CONSISTENT" ? "OK" : "FAIL") : "muted"} />
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

          <Panel title="CONFIDENCE OVER TIME FOR SELECTED TARGET" right={<Tag kind="CALCULATED" />}>
            {trail.length === 0 ? (
              <p className="text-xs text-unknown">INSUFFICIENT DATA — no stored confidence records for this target</p>
            ) : (
              <>
                <div className="mb-3 flex h-24 items-end gap-1">
                  {trail.map((p, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-cyan/60"
                      style={{ height: `${Math.max(3, (p.confidence ?? 0))}%` }}
                      title={`${p.confidence ?? "NOT AVAILABLE"} at ${clockOf(p.t)}`}
                    />
                  ))}
                </div>
                {trail.slice(-6).reverse().map((p, i) => (
                  <KV key={i} label={clockOf(p.t)} value={p.confidence === null ? "NOT AVAILABLE" : `${p.confidence}/100`} />
                ))}
              </>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={CALIBRATION_ENGINE_VERSION} />
      </div>
    </TerminalShell>
  );
}
