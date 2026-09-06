import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SeverityBadge, Tag } from "@/components/kit";
import { acknowledgeAlerts, clearAlerts, getAlerts, subscribeStore, type AlertEvent } from "@/lib/local-store";
import { clockOf, secondsSince } from "@/lib/format";
import { useMarketIntelligence } from "@/hooks/useMarket";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — DEX Market Intelligence" },
      { name: "description", content: "Deduplicated, cooldown-gated alerts for anomalies, risk classification changes, stale data and promotional events." },
      { property: "og:title", content: "Alerts — DEX Market Intelligence" },
      { property: "og:description", content: "Alert engine output with severity, confidence and source pair links." },
    ],
  }),
  component: Alerts,
});

function Alerts() {
  useMarketIntelligence(); // keeps the ingestion + alert cycle running on this page
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  useEffect(() => {
    const sync = () => setAlerts(getAlerts());
    sync();
    return subscribeStore(sync);
  }, []);

  return (
    <TerminalShell>
      <SectionTitle sub="Each alert is generated from a real observation. Duplicate signals for the same pair and kind are suppressed for 5 minutes.">
        ALERTS
      </SectionTitle>

      <Panel
        right={
          <div className="flex gap-2">
            <button
              onClick={acknowledgeAlerts}
              className="num rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
            >
              ACKNOWLEDGE ALL
            </button>
            <button
              onClick={clearAlerts}
              className="num rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-signal-extreme/60 hover:text-signal-extreme"
            >
              CLEAR
            </button>
          </div>
        }
        title={`ALERT EVENTS · ${alerts.length}`}
      >
        {alerts.length ? (
          <ul className="space-y-2">
            {alerts.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 pb-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={e.severity} />
                    <span className="num text-xs text-foreground">{e.kind}</span>
                    <Link
                      to="/pair/$chainId/$pairId"
                      params={{ chainId: e.chainId, pairId: e.key.split(":")[1] ?? "" }}
                      className="num text-xs text-cyan hover:underline"
                    >
                      {e.symbol} · {e.chainId}/{e.dexId}
                    </Link>
                    {!e.acknowledged && <Tag kind="AGENT" label="NEW" />}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{e.message}</p>
                </div>
                <span className="num shrink-0 text-[10px] text-unknown">
                  {clockOf(e.t)} · {secondsSince(e.t)} · CONF {e.confidence}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="NO ALERTS RECORDED"
            hint="The alert engine writes an event when an anomaly reaches UNUSUAL or SEVERE, when a risk classification crosses 70/100, or when observations go stale. Keep the terminal open to accumulate events."
          />
        )}
      </Panel>
    </TerminalShell>
  );
}
