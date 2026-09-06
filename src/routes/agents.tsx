import { createFileRoute } from "@tanstack/react-router";
import { useIsFetching } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { AiCore } from "@/components/cosmos/AiCore";
import { ConfidenceBadge, DataState, Panel, SectionTitle, Tag } from "@/components/kit";
import { AgentNetwork } from "@/components/AgentNetwork";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — DEX Market Intelligence" },
      { name: "description", content: "Eight independent analysis agents with structured observations, warnings, supporting data, confidence and visible disagreement." },
      { property: "og:title", content: "Agents — DEX Market Intelligence" },
      { property: "og:description", content: "Live agent network, per-agent reasoning inputs and consensus/disagreement accounting." },
    ],
  }),
  component: Agents,
});

function Agents() {
  const { assessments } = useMarketIntelligence();
  const busy = useIsFetching({ queryKey: ["market"] }) > 0;
  const [selected, setSelected] = useState<string | null>(null);

  const ranked = useMemo(() => [...assessments].sort((a, b) => (b.pair.volume.h24 ?? 0) - (a.pair.volume.h24 ?? 0)).slice(0, 25), [assessments]);
  const target = ranked.find((a) => a.pair.key === selected) ?? ranked[0] ?? null;

  return (
    <TerminalShell>
      <SectionTitle sub="Each agent runs server-side as part of an assessment request. Status labels reflect actual execution state only.">
        AGENTS
      </SectionTitle>

      {!target ? (
        <DataState state="WAITING FOR DATA" detail="Agents execute once an observation batch is available." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Panel title="ANALYSIS TARGET">
              <select
                value={target.pair.key}
                onChange={(e) => setSelected(e.target.value)}
                className="num w-full rounded-sm border border-input bg-background/70 px-2 py-2 text-[11px]"
              >
                {ranked.map((a) => (
                  <option key={a.pair.key} value={a.pair.key}>
                    {a.pair.baseSymbol}/{a.pair.quoteSymbol} · {a.pair.chainId}
                  </option>
                ))}
              </select>
              <div className="mt-4">
                <AiCore size={190} />
              </div>
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                <p className="label-xs">CONSENSUS ACCOUNTING</p>
                <p className="num text-xs">
                  CONSENSUS <span className="text-cyan">{target.consensus.agree} / {target.consensus.total}</span> AGENTS
                </p>
                <p className="num text-xs">
                  DISAGREEMENT <span className="text-signal-mid">{target.consensus.disagree}</span> AGENTS
                </p>
                <p className="num text-xs">
                  UNRESOLVED <span className="text-unknown">{target.consensus.unresolved}</span> AGENT{target.consensus.unresolved === 1 ? "" : "S"}
                </p>
                <ConfidenceBadge score={target.confidence.score} band={target.confidence.band} />
              </div>
            </Panel>

            <Panel title="AGENT NETWORK" right={<Tag kind="AGENT" />}>
              <AgentNetwork agents={target.agents} busy={busy} />
            </Panel>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {target.agents.map((ag) => (
              <Panel key={ag.agentId} title={`AGENT ${ag.agentNumber} · ${ag.name}`} right={<StatusPill status={busy ? "PROCESSING" : ag.status} />}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "num rounded-sm border px-2 py-0.5 text-[10px] tracking-[0.12em]",
                      ag.vote === "ELEVATED"
                        ? "border-signal-high/50 text-signal-high"
                        : ag.vote === "CONTAINED"
                          ? "border-signal-low/50 text-signal-low"
                          : ag.vote === "NEUTRAL"
                            ? "border-border text-muted-foreground"
                            : "border-border text-unknown",
                    )}
                  >
                    {ag.vote}
                  </span>
                  <span className="num text-[10px] text-unknown">CONFIDENCE {ag.confidence}</span>
                  <span className="num text-[10px] text-unknown">{ag.version}</span>
                  <span className="num text-[10px] text-unknown">RAN {clockOf(ag.ranAt)}</span>
                </div>
                <ul className="space-y-1 text-[11px] text-foreground/90">
                  {ag.observations.map((o, i) => (
                    <li key={i}>· {o}</li>
                  ))}
                </ul>
                {ag.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] text-signal-mid">
                    {ag.warnings.map((w, i) => (
                      <li key={i}>! {w}</li>
                    ))}
                  </ul>
                )}
                {ag.supportingData.length > 0 && (
                  <div className="mt-3 border-t border-border/60 pt-2">
                    <p className="label-xs mb-1">SUPPORTING DATA</p>
                    <ul className="space-y-0.5">
                      {ag.supportingData.map((s, i) => (
                        <li key={i} className="num flex justify-between gap-3 text-[10px] text-muted-foreground">
                          <span>{s.label}</span>
                          <span className="text-right text-foreground/80">{s.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
            ))}
          </div>
        </div>
      )}
    </TerminalShell>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "num rounded-sm border px-2 py-0.5 text-[10px] tracking-[0.14em]",
        status === "PROCESSING"
          ? "border-cyan/60 text-cyan"
          : status === "ONLINE"
            ? "border-signal-low/50 text-signal-low"
            : status === "ERROR"
              ? "border-signal-extreme/60 text-signal-extreme"
              : "border-border text-unknown",
      )}
    >
      {status}
    </span>
  );
}
