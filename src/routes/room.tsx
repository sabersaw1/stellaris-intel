import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { ConfidenceBadge, DataState, EmptyState, Panel, RiskBadge, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { useHistory, useMarketIntelligence } from "@/hooks/useMarket";
import { attentionQueue } from "@/lib/attention";
import { contradictionsOf, hypothesesOf, minorityOf, statementsOf, whatChanged, whyRisk } from "@/lib/reasoning";
import { AGENT_SUITE_VERSION } from "@/lib/dex-types";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

type Search = { key?: string };

export const Route = createFileRoute("/room")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    key: typeof search["key"] === "string" ? search["key"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Agent Room — Market Intelligence OS" },
      {
        name: "description",
        content:
          "Agent statements, contradictions, minority opinion, hypotheses and falsification criteria for a single observed market.",
      },
      { property: "og:title", content: "Agent Room — Market Intelligence OS" },
      {
        property: "og:description",
        content: "Every statement is an agent's own reading of the observed values — with the supporting data attached.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoomPage,
});

function RoomPage() {
  const { key } = Route.useSearch();
  const navigate = useNavigate();
  const { assessments, envelope, query } = useMarketIntelligence();

  const queue = useMemo(() => attentionQueue(assessments), [assessments]);
  const active = useMemo(
    () => assessments.find((a) => a.pair.key === key) ?? assessments.find((a) => a.pair.key === queue[0]?.key) ?? null,
    [assessments, key, queue],
  );
  const history = useHistory(active?.pair.key ?? "");

  if (query.isLoading) {
    return (
      <TerminalShell>
        <SectionTitle>AGENT ROOM</SectionTitle>
        <DataState state="WAITING FOR DATA" detail="Ingesting the current observation batch." />
      </TerminalShell>
    );
  }

  if (!active) {
    return (
      <TerminalShell>
        <SectionTitle>AGENT ROOM</SectionTitle>
        <EmptyState title="NO TARGET SELECTED" hint="Pick a market from the attention engine or the research queue." />
      </TerminalShell>
    );
  }

  const statements = statementsOf(active);
  const contradictions = contradictionsOf(active);
  const minority = minorityOf(active);
  const hypotheses = hypothesesOf(active);
  const changed = whatChanged(history);
  const why = whyRisk(active);

  return (
    <TerminalShell>
      <SectionTitle sub="Statements are the agents' own readings of observed values. No agent speech is generated; nothing is claimed without the supporting figure shown beside it.">
        AGENT ROOM
      </SectionTitle>

      <Panel className="mb-4" title="TARGET" right={<Tag kind="LIVE" />}>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/pair/$chainId/$pairId"
            params={{ chainId: active.pair.chainId, pairId: active.pair.pairAddress }}
            className="num text-sm hover:text-cyan"
          >
            {active.pair.baseSymbol}/{active.pair.quoteSymbol}{" "}
            <span className="text-unknown">· {active.pair.chainId}/{active.pair.dexId}</span>
          </Link>
          <RiskBadge band={active.risk.band} score={active.risk.score} />
          <ConfidenceBadge score={active.confidence.score} band={active.confidence.band} />
          <span className="label-xs">
            CONSENSUS {active.consensus.agree} / {active.consensus.total} · DISSENT {active.consensus.disagree}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {queue.slice(0, 8).map((i) => (
            <button
              key={i.key}
              onClick={() => void navigate({ to: "/room", search: { key: i.key } })}
              className={cn(
                "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
                i.key === active.pair.key
                  ? "border-cyan/60 bg-cyan/10 text-cyan"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {i.assessment.pair.baseSymbol} · {i.score ?? "—"}
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="AGENT STATEMENTS" right={<Tag kind="AGENT" />}>
          <div className="space-y-3">
            {statements.map((s) => (
              <div key={s.agentId} className="rounded-sm border border-border/70 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="num text-[11px]">
                    {s.agentNumber} {s.name}
                  </span>
                  <span
                    className={cn(
                      "num text-[10px] tracking-[0.14em]",
                      s.vote === "ELEVATED"
                        ? "text-signal-high"
                        : s.vote === "CONTAINED"
                          ? "text-signal-low"
                          : s.vote === "NEUTRAL"
                            ? "text-muted-foreground"
                            : "text-signal-mid",
                    )}
                  >
                    {s.vote} · CONFIDENCE {s.confidence}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {s.claims.map((c, i) => (
                    <li key={i}>— {c}</li>
                  ))}
                  {s.warnings.map((w, i) => (
                    <li key={`w${i}`} className="text-signal-mid">
                      ! {w}
                    </li>
                  ))}
                </ul>
                {s.support.length > 0 && (
                  <p className="num mt-1 text-[10px] text-unknown">
                    {s.support.map((d) => `${d.label} ${d.value}`).join("  ·  ")}
                  </p>
                )}
                <p className="label-xs mt-1">RAN {clockOf(s.ranAt)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="CONTRADICTIONS" right={<Tag kind="AGENT" />}>
            {contradictions.length ? (
              <div className="space-y-3">
                {contradictions.map((c, i) => (
                  <div key={i} className="rounded-sm border border-border/70 p-2">
                    <p className="num text-[11px] text-violet">{c.topic}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {[c.sideA, c.sideB].map((side, k) => (
                        <div key={k}>
                          <p className="label-xs">{side.vote}</p>
                          <p className="num mt-0.5 text-[10px] text-unknown">{side.agents.join(", ")}</p>
                          <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                            {side.basis.map((b, j) => (
                              <li key={j}>— {b}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-foreground/80">{c.resolution}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No contradiction: the agent suite is not split on this target's observed evidence.
              </p>
            )}
          </Panel>

          <Panel title="MINORITY OPINION" right={<Tag kind="AGENT" />}>
            {minority ? (
              <>
                <p className="num text-[11px] text-signal-mid">
                  {minority.vote} · {minority.share}
                </p>
                <p className="num mt-1 text-[10px] text-unknown">{minority.agents.join(", ")}</p>
                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  {minority.basis.map((b, i) => (
                    <li key={i}>— {b}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-foreground/70">{minority.note}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">The agent suite returned a single unanimous reading.</p>
            )}
          </Panel>
        </div>

        <Panel title="HYPOTHESES & WHAT WOULD CHANGE OUR MIND" right={<Tag kind="CALCULATED" />}>
          <div className="space-y-3">
            {hypotheses.map((h, i) => (
              <div key={i} className="rounded-sm border border-border/70 p-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-xs text-foreground">{h.statement}</p>
                  <span className="num text-[10px] tracking-[0.14em] text-unknown">{h.standing}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {h.supportedBy.map((s, j) => (
                    <li key={j}>— {s}</li>
                  ))}
                </ul>
                <p className="label-xs mt-2">WOULD CHANGE OUR MIND</p>
                <ul className="mt-0.5 space-y-0.5 text-[11px] text-cyan/80">
                  {h.wouldChangeOurMind.map((s, j) => (
                    <li key={j}>— {s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="WHAT CHANGED?" right={<Tag kind="CALCULATED" />}>
            {changed.changes.length ? (
              <>
                <p className="label-xs">{changed.window}</p>
                <div className="mt-2 space-y-1">
                  {changed.changes.map((c) => (
                    <div key={c.metric} className="flex items-center justify-between text-[11px]">
                      <span className="label-xs">{c.metric}</span>
                      <span className="num text-muted-foreground">
                        {c.from} → {c.to}{" "}
                        <span className={c.direction === "UP" ? "text-signal-low" : "text-signal-high"}>{c.delta}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <DataState
                state="INSUFFICIENT DATA"
                detail="Change detection compares consecutive recorded observations. Keep the terminal running to record more than one."
              />
            )}
          </Panel>

          <Panel title="WHY THIS CLASSIFICATION?" right={<Tag kind="CALCULATED" />}>
            <div className="space-y-2">
              {why.map((w, i) => (
                <div key={i}>
                  <p className="num text-[11px] text-foreground/85">{w.line}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{w.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <SourceLine
          observedAt={envelope?.observedAt ?? null}
          calculatedAt={active.risk.calculatedAt}
          engineVersion={`${active.risk.engineVersion} · ${AGENT_SUITE_VERSION}`}
          cached={envelope?.cached}
          stale={envelope?.stale}
        />
      </div>
    </TerminalShell>
  );
}
