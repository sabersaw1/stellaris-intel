/**
 * Panels that surface the Stellaris meme pipeline (Supabase) inside the
 * existing Alerts and Watchlist surfaces.
 *
 * Everything shown here is stored data: an alert exists because a value
 * actually changed past its threshold, and each one states WHY and WHAT WOULD
 * CHANGE IT. Nothing here is a trading instruction.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Panel } from "@/components/kit";
import { KV, StatePill } from "@/components/kit2";
import { listMemeAlerts, listMemeTokens } from "@/lib/meme.functions";
import { getWatchedTokens, subscribeStore, toggleWatchToken } from "@/lib/local-store";
import { usd } from "@/lib/format";

function DossierLink({ tokenId }: { tokenId: string }) {
  return (
    <Link
      to="/meme"
      search={{ token: tokenId }}
      className="inline-block rounded-sm border border-border/60 px-2 py-1 text-[11px] tracking-[0.1em] text-cyan hover:border-cyan/60"
    >
      OPEN DOSSIER
    </Link>
  );
}

export function PipelineAlertsPanel() {
  const alerts = useQuery({ queryKey: ["meme", "alerts"], queryFn: () => listMemeAlerts(), refetchInterval: 30_000 });
  const tokens = useQuery({ queryKey: ["meme", "tokens"], queryFn: () => listMemeTokens(), refetchInterval: 30_000 });
  const rows = alerts.data?.rows ?? [];
  const symbolOf = (id: string | null) =>
    (tokens.data?.rows ?? []).find((t) => t.id === id)?.symbol ?? null;

  return (
    <Panel
      title="MEME PIPELINE ALERTS — SUPABASE (YOUR PROJECT)"
      right={<StatePill label={`${rows.length}`} tone={rows.length ? "warn" : "muted"} />}
    >
      <p className="mb-2 text-[11px] leading-relaxed text-unknown">
        Raised by the collection cycle when a stored value changed past its threshold. Repeat alerts for the same
        condition are suppressed during their cooldown.
      </p>
      {alerts.data?.note ? <p className="mb-2 text-xs text-signal-mid">{alerts.data.note}</p> : null}
      {rows.length === 0 ? (
        <p className="text-xs text-unknown">NO PIPELINE ALERT RAISED YET</p>
      ) : (
        <div className="grid gap-2">
          {rows.slice(0, 20).map((a) => (
            <div key={a.id} className="min-w-0 rounded-sm border border-border/60 bg-background/30 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="num truncate text-xs tracking-[0.1em] text-foreground">
                  {a.title} {symbolOf(a.tokenId) ? <span className="text-unknown">${symbolOf(a.tokenId)}</span> : null}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <StatePill label={a.category} tone="muted" />
                  <StatePill label={a.severity} tone={a.severity === "CRITICAL" ? "warn" : "info"} />
                </div>
              </div>
              <p className="mt-1 text-[11px] tracking-[0.12em] text-unknown">WHY</p>
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {(a.why ?? []).length ? (
                  a.why.map((w, i) => <li key={i}>• {w}</li>)
                ) : (
                  <li className="text-unknown">• no reason was recorded with this alert</li>
                )}
              </ul>
              <p className="mt-1 text-[11px] tracking-[0.12em] text-unknown">WHAT WOULD CHANGE IT</p>
              <p className="text-[11px] text-muted-foreground">
                A later observation showing the measure recovering, or a second independent source contradicting this
                reading, would change it.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <KV label="RAISED" value={a.createdAt ?? "UNKNOWN"} />
                <StatePill label={a.acknowledgedAt ? "ACKNOWLEDGED" : "UNACKNOWLEDGED"} tone={a.acknowledgedAt ? "muted" : "info"} />
                {a.tokenId ? <DossierLink tokenId={a.tokenId} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function TrackedMemeTokensPanel() {
  const tokens = useQuery({ queryKey: ["meme", "tokens"], queryFn: () => listMemeTokens(), refetchInterval: 15_000 });
  const [watched, setWatched] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setWatched(getWatchedTokens().map((w) => w.tokenId));
    sync();
    return subscribeStore(sync);
  }, []);

  const rows = (tokens.data?.rows ?? []).filter((t) => watched.includes(t.id));

  return (
    <Panel
      title="TRACKED MEME TOKENS"
      right={<StatePill label={`${rows.length}`} tone={rows.length ? "ok" : "muted"} />}
    >
      <p className="mb-2 text-[11px] leading-relaxed text-unknown">
        Tokens you chose to track on RADAR. The selection is kept in this browser; the readings below come from your
        Supabase project.
      </p>
      {watched.length === 0 ? (
        <p className="text-xs text-unknown">NOTHING TRACKED YET — USE “TRACK” ON A RADAR CARD</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-unknown">TRACKED TOKENS ARE NOT IN THE CURRENT STORED SET</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((t) => (
            <div key={t.id} className="min-w-0 rounded-sm border border-border/60 bg-background/30 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="num truncate text-xs tracking-[0.1em] text-foreground">
                  ${t.symbol ?? "UNKNOWN"} <span className="text-unknown">{t.chainId}</span>
                </span>
                <StatePill label={t.verdict === "MEME" ? "MEME" : "UNKNOWN"} tone={t.verdict === "MEME" ? "ok" : "muted"} />
              </div>
              <div className="mt-1 grid gap-0.5">
                <KV label="LIQUIDITY" value={t.liquidityUsd === null ? "UNAVAILABLE" : usd(t.liquidityUsd)} />
                <KV label="24H VOLUME" value={t.volume24hUsd === null ? "UNAVAILABLE" : usd(t.volume24hUsd)} />
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <DossierLink tokenId={t.id} />
                <button
                  type="button"
                  onClick={() => toggleWatchToken({ tokenId: t.id, symbol: t.symbol, chainId: t.chainId })}
                  className="rounded-sm border border-border/60 px-2 py-1 text-[11px] tracking-[0.1em] text-foreground hover:border-cyan/60"
                >
                  STOP TRACKING
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
