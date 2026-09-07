import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, EmptyState, Panel, SectionTitle, Tag } from "@/components/kit";
import { InvestigationPanel, StateBadge } from "@/components/stellaris/InvestigationPanel";
import { useStellaris } from "@/hooks/useStellaris";
import { StoredInvestigationsPanel } from "@/components/stellaris/MemoryPanels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/investigations")({
  // Research state, job records and watchlist are stored in this browser.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Investigations — Stellaris Intel" },
      { name: "description", content: "The research lab: structured investigation workspaces with evidence layers, unknowns, conflicts and challenger review." },
      { property: "og:title", content: "Investigations — Stellaris Intel" },
      { property: "og:description", content: "Structured research workspaces: current assessment, evidence layers, known and unknown, conflicting evidence and next question." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Investigations,
});

const ADVANCED = [
  { to: "/research", label: "RESEARCH QUEUE — pass state, depth and continuity" },
  { to: "/room", label: "AGENT ROOM — each reading with its supporting values" },
  { to: "/contradictions", label: "CONTRADICTION REGISTER" },
  { to: "/questions", label: "OPEN QUESTIONS" },
  { to: "/hypotheses", label: "HYPOTHESES AND FALSIFICATION CRITERIA" },
  { to: "/attention", label: "ATTENTION SCORING DETAIL" },
  { to: "/anomalies", label: "ANOMALY REGISTER" },
  { to: "/risk", label: "RISK DIMENSION BREAKDOWN" },
  { to: "/agents", label: "AGENT SUITE STATUS" },
  { to: "/markets", label: "FULL MARKET TABLE" },
  { to: "/discover", label: "DISCOVERY SEARCH" },
  { to: "/trends", label: "TRENDING METAS AND PROFILES" },
] as const;

function Investigations() {
  const s = useStellaris();
  const [selected, setSelected] = useState<string | null>(null);

  const queue = useMemo(
    () => s.investigations.filter((i) => i.job || i.watched || i.conflicting.length || i.state === "HIGH-RISK SIGNALS" || i.state === "ELEVATED RISK SIGNALS"),
    [s.investigations],
  );
  const list = queue.length ? queue : s.investigations.slice(0, 12);
  const current = s.investigations.find((i) => i.key === selected) ?? list[0] ?? null;

  return (
    <TerminalShell>
      <SectionTitle sub="Each investigation keeps its own evidence, unknowns, conflicts, challenger review and next question. Nothing is concluded beyond what the connected sources support.">
        INVESTIGATIONS
      </SectionTitle>

      <div className="mb-4">
        <StoredInvestigationsPanel />
      </div>

      {s.query.isLoading ? (
        <DataState state="WAITING FOR DATA" detail="Requesting the current market snapshot before opening any investigation." />
      ) : !s.investigations.length ? (
        <EmptyState title="NO INVESTIGATIONS YET" hint="Investigations open automatically as markets are observed, and immediately when you press INVESTIGATE anywhere in the application." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Panel title="RESEARCH QUEUE" right={<Tag kind="AGENT" label={String(list.length)} />}>
              <ul className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
                {list.map((i) => (
                  <li key={i.key}>
                    <button
                      onClick={() => setSelected(i.key)}
                      className={cn(
                        "w-full rounded-sm border px-2 py-2 text-left transition-colors",
                        current?.key === i.key ? "border-cyan/50 bg-accent/60" : "border-border/60 hover:border-cyan/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="num truncate text-[11px] text-foreground">{i.label}</span>
                        <span className="num text-[9px] text-unknown">{i.priority === null ? "—" : i.priority}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <StateBadge state={i.state} />
                        <span className="num text-[9px] text-unknown">{i.chainId}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="ADVANCED RESEARCH TOOLS">
              <ul className="space-y-1">
                {ADVANCED.map((a) => (
                  <li key={a.to}>
                    <Link to={a.to} className="num block text-[10px] leading-snug tracking-[0.1em] text-muted-foreground hover:text-cyan">
                      {a.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div>{current && <InvestigationPanel inv={current} />}</div>
        </div>
      )}
    </TerminalShell>
  );
}
