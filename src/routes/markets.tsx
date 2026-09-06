import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, Metric, Panel, SectionTitle, Tag } from "@/components/kit";
import { PairTable } from "@/components/PairTable";
import { FilterBuilder, emptyGroup, evaluateGroup, type Group } from "@/components/FilterBuilder";
import { MarketMap } from "@/components/MarketMap";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { count, usd } from "@/lib/format";

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title: "Markets — DEX Market Intelligence" },
      { name: "description", content: "Filter observed pairs with nested AND/OR/NOT conditions and explore the cosmic market map of chains, DEXs and pairs." },
      { property: "og:title", content: "Markets — DEX Market Intelligence" },
      { property: "og:description", content: "Advanced query builder and market map over live DEX observations." },
    ],
  }),
  component: Markets;
});

function Markets() {
  const { assessments, query } = useMarketIntelligence();
  const [group, setGroup] = useState<Group>(() => emptyGroup());

  const filtered = useMemo(() => assessments.filter((a) => evaluateGroup(a, group)), [assessments, group]);
  const chains = useMemo(() => {
    const map = new Map<string, { liquidity: number; volume: number; pairs: number }>();
    for (const a of filtered) {
      const e = map.get(a.pair.chainId) ?? { liquidity: 0, volume: 0, pairs: 0 };
      e.liquidity += a.pair.liquidityUsd ?? 0;
      e.volume += a.pair.volume.h24 ?? 0;
      e.pairs += 1;
      map.set(a.pair.chainId, e);
    }
    return [...map.entries()].sort((a, b) => b[1].liquidity - a[1].liquidity);
  }, [filtered]);

  return (
    <TerminalShell>
      <SectionTitle sub="Structural view of the observation batch: query builder, chain/DEX aggregation and the market map.">MARKETS</SectionTitle>

      <div className="space-y-4">
        <Panel title="ADVANCED FILTER BUILDER" right={<Tag kind="CALCULATED" />}>
          <FilterBuilder group={group} onChange={setGroup} matching={filtered.length} total={assessments.length} />
        </Panel>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="MARKET MAP" right={<Tag kind="VISUAL" label="LIVE TOPOLOGY" />}>
            {filtered.length ? (
              <MarketMap rows={filtered} />
            ) : (
              <DataState state="WAITING FOR DATA" detail="No observations match the current conditions." />
            )}
          </Panel>

          <Panel title="CHAIN AGGREGATION" right={<Tag kind="CALCULATED" />}>
            {chains.length ? (
              <ul className="space-y-3">
                {chains.map(([chain, e]) => (
                  <li key={chain} className="border-b border-border/40 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="num text-xs uppercase tracking-[0.14em] text-foreground">{chain}</span>
                      <span className="num text-[11px] text-muted-foreground">{count(e.pairs)} pairs</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <Metric label="LIQUIDITY" value={usd(e.liquidity)} kind="CALCULATED" />
                      <Metric label="VOL 24H" value={usd(e.volume)} kind="CALCULATED" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : query.isLoading ? (
              <DataState state="WAITING FOR DATA" />
            ) : (
              <DataState state="DATA UNAVAILABLE" detail="No observations available to aggregate." />
            )}
          </Panel>
        </div>

        <Panel title="MATCHING OBSERVATIONS">
          <PairTable rows={filtered} dense />
        </Panel>
      </div>
    </TerminalShell>
  );
}
