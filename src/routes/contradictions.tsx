import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, KV, StatePill, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import {
  CONTRADICTION_ENGINE_VERSION,
  clearContradictions,
  getContradictions,
  resolveContradiction,
  subscribeContradictions,
} from "@/lib/contradictions";
import { clockOf } from "@/lib/format";

export const Route = createFileRoute("/contradictions")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Contradiction Engine — Market Intelligence OS" },
      {
        name: "description",
        content: "Persistent record of disagreements between agents: both claims, the evidence each side has, what evidence is missing, and the preserved minority position.",
      },
      { property: "og:title", content: "Contradiction Engine — Market Intelligence OS" },
      { property: "og:description", content: "Contradictions are never hidden or averaged away; unresolved ones stay unresolved." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContradictionsPage,
});

function ContradictionsPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeContradictions);
  const all = useMemo(() => getContradictions(), [tick, brain.cycle]);
  const [onlyPersistent, setOnlyPersistent] = useState(false);
  const rows = onlyPersistent ? all.filter((c) => c.status === "PERSISTENT") : all;

  return (
    <TerminalShell>
      <SectionTitle sub="When agents reach different conclusions from the same observation, the disagreement is stored, not smoothed over. A contradiction is only resolved when evidence actually resolves it.">
        CONTRADICTION ENGINE
      </SectionTitle>

      <Panel className="mb-4" title="FILTER" right={<Tag kind="AGENT" />}>
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone={onlyPersistent ? "primary" : "default"} onClick={() => setOnlyPersistent((v) => !v)}>
            {onlyPersistent ? "SHOWING PERSISTENT ONLY" : "SHOW PERSISTENT ONLY"}
          </Btn>
          <StatePill label={`${all.length} RECORDED`} tone="info" />
          <StatePill label={`${all.filter((c) => c.status === "PERSISTENT").length} PERSISTENT`} tone="warn" />
          <StatePill label={`${all.filter((c) => c.status === "UNRESOLVED — INSUFFICIENT DATA").length} BLOCKED BY MISSING DATA`} tone="muted" />
          <Btn tone="danger" onClick={() => clearContradictions()}>CLEAR</Btn>
        </div>
      </Panel>

      {!rows.length ? (
        <EmptyState title="NO CONTRADICTIONS RECORDED" hint="Agents currently agree on the observations available, or there is not enough data for a disagreement to form." />
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 40).map((c) => (
            <Panel key={c.id} title={`${c.targetLabel} · ${c.topic}`} right={<StatePill label={c.status} tone={toneFor(c.status)} />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-sm border border-border/60 p-2.5">
                  <p className="label-xs mb-1">POSITION A</p>
                  <p className="text-xs text-foreground">{c.claimA}</p>
                  <p className="num mt-1 text-[10px] tracking-[0.12em] text-unknown">{c.agentsA.join(", ") || "AGENT NOT RECORDED"}</p>
                </div>
                <div className="rounded-sm border border-border/60 p-2.5">
                  <p className="label-xs mb-1">POSITION B</p>
                  <p className="text-xs text-foreground">{c.claimB}</p>
                  <p className="num mt-1 text-[10px] tracking-[0.12em] text-unknown">{c.agentsB.join(", ") || "AGENT NOT RECORDED"}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="label-xs mb-1">SUPPORTING EVIDENCE</p>
                  {c.supportingEvidence.length === 0 ? <p className="text-xs text-unknown">NONE RECORDED</p> : (
                    <ul className="space-y-1">{c.supportingEvidence.map((e, i) => <li key={i} className="text-[11px] text-muted-foreground">— {e}</li>)}</ul>
                  )}
                </div>
                <div>
                  <p className="label-xs mb-1">OPPOSING EVIDENCE</p>
                  {c.opposingEvidence.length === 0 ? <p className="text-xs text-unknown">NONE RECORDED</p> : (
                    <ul className="space-y-1">{c.opposingEvidence.map((e, i) => <li key={i} className="text-[11px] text-muted-foreground">— {e}</li>)}</ul>
                  )}
                </div>
                <div>
                  <p className="label-xs mb-1">EVIDENCE THAT WOULD RESOLVE THIS</p>
                  {c.missingEvidence.length === 0 ? <p className="text-xs text-unknown">NOT SPECIFIED</p> : (
                    <ul className="space-y-1">{c.missingEvidence.map((e, i) => <li key={i} className="text-[11px] text-cyan">? {e}</li>)}</ul>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
                <KV label="OCCURRENCES" value={String(c.occurrences)} />
                <KV label="CONFIDENCE SPREAD" value={c.confidence === null ? "NOT AVAILABLE" : `${c.confidence}/100`} />
                <KV label="FIRST SEEN" value={new Date(c.createdAt).toLocaleString()} />
                <KV label="LAST SEEN" value={clockOf(c.updatedAt)} />
              </div>

              {c.minorityPreserved && <p className="mt-2 text-[11px] text-violet">MINORITY POSITION PRESERVED — {c.minorityPreserved}</p>}

              {c.status !== "RESOLVED BY EVIDENCE" && (
                <div className="mt-3">
                  <Btn onClick={() => resolveContradiction(c.id, "Marked resolved by the analyst after reviewing the stored evidence")}>
                    MARK RESOLVED BY EVIDENCE
                  </Btn>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={CONTRADICTION_ENGINE_VERSION} />
      </div>
    </TerminalShell>
  );
}
