import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { TerminalShell } from "@/components/TerminalShell";
import {
  Bar,
  ConfidenceBadge,
  DataState,
  Delta,
  EmptyState,
  Metric,
  Panel,
  RiskBadge,
  SeverityBadge,
  SourceLine,
  Tag,
} from "@/components/kit";
import { AgentNetwork } from "@/components/AgentNetwork";
import { pairQuery, useHistory } from "@/hooks/useMarket";
import { ageFrom, clockOf, count, price, ratio, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getNote, historyCounts, isWatched, recordObservation, setNote, toggleWatch } from "@/lib/local-store";

const RANGES = [
  { key: "5m", ms: 5 * 60_000 },
  { key: "1h", ms: 60 * 60_000 },
  { key: "6h", ms: 6 * 60 * 60_000 },
  { key: "24h", ms: 24 * 60 * 60_000 },
  { key: "7d", ms: 7 * 24 * 60 * 60_000 },
  { key: "30d", ms: 30 * 24 * 60 * 60_000 },
] as const;

export const Route = createFileRoute("/pair/$chainId/$pairId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.chainId.toUpperCase()} pair intelligence — DEX Market Intelligence` },
      { name: "description", content: "Full research terminal for a single observed pair: raw observations, calculated metrics, risk, confidence, anomalies, agent analysis and timeline." },
      { property: "og:title", content: `${params.chainId.toUpperCase()} pair intelligence — DEX Market Intelligence` },
      { property: "og:description", content: "Raw, calculated and agent-derived intelligence for one decentralized market pair." },
    ],
  }),
  component: PairIntel,
});

