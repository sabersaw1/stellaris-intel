import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Severity, Assessment } from "@/lib/dex-types";
import { ageFrom, count, price, usd } from "@/lib/format";
import { ConfidenceBadge, Delta, EmptyState, RiskBadge, SeverityBadge } from "@/components/kit";
import { isWatched, toggleWatch } from "@/lib/local-store";

type SortKey = "symbol" | "price" | "m5" | "h1" | "h6" | "h24" | "liq" | "vol" | "txns" | "age" | "risk" | "confidence" | "anomalies";

const PAGE = 25;

export function PairTable({ rows, dense = false }: { rows: Assessment[]; dense?: boolean }) {
  const [sort, setSort] = useState<SortKey>("vol");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [, force] = useState(0);

  const sorted = useMemo(() => {
    const val = (a: Assessment): number | string => {
      switch (sort) {
        case "symbol":
          return a.pair.baseSymbol;
        case "price":
          return a.pair.priceUsd ?? -1;
        case "m5":
          return a.pair.priceChange.m5 ?? -999;
        case "h1":
          return a.pair.priceChange.h1 ?? -999;
        case "h6":
          return a.pair.priceChange.h6 ?? -999;
        case "h24":
          return a.pair.priceChange.h24 ?? -999;
        case "liq":
          return a.pair.liquidityUsd ?? -1;
        case "vol":
          return a.pair.volume.h24 ?? -1;
        case "txns":
          return a.calculated.txns24h ?? -1;
        case "age":
          return a.pair.pairCreatedAt ?? 0;
        case "risk":
          return a.risk.score ?? -1;
        case "confidence":
          return a.confidence.score;
        case "anomalies":
          return a.anomalies.length;
      }
    };
    return [...rows].sort((x, y) => {
      const a = val(x);
      const b = val(y);
      const cmp = typeof a === "string" ? a.localeCompare(b as string) : (a as number) - (b as number);
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, dir]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const view = sorted.slice(page * PAGE, page * PAGE + PAGE);

  if (!rows.length) {
    return <EmptyState title="NO MATCHING OBSERVATIONS" hint="Adjust the filters or run a discovery search to load observations from the data source." />;
  }

  const head = (key: SortKey, label: string, className?: string) => (
    <th
      className={cn("cursor-pointer select-none whitespace-nowrap px-2 py-2 text-left label-xs hover:text-cyan", className)}
      onClick={() => {
        if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
        else {
          setSort(key);
          setDir("desc");
        }
      }}
    >
      {label}
      {sort === key && <span className="ml-1 text-cyan">{dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="border-b border-border">
            <tr>
              <th className="px-2 py-2" />
              {head("symbol", "TOKEN")}
              <th className="px-2 py-2 text-left label-xs">CHAIN / DEX</th>
              {head("price", "PRICE")}
              {head("m5", "5M")}
              {head("h1", "1H")}
              {head("h6", "6H")}
              {head("h24", "24H")}
              {head("liq", "LIQUIDITY")}
              {head("vol", "VOL 24H")}
              {head("txns", "TXNS")}
              {head("age", "PAIR AGE")}
              {head("risk", "RISK")}
              {head("confidence", "CONFIDENCE")}
              {head("anomalies", "ANOM")}
            </tr>
          </thead>
          <tbody>
            {view.map((a) => {
              const watched = isWatched(a.pair.key);
              return (
                <tr key={a.pair.key} className={cn("border-b border-border/40 hover:bg-accent/40", dense ? "text-[11px]" : "text-xs")}>
                  <td className="px-2 py-2">
                    <button
                      aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
                      onClick={() => {
                        toggleWatch(a.pair);
                        force((n) => n + 1);
                      }}
                    >
                      <Star className={cn("h-3.5 w-3.5", watched ? "fill-cyan text-cyan" : "text-unknown hover:text-cyan")} />
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      to="/pair/$chainId/$pairId"
                      params={{ chainId: a.pair.chainId, pairId: a.pair.pairAddress }}
                      className="num font-medium text-foreground hover:text-cyan"
                    >
                      {a.pair.baseSymbol}
                      <span className="text-unknown">/{a.pair.quoteSymbol}</span>
                    </Link>
                  </td>
                  <td className="num px-2 py-2 text-muted-foreground">
                    {a.pair.chainId} · {a.pair.dexId}
                  </td>
                  <td className="num px-2 py-2">{price(a.pair.priceUsd)}</td>
                  <td className="px-2 py-2"><Delta value={a.pair.priceChange.m5} /></td>
                  <td className="px-2 py-2"><Delta value={a.pair.priceChange.h1} /></td>
                  <td className="px-2 py-2"><Delta value={a.pair.priceChange.h6} /></td>
                  <td className="px-2 py-2"><Delta value={a.pair.priceChange.h24} /></td>
                  <td className="num px-2 py-2">{usd(a.pair.liquidityUsd)}</td>
                  <td className="num px-2 py-2">{usd(a.pair.volume.h24)}</td>
                  <td className="num px-2 py-2">{count(a.calculated.txns24h)}</td>
                  <td className="num px-2 py-2 text-muted-foreground">{ageFrom(a.pair.pairCreatedAt)}</td>
                  <td className="px-2 py-2">
                    <RiskBadge band={a.risk.band} score={a.risk.score} />
                  </td>
                  <td className="px-2 py-2">
                    <ConfidenceBadge score={a.confidence.score} band={a.confidence.band} />
                  </td>
                  <td className="px-2 py-2">
                    {a.anomalies.length ? (
                      <SeverityBadge severity={a.anomalies.reduce<Severity>((w, x) => (rank(x.severity) > rank(w) ? x.severity : w), "NOTABLE")} />
                    ) : (
                      <span className="num text-unknown">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="label-xs">
          {sorted.length.toLocaleString()} observations · page {page + 1} / {pages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="num rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground disabled:opacity-40 hover:border-cyan/50 hover:text-cyan"
          >
            PREV
          </button>
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="num rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground disabled:opacity-40 hover:border-cyan/50 hover:text-cyan"
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
}

function rank(s: string) {
  return s === "SEVERE" ? 3 : s === "UNUSUAL" ? 2 : s === "NOTABLE" ? 1 : 0;
}
