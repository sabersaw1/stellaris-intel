import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Bar, DataState, EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { useMarketIntelligence } from "@/hooks/useMarket";
import {
  ATTENTION_ENGINE_VERSION,
  ATTENTION_ORDER,
  attentionQueue,
  warrantsResearch,
  type AttentionClass,
} from "@/lib/attention";
import { upsertJob } from "@/lib/jobs";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attention")({
  head: () => ({
    meta: [
      { title: "Attention Engine — Market Intelligence OS" },
      {
        name: "description",
        content:
          "Scored attention queue: which observed markets deserve computational attention, with the factor-by-factor basis for every score.",
      },
      { property: "og:title", content: "Attention Engine — Market Intelligence OS" },
      {
        property: "og:description",
        content: "Attention scoring over real observations: magnitude, novelty, acceleration, persistence, contradiction.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AttentionPage,
});

function AttentionPage() {
  const { assessments, query, envelope } = useMarketIntelligence();
  const [min, setMin] = useState<AttentionClass>("INTERESTING");

  const queue = useMemo(() => attentionQueue(assessments), [assessments]);
  const rank = (c: AttentionClass) => ATTENTION_ORDER.indexOf(c);
  const rows = queue.filter((i) => rank(i.klass) >= rank(min));

  return (
    <TerminalShell>
      <SectionTitle sub="Attention scores decide where computation is spent. Factors with missing inputs are excluded from the score rather than assumed.">
        ATTENTION ENGINE
      </SectionTitle>

      <Panel className="mb-4" title="CLASSIFICATION FILTER" right={<Tag kind="CALCULATED" />}>
        <div className="flex flex-wrap items-center gap-2">
          {ATTENTION_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => setMin(c)}
              className={cn(
                "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
                min === c
                  ? "border-cyan/60 bg-cyan/10 text-cyan"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              ≥ {c}
            </button>
          ))}
          <span className="label-xs ml-2">{ATTENTION_ENGINE_VERSION}</span>
        </div>
      </Panel>

      {query.isLoading ? (
        <DataState state="WAITING FOR DATA" detail="Ingesting the current observation batch." />
      ) : !rows.length ? (
        <EmptyState
          title="NOTHING AT THIS CLASSIFICATION"
          hint="Lower the threshold, or keep the terminal running so acceleration and persistence factors gain recorded observations."
        />
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 60).map((item) => (
            <Panel key={item.key}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    to="/pair/$chainId/$pairId"
                    params={{ chainId: item.assessment.pair.chainId, pairId: item.assessment.pair.pairAddress }}
                    className="num text-sm hover:text-cyan"
                  >
                    {item.assessment.pair.baseSymbol}/{item.assessment.pair.quoteSymbol}{" "}
                    <span className="text-unknown">
                      · {item.assessment.pair.chainId}/{item.assessment.pair.dexId}
                    </span>
                  </Link>
                  <p className="label-xs mt-1">
                    {item.historyPoints} recorded observation{item.historyPoints === 1 ? "" : "s"} · scored{" "}
                    {clockOf(item.scoredAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
                      item.klass === "CRITICAL"
                        ? "border-signal-extreme/60 text-signal-extreme"
                        : item.klass === "HIGH PRIORITY"
                          ? "border-signal-high/60 text-signal-high"
                          : item.klass === "UNUSUAL"
                            ? "border-signal-mid/60 text-signal-mid"
                            : "border-border text-muted-foreground",
                    )}
                  >
                    {item.klass}
                  </span>
                  <span className="num text-[11px] text-cyan">
                    {item.score === null ? "INSUFFICIENT DATA" : `${item.score}/100`}
                  </span>
                </div>
              </div>

              {item.reasons.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {item.reasons.map((r, i) => (
                    <li key={i}>— {r}</li>
                  ))}
                </ul>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {item.factors.map((f) => (
                  <div key={f.name} className="rounded-sm border border-border/70 p-2">
                    <div className="flex items-center justify-between">
                      <span className="label-xs">{f.name}</span>
                      <span className="num text-[10px] text-unknown">
                        {f.available ? `${f.points.toFixed(1)}/${f.maxPoints}` : "NOT SCORED"}
                      </span>
                    </div>
                    {f.available && <Bar value={f.points} max={f.maxPoints} />}
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{f.basis}</p>
                  </div>
                ))}
              </div>

              {warrantsResearch(item) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      upsertJob(
                        item,
                        "ATTENTION ENGINE",
                        item.reasons[0] ?? `Attention classification ${item.klass}`,
                      )
                    }
                    className="num rounded-sm border border-cyan/50 px-2 py-1 text-[10px] tracking-[0.14em] text-cyan hover:bg-cyan/10"
                  >
                    OPEN RESEARCH JOB
                  </button>
                  <Link to="/research" className="label-xs hover:text-cyan">
                    RESEARCH QUEUE →
                  </Link>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      <div className="mt-4">
        <SourceLine
          observedAt={envelope?.observedAt ?? null}
          engineVersion={`${ATTENTION_ENGINE_VERSION} · ${assessments.length} observations scored`}
          cached={envelope?.cached}
          stale={envelope?.stale}
        />
      </div>
    </TerminalShell>
  );
}