function PairIntel() {
  const { chainId, pairId } = Route.useParams();
  const key = `${chainId}:${pairId}`;
  const history = useHistory(key);
  const q = useQuery(pairQuery(chainId, pairId, historyCounts()[key] ?? 0));
  const a = q.data?.data ?? null;
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("24h");
  const [note, setNoteText] = useState("");
  const [, force] = useState(0);

  useEffect(() => setNoteText(getNote(key)), [key]);

  useEffect(() => {
    if (a) recordObservation(a.pair, { riskScore: a.risk.score, confidence: a.confidence.score, anomalies: a.anomalies });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.dataUpdatedAt]);

  const chartData = useMemo(() => {
    const span = RANGES.find((r) => r.key === range)!.ms;
    return history
      .filter((p) => Date.now() - p.t <= span)
      .map((p) => ({ t: clockOf(p.t), price: p.priceUsd, liquidity: p.liquidityUsd, volume: p.volume24h }));
  }, [history, range]);

  if (q.isLoading) {
    return (
      <TerminalShell>
        <DataState state="WAITING FOR DATA" detail="Requesting a direct observation of this pair from the data source." />
      </TerminalShell>
    );
  }

  if (!a) {
    return (
      <TerminalShell>
        <DataState
          state="DATA UNAVAILABLE"
          detail="This pair could not be observed. It may no longer be listed by the data source, or the source could not be reached."
        />
        <div className="mt-4">
          <Link to="/discover" search={{ q: "", focus: false }} className="num rounded-sm border border-cyan/50 px-3 py-1.5 text-[10px] tracking-[0.16em] text-cyan hover:bg-cyan/10">
            RETURN TO DISCOVERY
          </Link>
        </div>
      </TerminalShell>
    );
  }

  const watched = isWatched(a.pair.key);
  const timeline = buildTimeline(a);

  return (
    <TerminalShell>
      {/* HEADER */}
      <Panel className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="display text-2xl tracking-[0.1em] text-foreground">
              {a.pair.baseName} <span className="text-cyan">{a.pair.baseSymbol}</span>
              <span className="text-unknown">/{a.pair.quoteSymbol}</span>
            </h1>
            <p className="num mt-1 text-[11px] tracking-[0.12em] text-muted-foreground">
              {a.pair.chainId.toUpperCase()} · {a.pair.dexId.toUpperCase()} · PAIR {a.pair.pairAddress}
            </p>
            <p className="num mt-0.5 text-[10px] text-unknown">TOKEN {a.pair.baseAddress}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <RiskBadge band={a.risk.band} score={a.risk.score} />
              <ConfidenceBadge score={a.confidence.score} band={a.confidence.band} />
            </div>
            <button
              onClick={() => {
                toggleWatch(a.pair);
                force((n) => n + 1);
              }}
              className={cn(
                "num flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[10px] tracking-[0.14em]",
                watched ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground hover:border-cyan/50 hover:text-cyan",
              )}
            >
              <Star className={cn("h-3 w-3", watched && "fill-cyan")} /> {watched ? "MONITORING" : "ADD TO WATCHLIST"}
            </button>
            <SourceLine
              observedAt={a.pair.observedAt}
              calculatedAt={a.risk.calculatedAt}
              engineVersion={a.risk.engineVersion}
              cached={q.data?.cached}
              stale={q.data?.stale || a.confidence.freshnessSeconds > 300}
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="RAW OBSERVATIONS" right={<Tag kind="LIVE" />}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="PRICE" value={price(a.pair.priceUsd)} emphasis />
              <Metric label="LIQUIDITY" value={usd(a.pair.liquidityUsd)} emphasis />
              <Metric label="VOLUME 24H" value={usd(a.pair.volume.h24)} emphasis />
              <Metric label="TXNS 24H" value={count(a.calculated.txns24h)} kind="CALCULATED" emphasis />
              <Metric label="FDV" value={usd(a.pair.fdv)} />
              <Metric label="MARKET CAP" value={usd(a.pair.marketCap)} />
              <Metric label="PAIR AGE" value={ageFrom(a.pair.pairCreatedAt)} />
              <Metric label="BUYS / SELLS 24H" value={a.pair.txns.h24 ? `${a.pair.txns.h24.buys} / ${a.pair.txns.h24.sells}` : "DATA UNAVAILABLE"} />
            </div>
            <div className="mt-4 grid grid-cols-4 gap-4 border-t border-border pt-3">
              {(["m5", "h1", "h6", "h24"] as const).map((k) => (
                <div key={k}>
                  <p className="label-xs">{k.toUpperCase()}</p>
                  <p className="mt-1 text-sm">
                    <Delta value={a.pair.priceChange[k]} />
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="CALCULATED METRICS" right={<Tag kind="CALCULATED" />}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Metric label="VOLUME / LIQUIDITY" value={ratio(a.calculated.volumeToLiquidity24h)} kind="CALCULATED" />
              <Metric label="BUY / SELL RATIO" value={ratio(a.calculated.buySellRatio24h, "")} kind="CALCULATED" />
              <Metric label="VOLATILITY PROXY" value={a.calculated.volatilityProxy !== null ? `${a.calculated.volatilityProxy.toFixed(2)}%` : "INSUFFICIENT DATA"} kind="CALCULATED" />
              <Metric label="LIQUIDITY / TXN" value={usd(a.calculated.liquidityPerTxn)} kind="CALCULATED" />
              <Metric label="LIQ PERCENTILE" value={a.peerContext.liquidityPercentile !== null ? `p${a.peerContext.liquidityPercentile}` : "INSUFFICIENT DATA"} kind="CALCULATED" />
              <Metric label="VOL PERCENTILE" value={a.peerContext.volumePercentile !== null ? `p${a.peerContext.volumePercentile}` : "INSUFFICIENT DATA"} kind="CALCULATED" />
            </div>
            <p className="label-xs mt-3">{a.peerContext.note}</p>
          </Panel>

          <Panel
            title="HISTORICAL OBSERVATIONS"
            right={
              <div className="flex flex-wrap gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={cn(
                      "num rounded-sm border px-1.5 py-0.5 text-[10px] tracking-[0.1em]",
                      range === r.key ? "border-cyan/60 text-cyan" : "border-border text-unknown hover:text-foreground",
                    )}
                  >
                    {r.key}
                  </button>
                ))}
              </div>
            }
          >
            {chartData.length >= 2 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.82 0.13 205)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="oklch(0.82 0.13 205)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="oklch(0.42 0.05 268 / 0.25)" vertical={false} />
                    <XAxis dataKey="t" tick={{ fontSize: 10, fill: "oklch(0.68 0.028 258)" }} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "oklch(0.68 0.028 258)" }} width={70} />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.16 0.03 274)",
                        border: "1px solid oklch(0.34 0.045 278)",
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                    />
                    <Area type="monotone" dataKey="price" stroke="oklch(0.82 0.13 205)" fill="url(#pf)" strokeWidth={1.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <DataState
                state="INSUFFICIENT DATA"
                detail={`${history.length} observation${history.length === 1 ? "" : "s"} recorded for this pair so far. The chart plots only observations this terminal actually received — no historical values are reconstructed or estimated.`}
              />
            )}
          </Panel>

          <Panel title="RISK ASSESSMENT" right={<Tag kind="AGENT" />}>
            {a.risk.score === null ? (
              <DataState state="INSUFFICIENT DATA" detail="Too few risk dimensions have available data to synthesize a score." />
            ) : (
              <>
                <div className="mb-3 flex items-baseline gap-3">
                  <span className="num text-4xl text-foreground">{a.risk.score}</span>
                  <span className="num text-xs text-muted-foreground">/ 100 OBSERVED RISK</span>
                  <RiskBadge band={a.risk.band} />
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {a.risk.factors.map((f) => (
                    <li key={f.dimension}>
                      <div className="flex items-center justify-between">
                        <span className="label-xs">{f.dimension}</span>
                        <span className="num text-[10px]">{f.points.toFixed(1)} / {f.maxPoints}</span>
                      </div>
                      <Bar value={f.points} max={f.maxPoints} tone={f.dataAvailable ? "cyan" : "warn"} />
                      <p className="mt-1 text-[10px] text-muted-foreground">{f.basis}</p>
                    </li>
                  ))}
                </ul>
                <p className="label-xs mt-3">{a.risk.engineVersion} · calculated {clockOf(a.risk.calculatedAt)}</p>
              </>
            )}
          </Panel>

          <Panel title="ANOMALIES" right={<Tag kind="AGENT" />}>
            {a.anomalies.length ? (
              <ul className="space-y-3">
                {a.anomalies.map((an, i) => (
                  <li key={i} className="border-b border-border/40 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-xs text-foreground">{an.metric}</span>
                      <SeverityBadge severity={an.severity} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{an.what}</p>
                    <p className="num mt-1 text-[10px] text-unknown">
                      {an.observedValue} vs {an.baseline} · {an.deviation} · CONFIDENCE {an.confidence}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{an.why}</p>
                  </li>
                ))}
              </ul>
            ) : a.peerContext.available ? (
              <EmptyState title="NO ANOMALIES DETECTED" hint="No thresholds were crossed against the current peer baseline." />
            ) : (
              <DataState state="INSUFFICIENT DATA" detail="Peer baseline below 20 observations; anomaly detection is suppressed." />
            )}
          </Panel>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          <Panel title="AGENT ANALYSIS" right={<Tag kind="AGENT" />}>
            <AgentNetwork agents={a.agents} busy={q.isFetching} />
            <div className="mt-3 space-y-2">
              <p className="num text-xs">
                CONSENSUS <span className="text-cyan">{a.consensus.agree} / {a.consensus.total}</span> · DISAGREEMENT{" "}
                <span className="text-signal-mid">{a.consensus.disagree}</span> · UNRESOLVED <span className="text-unknown">{a.consensus.unresolved}</span>
              </p>
              <ul className="space-y-2">
                {a.agents.map((ag) => (
                  <li key={ag.agentId} className="border-b border-border/40 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="num text-[10px] tracking-[0.1em] text-foreground/85">
                        {ag.agentNumber} {ag.name}
                      </span>
                      <span className="num text-[10px] text-unknown">{ag.vote}</span>
                    </div>
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{ag.observations[0]}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="CONFIDENCE" right={<Tag kind="CALCULATED" />}>
            <ConfidenceBadge score={a.confidence.score} band={a.confidence.band} />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Metric label="COMPLETENESS" value={`${a.confidence.completeness}%`} kind="CALCULATED" />
              <Metric label="OBSERVATION AGE" value={`${a.confidence.freshnessSeconds}s`} kind="CALCULATED" />
            </div>
            <ul className="mt-3 space-y-1">
              {a.confidence.reasons.map((r, i) => (
                <li key={i} className="text-[10px] leading-snug text-muted-foreground">
                  · {r}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="TIMELINE" right={<Tag kind="CALCULATED" />}>
            {timeline.length ? (
              <ul className="space-y-2">
                {timeline.map((t, i) => (
                  <li key={i} className="border-b border-border/40 pb-1.5">
                    <p className="num text-[10px] text-unknown">{t.when}</p>
                    <p className="text-[11px] text-foreground/85">{t.what}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="NO TIMELINE EVENTS" hint="Events accumulate as this pair is observed across ingestion cycles." />
            )}
          </Panel>

          <Panel title="PROFILE & PROMOTIONAL METADATA" right={<Tag kind="LIVE" />}>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="TOKEN PROFILE" value={a.pair.hasProfile ? "PRESENT" : "ABSENT"} />
              <Metric label="ACTIVE BOOSTS" value={count(a.pair.boostsActive ?? 0)} />
            </div>
            <p className="label-xs mt-2">promotional and community metadata is not evidence of quality or safety</p>
            {a.pair.url && (
              <a
                href={a.pair.url}
                target="_blank"
                rel="noreferrer noopener"
                className="num mt-3 inline-block rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
              >
                OPEN SOURCE RECORD
              </a>
            )}
          </Panel>

          <Panel title="RESEARCH NOTES" right={<Tag kind="VISUAL" label="PRIVATE" />}>
            <textarea
              value={note}
              onChange={(e) => {
                setNoteText(e.target.value);
                setNote(key, e.target.value);
              }}
              rows={5}
              placeholder="Private research notes. Notes never influence automated analysis."
              className="w-full rounded-sm border border-input bg-background/60 p-2 text-[11px] outline-none placeholder:text-unknown"
            />
          </Panel>
        </div>
      </div>
    </TerminalShell>
  );
}

function buildTimeline(a: NonNullable<ReturnType<typeof useQuery>["data"]> extends never ? never : import("@/lib/dex-types").Assessment) {
  const out: { when: string; what: string }[] = [];
  if (a.pair.pairCreatedAt) out.push({ when: new Date(a.pair.pairCreatedAt).toLocaleString(), what: "Pair creation observed by the data source" });
  if (a.pair.hasProfile) out.push({ when: clockOf(a.pair.observedAt), what: "Token profile metadata present in observation" });
  if ((a.pair.boostsActive ?? 0) > 0) out.push({ when: clockOf(a.pair.observedAt), what: `${a.pair.boostsActive} active boosts observed` });
  for (const an of a.anomalies) out.push({ when: clockOf(an.detectedAt), what: `${an.severity} anomaly — ${an.metric}` });
  if (a.risk.score !== null) out.push({ when: clockOf(a.risk.calculatedAt), what: `Risk classified ${a.risk.band} (${a.risk.score}/100)` });
  out.push({ when: clockOf(a.confidence.freshnessSeconds ? Date.now() : Date.now()), what: `Confidence ${a.confidence.band} (${a.confidence.score}/100)` });
  return out.sort((x, y) => (x.when < y.when ? 1 : -1));
}
