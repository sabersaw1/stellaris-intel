import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { HYPOTHESIS_ENGINE_VERSION, clearHypotheses, getHypotheses, monitoringConditions, subscribeHypotheses, type HypothesisStatus } from "@/lib/hypotheses";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/hypotheses")({
  head: () => ({
    meta: [
      { title: "Hypotheses & Monitoring — Market Intelligence OS" },
      {
        name: "description",
        content: "Every hypothesis with its supporting and opposing evidence, assumptions, what would change our mind, and the conditions being monitored.",
      },
      { property: "og:title", content: "Hypotheses & Monitoring — Market Intelligence OS" },
      { property: "og:description", content: "Hypothesis status is derived from stored evidence, never asserted." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HypothesesPage,
});

const STATUSES: (HypothesisStatus | "ALL")[] = ["ALL", "ACTIVE", "SUPPORTED", "CONTESTED", "WEAKENED", "INVALIDATED", "UNRESOLVED"];

function HypothesesPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeHypotheses);
  const all = useMemo(() => getHypotheses(), [tick, brain.cycle]);
  const monitoring = useMemo(() => monitoringConditions(), [tick, brain.cycle]);
  const [status, setStatus] = useState<HypothesisStatus | "ALL">("ALL");
  const rows = status === "ALL" ? all : all.filter((h) => h.status === status);

  return (
    <TerminalShell>
      <SectionTitle sub="Hypotheses are generated from observed factors and re-evaluated on every pass. Each one states its assumptions and exactly what evidence would change the conclusion.">
        HYPOTHESES & MONITORING
      </SectionTitle>

      <Panel className="mb-4" title="STATUS" right={<Tag kind="AGENT" />}>
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
              {s} <span className="text-unknown">{s === "ALL" ? all.length : all.filter((h) => h.status === s).length}</span>
            </button>
          ))}
          <Btn tone="danger" onClick={() => clearHypotheses()}>CLEAR</Btn>
        </div>
      </Panel>

      <Panel className="mb-4" title={`MONITORING CONDITIONS · ${monitoring.length}`} right={<Tag kind="CALCULATED" />}>
        {monitoring.length === 0 ? (
          <p className="text-xs text-unknown">NO CONDITIONS UNDER MONITORING — conditions are created with hypotheses</p>
        ) : (
          <Table head={["TARGET", "CONDITION", "STATUS", "LAST CHECK", "NOTE"]}>
            {monitoring.slice(0, 40).map((m, i) => (
              <tr key={`${m.hypothesisId}-${i}`}>
                <Td className="num max-w-[9rem] truncate">{m.targetLabel}</Td>
                <Td className="max-w-[22rem] text-muted-foreground">{m.condition}</Td>
                <Td><StatePill label={m.status} tone={m.status === "TRIGGERED" ? "warn" : m.status === "MONITORING" ? "info" : "muted"} /></Td>
                <Td className="num text-unknown">{clockOf(m.lastCheckedAt)}</Td>
                <Td className="max-w-[16rem] text-[11px] text-muted-foreground">{m.note}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {!rows.length ? (
        <EmptyState title="NO HYPOTHESES STORED" hint="Hypotheses are derived from observed risk factors on real assessment passes." />
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 40).map((h) => (
            <Panel key={h.id} title={h.targetLabel} right={<StatePill label={h.status} tone={toneFor(h.status)} />}>
              <p className="text-sm text-foreground">{h.statement}</p>
              <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                <KV label="CONFIDENCE" value={h.confidence === null ? "NOT AVAILABLE" : `${h.confidence}/100`} />
                <KV label="PASSES" value={String(h.passes)} />
                <KV label="CREATED" value={new Date(h.createdAt).toLocaleString()} />
                <KV label="UPDATED" value={clockOf(h.updatedAt)} />
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="label-xs mb-1">SUPPORTING EVIDENCE</p>
                  {h.supportingEvidence.length === 0 ? (
                    <p className="text-xs text-unknown">NONE RECORDED</p>
                  ) : (
                    <ul className="space-y-1">{h.supportingEvidence.map((e, i) => <li key={i} className="text-[11px] text-signal-low">+ {e}</li>)}</ul>
                  )}
                </div>
                <div>
                  <p className="label-xs mb-1">OPPOSING EVIDENCE</p>
                  {h.opposingEvidence.length === 0 ? (
                    <p className="text-xs text-unknown">NONE RECORDED</p>
                  ) : (
                    <ul className="space-y-1">{h.opposingEvidence.map((e, i) => <li key={i} className="text-[11px] text-signal-extreme">− {e}</li>)}</ul>
                  )}
                </div>
                <div>
                  <p className="label-xs mb-1">ASSUMPTIONS</p>
                  <ul className="space-y-1">{h.assumptions.map((e, i) => <li key={i} className="text-[11px] text-muted-foreground">— {e}</li>)}</ul>
                </div>
                <div>
                  <p className="label-xs mb-1">WHAT WOULD CHANGE OUR MIND</p>
                  <ul className="space-y-1">{h.wouldChangeOurMind.map((e, i) => <li key={i} className="text-[11px] text-cyan">? {e}</li>)}</ul>
                </div>
              </div>
              {h.historicalEvidence.length > 0 && (
                <div className="mt-3">
                  <p className="label-xs mb-1">HISTORICAL EVIDENCE</p>
                  <ul className="space-y-1">{h.historicalEvidence.map((e, i) => <li key={i} className="text-[11px] text-muted-foreground">— {e}</li>)}</ul>
                </div>
              )}
              {h.statusHistory.length > 0 && (
                <div className="mt-3">
                  <p className="label-xs mb-1">STATUS HISTORY</p>
                  {h.statusHistory.slice(-5).reverse().map((s, i) => (
                    <KV key={i} label={`${clockOf(s.t)} · ${s.status}`} value={s.because} />
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {h.agentsSupporting.map((a) => <StatePill key={`s${a}`} label={`SUPPORTS ${a}`} tone="ok" />)}
                {h.agentsOpposing.map((a) => <StatePill key={`o${a}`} label={`OPPOSES ${a}`} tone="bad" />)}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={HYPOTHESIS_ENGINE_VERSION} />
      </div>
    </TerminalShell>
  );
}
