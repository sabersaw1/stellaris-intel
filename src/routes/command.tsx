import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { AiCore } from "@/components/cosmos/AiCore";
import { DataState, EmptyState, Metric, Panel, RiskBadge, SectionTitle, SeverityBadge, SourceLine, Tag } from "@/components/kit";
import { PairTable } from "@/components/PairTable";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { ageFrom, clockOf, count, secondsSince, usd } from "@/lib/format";
import { getAlerts, subscribeStore, type AlertEvent } from "@/lib/local-store";

export const Route = createFileRoute("/command")({
  head: () => ({
    meta: [
      { title: "Command Center — DEX Market Intelligence" },
      { name: "description", content: "What is happening right now across observed decentralized markets: activity, anomalies, risk and data quality." },
      { property: "og:title", content: "Command Center — DEX Market Intelligence" },
      { property: "og:description", content: "Live market activity, newly observed pairs, unusual activity and agent status." },
    ],
  }),
  component: CommandCenter,
});

function CommandCenter() {
  const { assessments, pairs, envelope, query, peers } = useMarketIntelligence();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  useEffect(() => {
    const sync = () => setAlerts(getAlerts().slice(0, 40));
    sync();
    return subscribeStore(sync);
  }, []);

  const newest = useMemo(
    () => [...assessments].filter((a) => a.pair.pairCreatedAt).sort((a, b) => (b.pair.pairCreatedAt ?? 0) - (a.pair.pairCreatedAt ?? 0)).slice(0, 6),
    [assessments],
  );
  const unusual = useMemo(
    () => assessments.filter((a) => a.anomalies.some((x) => x.severity === "UNUSUAL" || x.severity === "SEVERE")).slice(0, 8),
    [assessments],
  );
  const riskiest = useMemo(() => [...assessments].filter((a) => a.risk.score !== null).sort((a, b) => (b.risk.score ?? 0) - (a.risk.score ?? 0)).slice(0, 6), [assessments]);
  const lowConfidence = assessments.filter((a) => a.confidence.band === "LOW").length;
  const totalLiquidity = assessments.reduce((s, a) => s + (a.pair.liquidityUsd ?? 0), 0);
  const totalVolume = assessments.reduce((s, a) => s + (a.pair.volume.h24 ?? 0), 0);

  const unavailable = !query.isLoading && (!envelope || !envelope.ok);

  return (
    <TerminalShell>
      <SectionTitle sub="What is happening right now across the pairs this terminal is currently observing.">COMMAND CENTER</SectionTitle>

      {unavailable && (
        <div className="mb-4">
          <DataState
            state="DATA UNAVAILABLE"
            detail="The DEX data source could not be reached. Existing cached observations may still be available; the terminal will retry automatically."
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="LIVE MARKET ACTIVITY" right={<Tag kind="LIVE" />}>
            {query.isLoading ? (
              <DataState state="WAITING FOR DATA" detail="Requesting observations from the data source." />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric label="OBSERVED PAIRS" value={count(pairs.length)} emphasis />
                  <Metric label="OBSERVED LIQUIDITY" value={usd(totalLiquidity)} kind="CALCULATED" emphasis />
                  <Metric label="OBSERVED VOL 24H" value={usd(totalVolume)} kind="CALCULATED" emphasis />
                  <Metric label="PEER BASELINE" value={peers.count >= 20 ? `${peers.count} PAIRS` : "INSUFFICIENT DATA"} kind="CALCULATED" emphasis />
                </div>
                <div className="mt-3">
                  <SourceLine observedAt={envelope?.observedAt ?? null} cached={envelope?.cached} stale={envelope?.stale} />
                </div>
              </>
            )}
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="NEWLY OBSERVED PAIRS" right={<Tag kind="LIVE" />}>
              {newest.length ? (
                <ul className="space-y-2">
                  {newest.map((a) => (
                    <li key={a.pair.key} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 text-xs">
                      <Link to="/pair/$chainId/$pairId" params={{ chainId: a.pair.chainId, pairId: a.pair.pairAddress }} className="num hover:text-cyan">
                        {a.pair.baseSymbol}/{a.pair.quoteSymbol}
                      </Link>
                      <span className="num text-muted-foreground">{a.pair.chainId}</span>
                      <span className="num text-muted-foreground">AGE {ageFrom(a.pair.pairCreatedAt)}</span>
                      <RiskBadge band={a.risk.band} score={a.risk.score} />
                    </li>
                  ))}
                </ul>
              ) : (
                <DataState state="INSUFFICIENT DATA" detail="No pair creation timestamps present in the current observation batch." />
              )}
            </Panel>

            <Panel title="UNUSUAL ACTIVITY" right={<Tag kind="AGENT" />}>
              {unusual.length ? (
                <ul className="space-y-2">
                  {unusual.map((a) => (
                    <li key={a.pair.key} className="border-b border-border/40 pb-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <Link to="/pair/$chainId/$pairId" params={{ chainId: a.pair.chainId, pairId: a.pair.pairAddress }} className="num hover:text-cyan">
                          {a.pair.baseSymbol}
                        </Link>
                        <SeverityBadge severity={a.anomalies[0]!.severity} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{a.anomalies[0]!.what}</p>
                    </li>
                  ))}
                </ul>
              ) : peers.count >= 20 ? (
                <EmptyState title="NO UNUSUAL ACTIVITY OBSERVED" hint="No anomaly thresholds were crossed against the current peer baselines." />
              ) : (
                <DataState state="INSUFFICIENT DATA" detail="Anomaly detection needs at least 20 peer observations before it will emit signals." />
              )}
            </Panel>

            <Panel title="RISK CHANGES / HIGHEST OBSERVED RISK" right={<Tag kind="AGENT" />}>
              {riskiest.length ? (
                <ul className="space-y-2">
                  {riskiest.map((a) => (
                    <li key={a.pair.key} className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 text-xs">
                      <Link to="/pair/$chainId/$pairId" params={{ chainId: a.pair.chainId, pairId: a.pair.pairAddress }} className="num hover:text-cyan">
                        {a.pair.baseSymbol}
                      </Link>
                      <span className="num text-muted-foreground">LIQ {usd(a.pair.liquidityUsd)}</span>
                      <RiskBadge band={a.risk.band} score={a.risk.score} />
                    </li>
                  ))}
                </ul>
              ) : (
                <DataState state="INSUFFICIENT DATA" detail="Not enough dimensions available to synthesize risk scores." />
              )}
            </Panel>

            <Panel title="DATA QUALITY" right={<Tag kind="CALCULATED" />}>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="LOW CONFIDENCE" value={count(lowConfidence)} kind="CALCULATED" />
                <Metric label="STALE OBSERVATIONS" value={count(assessments.filter((a) => a.confidence.freshnessSeconds > 300).length)} kind="CALCULATED" />
                <Metric label="LAST INGESTION" value={clockOf(envelope?.observedAt ?? null)} />
                <Metric label="SOURCE STATE" value={envelope?.stale ? "STALE DATA" : envelope?.ok ? "LIVE" : "DATA UNAVAILABLE"} />
              </div>
            </Panel>
          </div>

          <Panel title="OBSERVED PAIRS — FULL TABLE" right={<Tag kind="LIVE" />}>
            <PairTable rows={assessments} dense />
          </Panel>
        </div>

        {/* RIGHT: analysis engine + feed */}
        <div className="space-y-4">
          <Panel title="ANALYSIS ENGINE">
            <AiCore size={230} />
          </Panel>

          <Panel title="MARKET ACTIVITY FEED" right={<Tag kind="AGENT" />}>
            {alerts.length ? (
              <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {alerts.map((e) => (
                  <li key={e.id} className="border-b border-border/40 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-[10px] text-unknown">{clockOf(e.t)}</span>
                      <SeverityBadge severity={e.severity} />
                    </div>
                    <Link
                      to="/pair/$chainId/$pairId"
                      params={{ chainId: e.chainId, pairId: e.key.split(":")[1] ?? "" }}
                      className="num mt-1 block text-xs text-foreground hover:text-cyan"
                    >
                      {e.kind} · {e.symbol} · {e.chainId}/{e.dexId}
                    </Link>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{e.message}</p>
                    <p className="num mt-1 text-[10px] text-unknown">CONFIDENCE {e.confidence} · {secondsSince(e.t)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="NO EVENTS RECORDED YET"
                hint="Events appear as the ingestion cycle observes anomalies, risk classifications or stale data. Keep the terminal open to accumulate observations."
              />
            )}
          </Panel>
        </div>
      </div>
    </TerminalShell>
  );
}
