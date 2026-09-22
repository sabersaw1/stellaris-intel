/**
 * RADAR — the live meme radar.
 *
 * Every card is built from stored observations and detected change events only.
 * Nothing here is a recommendation: a card states what changed and what its
 * research status is. Mainstream assets cannot appear: the universe excludes
 * them and the meme classifier excludes them again.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle } from "@/components/kit";
import { KV, StatePill } from "@/components/kit2";
import { listMemeAlerts, listMemeEvents, listMemeTokens, type MemeEventRow, type MemeTokenRow } from "@/lib/meme.functions";
import { getIgnoredTokens, getWatchedTokens, subscribeStore, toggleIgnoreToken, toggleWatchToken } from "@/lib/local-store";
import { usd } from "@/lib/format";

export const Route = createFileRoute("/radar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Radar — Stellaris Meme Intelligence" },
      {
        name: "description",
        content: "Live meme-coin radar: new launches, accelerating volume, trader and social activity, high risk and deteriorating tokens — with what actually changed.",
      },
      { property: "og:title", content: "Radar — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Research status, never a buy signal. Each card states the observed change and its source." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RadarPage,
});

type Category = "NEW" | "ACCELERATING" | "TRENDING" | "TRADER ACTIVITY" | "SOCIAL" | "HIGH RISK" | "DETERIORATING";

const CATEGORIES: { key: Category; blurb: string }[] = [
  { key: "NEW", blurb: "First observed within the last six hours." },
  { key: "ACCELERATING", blurb: "Volume or transaction count rose meaningfully against the previous observation." },
  { key: "TRENDING", blurb: "Sustained activity across several consecutive observations." },
  { key: "TRADER ACTIVITY", blurb: "A followed trader or wallet was observed acting. Requires FOMO or a Solana RPC." },
  { key: "SOCIAL", blurb: "Mentions or engagement accelerated on X. Requires an X credential." },
  { key: "HIGH RISK", blurb: "Risk signals fired — thin liquidity, concentration or authority risk." },
  { key: "DETERIORATING", blurb: "Liquidity, volume or price fell meaningfully." },
];

function categoriesFor(token: MemeTokenRow, events: MemeEventRow[]): { cats: Set<Category>; changes: string[] } {
  const cats = new Set<Category>();
  const changes: string[] = [];
  const mine = events.filter((e) => e.entityId === token.id);

  const first = token.lastSeenAt ? Date.parse(token.lastSeenAt) : NaN;
  if (Number.isFinite(first) && Date.now() - first < 6 * 3600_000 && token.origin !== "dexscreener") cats.add("NEW");

  for (const e of mine) {
    const pct = e.changePct === null ? null : Math.round(e.changePct);
    const sign = pct === null ? "" : `${pct > 0 ? "+" : ""}${pct}% `;
    if (/VOLUME|ACCELERATION|TRANSACTION/.test(e.kind)) {
      cats.add("ACCELERATING");
      changes.push(`${sign}${e.kind.replaceAll("_", " ").toLowerCase()}`);
    } else if (/LIQUIDITY_(DROP|COLLAPSE)|PRICE_DROP|SELL/.test(e.kind)) {
      cats.add("DETERIORATING");
      changes.push(`${sign}${e.kind.replaceAll("_", " ").toLowerCase()}`);
    } else if (/LIQUIDITY/.test(e.kind)) {
      changes.push(`${sign}${e.kind.replaceAll("_", " ").toLowerCase()}`);
    } else if (/WALLET|TRADER/.test(e.kind)) {
      cats.add("TRADER ACTIVITY");
      changes.push(e.kind.replaceAll("_", " ").toLowerCase());
    } else if (/SOCIAL|MENTION/.test(e.kind)) {
      cats.add("SOCIAL");
      changes.push(e.kind.replaceAll("_", " ").toLowerCase());
    } else if (/RISK/.test(e.kind)) {
      cats.add("HIGH RISK");
      changes.push(e.kind.replaceAll("_", " ").toLowerCase());
    } else {
      changes.push(e.kind.replaceAll("_", " ").toLowerCase());
    }
    if (e.severity === "SEVERE" || e.severity === "HIGH") cats.add("HIGH RISK");
  }

  if (mine.length >= 3) cats.add("TRENDING");
  if (token.liquidityUsd !== null && token.liquidityUsd < 15_000) {
    cats.add("HIGH RISK");
    changes.push("thin liquidity");
  }
  return { cats, changes: [...new Set(changes)].slice(0, 5) };
}

function RadarPage() {
  const tokens = useQuery({ queryKey: ["meme", "tokens"], queryFn: () => listMemeTokens(), refetchInterval: 15_000 });
  const events = useQuery({ queryKey: ["meme", "events"], queryFn: () => listMemeEvents(), refetchInterval: 15_000 });
  const alerts = useQuery({ queryKey: ["meme", "alerts"], queryFn: () => listMemeAlerts(), refetchInterval: 30_000 });

  const [watched, setWatched] = useState<string[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  useEffect(() => {
    const sync = () => {
      setWatched(getWatchedTokens().map((w) => w.tokenId));
      setIgnored(getIgnoredTokens().map((i) => i.tokenId));
    };
    sync();
    return subscribeStore(sync);
  }, []);

  const rows = tokens.data?.rows ?? [];
  const evs = events.data?.rows ?? [];
  const note = tokens.data?.note ?? events.data?.note ?? null;

  const enriched = useMemo(
    () => rows.filter((t) => showIgnored || !ignored.includes(t.id)).map((t) => ({ token: t, ...categoriesFor(t, evs) })),
    [rows, evs, ignored, showIgnored],
  );

  return (
    <TerminalShell>
      <SectionTitle sub="Meme coins only. Each card states the observed change and its research status — never a buy or sell instruction. Empty categories mean nothing was observed, not that nothing exists.">
        LIVE MEME RADAR
      </SectionTitle>

      {note ? (
        <Panel title="DATA STATE">
          <p className="text-xs text-signal-mid">{note}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The radar fills as soon as persistent memory is reachable and one collection cycle has run.
          </p>
        </Panel>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <StatePill label={`TOKENS TRACKED ${rows.length}`} tone={rows.length ? "ok" : "muted"} />
        <StatePill label={`CHANGE EVENTS ${evs.length}`} tone={evs.length ? "info" : "muted"} />
        <StatePill label={`ALERTS ${(alerts.data?.rows ?? []).length}`} tone={(alerts.data?.rows ?? []).length ? "warn" : "muted"} />
        <StatePill label="RESEARCH TOOL — NO TRADING" tone="muted" />
        <button
          type="button"
          onClick={() => setShowIgnored((v) => !v)}
          className="rounded-sm border border-border/60 px-2 py-1 text-[11px] tracking-[0.1em] text-foreground hover:border-cyan/60"
        >
          {showIgnored ? `HIDE IGNORED (${ignored.length})` : `SHOW IGNORED (${ignored.length})`}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {CATEGORIES.map((c) => {
          const items = enriched.filter((e) => e.cats.has(c.key));
          return (
            <Panel key={c.key} title={c.key} right={<StatePill label={`${items.length}`} tone={items.length ? "info" : "muted"} />}>
              <p className="mb-2 text-[11px] leading-relaxed text-unknown">{c.blurb}</p>
              {items.length === 0 ? (
                <p className="text-xs text-unknown">NOTHING OBSERVED IN THIS CATEGORY</p>
              ) : (
                <div className="grid gap-2">
                  {items.slice(0, 8).map((e) => (
                    <div key={e.token.id} className="min-w-0 rounded-sm border border-border/60 bg-background/30 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="num truncate text-xs tracking-[0.1em] text-foreground">
                          ${e.token.symbol ?? "UNKNOWN"} <span className="text-unknown">{e.token.chainId}</span>
                        </span>
                        <StatePill label={e.token.verdict === "MEME" ? "MEME" : "UNKNOWN"} tone={e.token.verdict === "MEME" ? "ok" : "muted"} />
                      </div>
                      <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {e.changes.length ? e.changes.map((ch) => <li key={ch}>• {ch}</li>) : <li className="text-unknown">• no change event recorded yet</li>}
                      </ul>
                      <div className="mt-1 grid gap-0.5">
                        <KV label="LIQUIDITY" value={e.token.liquidityUsd === null ? "UNAVAILABLE" : usd(e.token.liquidityUsd)} />
                        <KV label="24H VOLUME" value={e.token.volume24hUsd === null ? "UNAVAILABLE" : usd(e.token.volume24hUsd)} />
                        <KV label="RESEARCH STATUS" value={e.cats.has("HIGH RISK") ? "DEVELOPING — RISK FLAGGED" : "DEVELOPING"} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Link
                          to="/meme"
                          search={{ token: e.token.id }}
                          className="inline-block rounded-sm border border-border/60 px-2 py-1 text-[11px] tracking-[0.1em] text-cyan hover:border-cyan/60"
                        >
                          OPEN DOSSIER
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            toggleWatchToken({ tokenId: e.token.id, symbol: e.token.symbol, chainId: e.token.chainId })
                          }
                          className="rounded-sm border border-border/60 px-2 py-1 text-[11px] tracking-[0.1em] text-foreground hover:border-cyan/60"
                        >
                          {watched.includes(e.token.id) ? "TRACKED — REMOVE" : "TRACK"}
                        </button>
                        <Link
                          to="/meme"
                          search={{ token: e.token.id }}
                          className="inline-block rounded-sm border border-border/60 px-2 py-1 text-[11px] tracking-[0.1em] text-foreground hover:border-cyan/60"
                        >
                          RESEARCH
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleIgnoreToken(e.token.id)}
                          className="rounded-sm border border-border/60 px-2 py-1 text-[11px] tracking-[0.1em] text-unknown hover:border-signal-mid/60"
                        >
                          {ignored.includes(e.token.id) ? "UN-IGNORE" : "IGNORE"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </TerminalShell>
  );
}
