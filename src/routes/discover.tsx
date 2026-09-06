import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { PairTable } from "@/components/PairTable";
import { assessPair, buildPeerSet } from "@/lib/analysis";
import { searchQuery, useMarketIntelligence } from "@/hooks/useMarket";

export const Route = createFileRoute("/discover")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : "",
    focus: s.focus === true || s.focus === "true",
  }),
  head: () => ({
    meta: [
      { title: "Discovery — DEX Market Intelligence" },
      { name: "description", content: "Search observed pairs by token name, symbol, contract, pair address, chain or DEX and sort by observed metrics." },
      { property: "og:title", content: "Discovery — DEX Market Intelligence" },
      { property: "og:description", content: "Search and sort live DEX pair observations with risk, confidence and anomaly columns." },
    ],
  }),
  component: Discover,
});

function Discover() {
  const { q: initialQ, focus } = Route.useSearch();
  const [raw, setRaw] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const market = useMarketIntelligence();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(raw), 350);
    return () => clearTimeout(t);
  }, [raw]);

  useEffect(() => {
    if (focus) inputRef.current?.focus();
  }, [focus]);

  const search = useQuery(searchQuery(debounced));
  const results = useMemo(() => {
    const pairs = search.data?.data ?? [];
    if (!pairs.length) return [];
    const peers = buildPeerSet(pairs);
    return pairs.map((p) => assessPair(p, peers, market.historyCounts[p.key] ?? 0));
  }, [search.data, market.historyCounts]);

  const showing = debounced.trim().length > 1 ? results : market.assessments;

  return (
    <TerminalShell>
      <SectionTitle sub="Search the data source directly. Results are raw observations plus calculated context — never recommendations.">
        DISCOVER
      </SectionTitle>

      <Panel className="mb-4">
        <div className="flex items-center gap-2 rounded-sm border border-input bg-background/60 px-3 py-2">
          <Search className="h-4 w-4 text-cyan" />
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Token name, symbol, contract address, pair address, chain or DEX…"
            className="num w-full bg-transparent text-sm outline-none placeholder:text-unknown"
          />
          <Tag kind="LIVE" label="DEX SCREENER SEARCH" />
        </div>
        {debounced.trim().length > 1 && (
          <div className="mt-2">
            <SourceLine observedAt={search.data?.observedAt ?? null} cached={search.data?.cached} stale={search.data?.stale} />
          </div>
        )}
      </Panel>

      <Panel title={debounced.trim().length > 1 ? `SEARCH RESULTS — "${debounced}"` : "CURRENT OBSERVATION BATCH"}>
        {search.isFetching && !results.length ? (
          <DataState state="WAITING FOR DATA" detail="Querying the data source." />
        ) : debounced.trim().length > 1 && !results.length ? (
          <DataState state="DATA UNAVAILABLE" detail="The data source returned no pairs for this query, or could not be reached." />
        ) : (
          <PairTable rows={showing} dense />
        )}
      </Panel>
    </TerminalShell>
  );
}
