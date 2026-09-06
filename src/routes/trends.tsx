import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, EmptyState, Metric, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { adsQuery, boostsQuery, metasQuery, profileUpdatesQuery, profilesQuery, takeoversQuery, topBoostsQuery } from "@/hooks/useMarket";
import { count, pct, usd } from "@/lib/format";

export const Route = createFileRoute("/trends")({
  head: () => ({
    meta: [
      { title: "Trends & Metadata — DEX Market Intelligence" },
      { name: "description", content: "Trending metas, token profiles, community takeovers, boosts and ads — labelled as promotional or community metadata, never as quality signals." },
      { property: "og:title", content: "Trends & Metadata — DEX Market Intelligence" },
      { property: "og:description", content: "Meta market caps, liquidity and token counts alongside promotional metadata feeds." },
    ],
  }),
  component: Trends,
});

function Trends() {
  const metas = useQuery(metasQuery);
  const profiles = useQuery(profilesQuery);
  const updates = useQuery(profileUpdatesQuery);
  const takeovers = useQuery(takeoversQuery);
  const boosts = useQuery(boostsQuery);
  const top = useQuery(topBoostsQuery);
  const ads = useQuery(adsQuery);

  return (
    <TerminalShell>
      <SectionTitle sub="Trending status and promotional metadata describe attention, not quality or safety. Nothing here is a recommendation.">
        TRENDS
      </SectionTitle>

      <div className="space-y-4">
        <Panel title="TRENDING METAS" right={<Tag kind="LIVE" />}>
          {metas.isLoading ? (
            <DataState state="WAITING FOR DATA" />
          ) : metas.data?.data.length ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metas.data.data.map((m) => (
                  <div key={m.slug ?? m.name} className="rounded-md border border-border/60 p-3">
                    <p className="num text-xs uppercase tracking-[0.14em] text-foreground">
                      {m.icon?.value ? `${m.icon.value} ` : ""}
                      {m.name ?? m.slug}
                    </p>
                    {m.description && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{m.description}</p>}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Metric label="MARKET CAP" value={usd(m.marketCap ?? null)} />
                      <Metric label="LIQUIDITY" value={usd(m.liquidity ?? null)} />
                      <Metric label="VOLUME" value={usd(m.volume ?? null)} />
                      <Metric label="TOKENS" value={count(m.tokenCount ?? null)} />
                    </div>
                    {m.marketCapChange && (
                      <p className="num mt-2 text-[10px] text-muted-foreground">
                        MC CHANGE 24H {pct(m.marketCapChange["h24"] ?? null)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <SourceLine observedAt={metas.data.observedAt} cached={metas.data.cached} stale={metas.data.stale} />
              </div>
            </>
          ) : (
            <DataState state="DATA UNAVAILABLE" detail="The trending meta endpoint could not be reached." />
          )}
        </Panel>

        <div className="grid gap-4 md:grid-cols-2">
          <MetaList title="LATEST TOKEN PROFILES" q={profiles} note="Community-supplied profile metadata." />
          <MetaList title="RECENT PROFILE UPDATES" q={updates} note="Profiles updated recently by their submitters." />
          <MetaList title="COMMUNITY TAKEOVERS" q={takeovers} note="Community takeover records. Not a quality or safety signal." />
          <MetaList title="LATEST BOOSTS" q={boosts} note="Paid promotional boosts." />
          <MetaList title="TOP BOOSTED TOKENS" q={top} note="Tokens with the most cumulative paid boosts." />
          <MetaList title="LATEST ADS" q={ads} note="Paid advertisement placements." />
        </div>
      </div>
    </TerminalShell>
  );
}

type ListQuery = ReturnType<typeof useQuery<{ ok: boolean; data: { url?: string; chainId?: string; tokenAddress?: string; description?: string; amount?: number; totalAmount?: number }[]; observedAt: number | null; cached: boolean; stale: boolean; error: string | null }>>;

function MetaList({ title, q, note }: { title: string; q: ListQuery; note: string }) {
  return (
    <Panel title={title} right={<Tag kind="LIVE" label="PROMOTIONAL METADATA" />}>
      <p className="label-xs mb-2">{note}</p>
      {q.isLoading ? (
        <DataState state="WAITING FOR DATA" />
      ) : q.data?.data.length ? (
        <>
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {q.data.data.slice(0, 25).map((e, i) => (
              <li key={`${e.tokenAddress}-${i}`} className="border-b border-border/40 pb-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-[11px] uppercase text-foreground/85">{e.chainId ?? "—"}</span>
                  {typeof e.totalAmount === "number" && <span className="num text-[10px] text-cyan">TOTAL {e.totalAmount}</span>}
                  {typeof e.amount === "number" && <span className="num text-[10px] text-electric">AMOUNT {e.amount}</span>}
                </div>
                <p className="num truncate text-[10px] text-unknown" title={e.tokenAddress}>
                  {e.tokenAddress}
                </p>
                {e.description && <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{e.description}</p>}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <SourceLine observedAt={q.data.observedAt} cached={q.data.cached} stale={q.data.stale} />
          </div>
        </>
      ) : (
        <EmptyState title="NO RECORDS RETURNED" hint="The data source returned no records for this feed at this time." />
      )}
    </Panel>
  );
}
