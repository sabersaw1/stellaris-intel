import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Bar, ConfidenceBadge, DataState, Metric, Panel, RiskBadge, SectionTitle, Tag } from "@/components/kit";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { RISK_WEIGHTS } from "@/lib/analysis";
import { RISK_ENGINE_VERSION } from "@/lib/dex-types";
import { count } from "@/lib/format";

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk — DEX Market Intelligence" },
      { name: "description", content: "Transparent observed-risk assessment across eight dimensions with configurable weights and versioned engine output." },
      { property: "og:title", content: "Risk — DEX Market Intelligence" },
      { property: "og:description", content: "Observed market risk distribution, dimension weights and per-pair breakdowns." },
    ],
  }),
  component: RiskPage,
});

function RiskPage() {
  const { assessments, query } = useMarketIntelligence();

  const bands = useMemo(() => {
    const b = new Map<string, number>();
    for (const a of assessments) b.set(a.risk.band, (b.get(a.risk.band) ?? 0) + 1);
    return [...b.entries()].sort((x, y) => y[1] - x[1]);
  }, [assessments]);

  const ranked = useMemo(
    () => [...assessments].filter((a) => a.risk.score !== null).sort((a, b) => (b.risk.score ?? 0) - (a.risk.score ?? 0)).slice(0, 12),
    [assessments],
  );

  return (
    <TerminalShell>
      <SectionTitle sub="Observed risk describes current market conditions and data quality. It is never a return expectation or a recommendation.">
        RISK
      </SectionTitle>

      {query.isLoading && !assessments.length ? (
        <DataState state="WAITING FOR DATA" detail="Requesting observations before any risk assessment can run." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="OBSERVED RISK DISTRIBUTION" right={<Tag kind="AGENT" />}>
              {bands.length ? (
                <ul className="space-y-3">
                  {bands.map(([band, n]) => (
                    <li key={band}>
                      <div className="mb-1 flex items-center justify-between">
                        <RiskBadge band={band as never} />
                        <span className="num text-xs">{count(n)}</span>
                      </div>
                      <Bar value={n} max={assessments.length} tone={band.includes("EXTREME") || band.includes("HIGH") ? "warn" : "cyan"} />
                    </li>
                  ))}
                </ul>
              ) : (
                <DataState state="INSUFFICIENT DATA" />
              )}
            </Panel>

            <Panel title="ENGINE CONFIGURATION" right={<Tag kind="CALCULATED" />}>
              <p className="label-xs mb-3">
                {RISK_ENGINE_VERSION} · weights are backend configuration and are stored with every assessment
              </p>
              <ul className="space-y-2">
                {Object.entries(RISK_WEIGHTS).map(([dim, w]) => (
                  <li key={dim} className="flex items-center gap-3">
                    <span className="num w-40 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{dim}</span>
                    <div className="flex-1">
                      <Bar value={w} max={25} tone="violet" />
                    </div>
                    <span className="num w-8 text-right text-[11px]">{w}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Metric label="ASSESSED PAIRS" value={count(assessments.length)} kind="AGENT" />
                <Metric label="INSUFFICIENT DATA" value={count(assessments.filter((a) => a.risk.score === null).length)} kind="AGENT" />
              </div>
            </Panel>
          </div>

          <Panel title="HIGHEST OBSERVED RISK — DIMENSION BREAKDOWN" right={<Tag kind="AGENT" />}>
            {ranked.length ? (
              <ul className="space-y-4">
                {ranked.map((a) => (
                  <li key={a.pair.key} className="border-b border-border/40 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to="/pair/$chainId/$pairId"
                        params={{ chainId: a.pair.chainId, pairId: a.pair.pairAddress }}
                        className="num text-sm hover:text-cyan"
                      >
                        {a.pair.baseSymbol}/{a.pair.quoteSymbol} <span className="text-unknown">· {a.pair.chainId}</span>
                      </Link>
                      <div className="flex items-center gap-2">
                        <RiskBadge band={a.risk.band} score={a.risk.score} />
                        <ConfidenceBadge score={a.confidence.score} band={a.confidence.band} />
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {a.risk.factors.map((f) => (
                        <div key={f.dimension}>
                          <div className="flex items-center justify-between">
                            <span className="label-xs">{f.dimension}</span>
                            <span className="num text-[10px]">{f.points.toFixed(1)}/{f.maxPoints}</span>
                          </div>
                          <Bar value={f.points} max={f.maxPoints} tone={f.dataAvailable ? "cyan" : "warn"} />
                          <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                            {f.dataAvailable ? f.basis : `INSUFFICIENT DATA — ${f.basis}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <DataState state="INSUFFICIENT DATA" detail="No pair currently has enough available dimensions to produce a score." />
            )}
          </Panel>
        </div>
      )}
    </TerminalShell>
  );
}
