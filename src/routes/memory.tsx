import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, Tag } from "@/components/kit";
import { Btn, FreshnessBadge, KV, ProvenanceChain, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { clearMemory, getMemory, memoryByKind, recallTarget, similarCases, subscribeMemory, MEMORY_ENGINE_VERSION, type MemoryKind } from "@/lib/memory";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/memory")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Intelligence Memory — Market Intelligence OS" },
      {
        name: "description",
        content:
          "Persistent intelligence memory: observations, findings, evidence, hypotheses, contradictions, classifications and outcomes with full provenance.",
      },
      { property: "og:title", content: "Intelligence Memory — Market Intelligence OS" },
      { property: "og:description", content: "Every stored record carries timestamp, source, target, type, provenance and confidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MemoryPage,
});

const KINDS: (MemoryKind | "ALL")[] = [
  "ALL",
  "OBSERVATION",
  "CLASSIFICATION",
  "CONFIDENCE",
  "AGENT_FINDING",
  "EVIDENCE",
  "HYPOTHESIS",
  "CONTRADICTION",
  "IMPORTANT_EVENT",
  "RESEARCH_OUTCOME",
];

function MemoryPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeMemory);
  const [kind, setKind] = useState<MemoryKind | "ALL">("ALL");
  const [selected, setSelected] = useState<string | null>(null);

  const records = useMemo(() => getMemory(), [tick, brain.cycle]);
  const counts = useMemo(() => memoryByKind(), [tick, brain.cycle]);
  const rows = kind === "ALL" ? records : records.filter((r) => r.kind === kind);
  const active = records.find((r) => r.id === selected) ?? rows[0] ?? null;
  const recall = active?.targetKey ? recallTarget(active.targetKey) : null;
  const similar = active?.targetKey
    ? similarCases(brain.assessments.find((a) => a.pair.key === active.targetKey) ?? brain.assessments[0]!)
    : [];

  return (
    <TerminalShell>
      <SectionTitle sub="Everything the system has actually produced is stored here with its provenance. Records live in this browser until a database is connected — WAITING FOR SUPABASE for durable, cross-device memory.">
        INTELLIGENCE MEMORY
      </SectionTitle>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="RECORDS STORED" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{records.length}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">written by real assessment passes only</p>
        </Panel>
        <Panel title="LAST BRAIN CYCLE" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{brain.cycle ? brain.cycle.memoryRecords : "—"}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{brain.cycle ? `${brain.cycle.durationMs}ms · ${clockOf(brain.cycle.ranAt)}` : "waiting for the first observation cycle"}</p>
        </Panel>
        <Panel title="DURABILITY" right={<Tag kind="VISUAL" />}>
          <StatePill label="WAITING FOR SUPABASE" tone="muted" />
          <p className="mt-2 text-[11px] text-muted-foreground">browser-local store; nothing is lost silently, but it is not shared across devices</p>
        </Panel>
        <Panel title="ENGINE" right={<Tag kind="CALCULATED" />}>
          <p className="num text-xs">{MEMORY_ENGINE_VERSION}</p>
          <div className="mt-2"><Btn tone="danger" onClick={() => clearMemory()}>CLEAR MEMORY STORE</Btn></div>
        </Panel>
      </div>

      <Panel className="mb-4" title="RECORD TYPE" right={<Tag kind="CALCULATED" />}>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
                kind === k ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {k} {k !== "ALL" && <span className="text-unknown">{counts[k] ?? 0}</span>}
            </button>
          ))}
        </div>
      </Panel>

      {!records.length ? (
        <EmptyState title="MEMORY EMPTY" hint="Memory fills as observation cycles complete. Each pass writes only the records it actually produced." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel title={`RECORDS · ${rows.length}`} right={<Tag kind="CALCULATED" />}>
            <Table head={["TIME", "TYPE", "TARGET", "SUMMARY", "CONF"]}>
              {rows.slice(0, 120).map((r) => (
                <tr key={r.id} onClick={() => setSelected(r.id)} className={cn("cursor-pointer", active?.id === r.id && "bg-accent/40")}>
                  <Td className="num whitespace-nowrap text-unknown">{clockOf(r.t)}</Td>
                  <Td><StatePill label={r.kind} tone={toneFor(r.kind)} /></Td>
                  <Td className="num max-w-[10rem] truncate">{r.targetLabel ?? "—"}</Td>
                  <Td className="max-w-[22rem] truncate text-muted-foreground">{r.summary}</Td>
                  <Td className="num">{r.confidence ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          </Panel>

          <div className="space-y-4">
            {active && (
              <Panel title="RECORD DETAIL" right={<FreshnessBadge observedAt={active.t} />}>
                <KV label="TYPE" value={active.kind} />
                <KV label="SOURCE" value={active.source} />
                <KV label="TARGET" value={active.targetLabel ?? "NOT AVAILABLE"} />
                <KV label="RECORDED" value={new Date(active.t).toLocaleString()} />
                <KV label="CONFIDENCE" value={active.confidence === null ? "NOT AVAILABLE" : `${active.confidence}/100`} />
                <KV label="JOB" value={active.jobId ?? "NOT AVAILABLE"} />
                <p className="mt-3 text-xs text-foreground">{active.summary}</p>
                <div className="mt-3">
                  <p className="label-xs mb-1.5">PROVENANCE CHAIN</p>
                  <ProvenanceChain chain={active.provenance} />
                </div>
                {active.detail.length > 0 && (
                  <div className="mt-3">
                    <p className="label-xs mb-1">SUPPORTING VALUES</p>
                    {active.detail.map((d) => (
                      <KV key={d.label} label={d.label} value={d.value} />
                    ))}
                  </div>
                )}
              </Panel>
            )}

            {recall && (
              <Panel title="HAVE WE SEEN THIS BEFORE?" right={<Tag kind="AGENT" />}>
                <KV label="SEEN BEFORE" value={recall.seenBefore ? "YES" : "NO"} />
                <KV label="RECORDS" value={String(recall.recordCount)} />
                <KV label="FIRST SEEN" value={recall.firstSeen ? new Date(recall.firstSeen).toLocaleString() : "NOT AVAILABLE"} />
                <KV label="PREVIOUS CLASSIFICATION" value={recall.previousClassification ?? "NOT AVAILABLE"} />
                <KV label="PREVIOUS CONFIDENCE" value={recall.previousConfidence === null ? "NOT AVAILABLE" : `${recall.previousConfidence}/100`} />
                {recall.changedSince.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {recall.changedSince.map((c) => (
                      <li key={c} className="text-[11px] text-signal-mid">{c}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">{recall.note}</p>
              </Panel>
            )}

            <Panel title="SIMILAR RECORDED CASES" right={<Tag kind="CALCULATED" />}>
              {similar.length === 0 ? (
                <p className="text-xs text-unknown">NO COMPARABLE RECORDED CASE — similarity is matched on stored classification and chain only</p>
              ) : (
                <ul className="space-y-2">
                  {similar.map(({ record, basis }) => (
                    <li key={record.id} className="border-b border-border/40 pb-2 last:border-0">
                      <p className="num text-xs text-foreground">{record.targetLabel}</p>
                      <p className="text-[11px] text-muted-foreground">{record.summary}</p>
                      <p className="num text-[10px] tracking-[0.12em] text-unknown">MATCHED ON {basis.toUpperCase()} · {clockOf(record.t)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </TerminalShell>
  );
}
