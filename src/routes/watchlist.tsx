import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { TerminalShell } from "@/components/TerminalShell";
import { ConfidenceBadge, DataState, EmptyState, Panel, RiskBadge, SectionTitle, Tag } from "@/components/kit";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { getWatchlist, setWatchGroup, subscribeStore, toggleWatch, type WatchItem } from "@/lib/local-store";
import { secondsSince, usd } from "@/lib/format";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist — DEX Market Intelligence" },
      { name: "description", content: "Monitor saved pairs with observed price, liquidity, volume, risk, confidence and anomaly counts." },
      { property: "og:title", content: "Watchlist — DEX Market Intelligence" },
      { property: "og:description", content: "Grouped monitoring of saved DEX pairs with risk and confidence context." },
    ],
  }),
  component: Watchlist,
});

function Watchlist() {
  const { assessments } = useMarketIntelligence();
  const [items, setItems] = useState<WatchItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(getWatchlist());
    sync();
    return subscribeStore(sync);
  }, []);

  const byGroup = useMemo(() => {
    const map = new Map<string, WatchItem[]>();
    for (const w of items) map.set(w.group, [...(map.get(w.group) ?? []), w]);
    return [...map.entries()];
  }, [items]);

  if (!items.length) {
    return (
      <TerminalShell>
        <SectionTitle sub="Saved pairs are monitored on every ingestion cycle.">WATCHLIST</SectionTitle>
        <Panel>
          <EmptyState
            title="NO WATCHLIST ITEMS"
            hint="Add a token or pair to begin monitoring. Use the star control in any observation table, or open a pair and add it from its intelligence page."
            action={
              <Link to="/discover" search={{ q: "", focus: false }} className="num rounded-sm border border-cyan/50 px-3 py-1.5 text-[10px] tracking-[0.16em] text-cyan hover:bg-cyan/10">
                OPEN DISCOVERY
              </Link>
            }
          />
        </Panel>
      </TerminalShell>
    );
  }

  return (
    <TerminalShell>
      <SectionTitle sub="Saved pairs, grouped. Values shown come from the most recent observation batch that contained the pair.">
        WATCHLIST
      </SectionTitle>

      <div className="space-y-4">
        {byGroup.map(([group, list]) => (
          <Panel key={group} title={`GROUP · ${group}`} right={<Tag kind="LIVE" />}>
            <ul className="space-y-3">
              {list.map((w) => {
                const a = assessments.find((x) => x.pair.key === w.key);
                return (
                  <li key={w.key} className="border-b border-border/40 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to="/pair/$chainId/$pairId"
                        params={{ chainId: w.chainId, pairId: w.pairAddress }}
                        className="num text-sm text-foreground hover:text-cyan"
                      >
                        {w.symbol} <span className="text-unknown">· {w.chainId}</span>
                      </Link>
                      <div className="flex items-center gap-2">
                        <input
                          value={w.group}
                          onChange={(e) => setWatchGroup(w.key, e.target.value || "Default")}
                          className="num w-28 rounded-sm border border-input bg-background/60 px-2 py-1 text-[10px]"
                          aria-label="Group name"
                        />
                        <button
                          onClick={() => a && toggleWatch(a.pair)}
                          disabled={!a}
                          aria-label="Remove from watchlist"
                          className="text-unknown hover:text-signal-extreme disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {a ? (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
                        <span className="num">LIQ {usd(a.pair.liquidityUsd)}</span>
                        <span className="num">VOL {usd(a.pair.volume.h24)}</span>
                        <span className="num">ANOM {a.anomalies.length}</span>
                        <RiskBadge band={a.risk.band} score={a.risk.score} />
                        <ConfidenceBadge score={a.confidence.score} band={a.confidence.band} />
                        <span className="num text-unknown">UPDATED {secondsSince(a.pair.observedAt)}</span>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <DataState
                          state="WAITING FOR DATA"
                          detail="This pair is not in the current observation batch. Open its intelligence page to request a direct observation."
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}
      </div>
    </TerminalShell>
  );
}
