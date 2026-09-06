import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, EmptyState, Panel, SectionTitle, SeverityBadge, Tag } from "@/components/kit";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/dex-types";

const LEVELS: Severity[] = ["NORMAL", "NOTABLE", "UNUSUAL", "SEVERE"];

export const Route = createFileRoute("/anomalies")({
  head: () => ({
    meta: [
      { title: "Anomalies — DEX Market Intelligence" },
      { name: "description", content: "Peer-aware anomaly detection: what changed, when, by how much, versus which baseline, and with what confidence." },
      { property: "og:title", content: "Anomalies — DEX Market Intelligence" },
      { property: "og:description", content: "Explainable anomaly signals against percentile baselines from monitored peers." },
    ],
  }),
  component: Anomalies,
});

function Anomalies() {
  const { assessments, peers } = useMarketIntelligence();
  const [min, setMin] = useState<Severity>("NOTABLE");

  const rows = useMemo(() => {
    const rank = (s: Severity) => LEVELS.indexOf(s);
    return assessments
      .flatMap((a) => a.anomalies.map((an) => ({ a, an })))
      .filter((r) => rank(r.an.severity) >= rank(min))
      .sort((x, y) => rank(y.an.severity) - rank(x.an.severity) || y.an.confidence - x.an.confidence);
  }, [assessments, min]);

  return (
    <TerminalShell>
      <SectionTitle sub="Anomalies are only emitted when a peer baseline of at least 20 comparable observations exists.">ANOMALIES</SectionTitle>

      <Panel className="mb-4" title="SEVERITY FILTER" right={<Tag kind="AGENT" />}>
        <div className="flex flex-wrap items-center gap-2">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setMin(l)}
              className={cn(
                "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
                min === l ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              ≥ {l}
            </button>
          ))}
          <span className="label-xs ml-2">peer baseline: {peers.count >= 20 ? `${peers.count} pairs` : "INSUFFICIENT DATA"}</span>
        </div>
      </Panel>

      {peers.count < 20 ? (
        <DataState state="INSUFFICIENT DATA" detail="The anomaly engine requires at least 20 peer observations. It will begin emitting signals once the batch grows." />
      ) : rows.length ? (
        <div className="space-y-3">
          {rows.map(({ a, an }, i) => (
            <Panel key={`${a.pair.key}:${an.metric}:${i}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  to="/pair/$chainId/$pairId"
                  params={{ chainId: a.pair.chainId, pairId: a.pair.pairAddress }}
                  className="num text-sm hover:text-cyan"
                >
                  {a.pair.baseSymbol}/{a.pair.quoteSymbol} <span className="text-unknown">· {a.pair.chainId}/{a.pair.dexId}</span>
                </Link>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={an.severity} />
                  <span className="num text-[10px] text-unknown">CONFIDENCE {an.confidence}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-foreground">{an.what}</p>
              <div className="mt-3 grid gap-3 text-[11px] sm:grid-cols-2 lg:grid-cols-5">
                <Field label="WHAT CHANGED" value={an.metric} />
                <Field label="WHEN" value={clockOf(an.detectedAt)} />
                <Field label="HOW MUCH" value={`${an.observedValue} (${an.deviation})`} />
                <Field label="BASELINE" value={an.baseline} />
                <Field label="WHY UNUSUAL" value={an.why} />
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState title="NO ANOMALIES AT THIS SEVERITY" hint="Lower the severity filter, or keep the terminal running — new observations are evaluated on every ingestion cycle." />
      )}
    </TerminalShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <p className="num mt-0.5 leading-snug text-muted-foreground">{value}</p>
    </div>
  );
}
