import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { Assessment } from "@/lib/dex-types";
import { count, usd } from "@/lib/format";

type Level = "MARKET" | "CHAIN" | "DEX";

/**
 * Cosmic market map. Node positions are layout only (VISUAL); node size and
 * labels are driven by real observed liquidity/volume.
 */
export function MarketMap({ rows }: { rows: Assessment[] }) {
  const [level, setLevel] = useState<Level>("MARKET");
  const [chain, setChain] = useState<string | null>(null);
  const [dex, setDex] = useState<string | null>(null);

  const scoped = useMemo(
    () => rows.filter((r) => (chain ? r.pair.chainId === chain : true) && (dex ? r.pair.dexId === dex : true)),
    [rows, chain, dex],
  );

  const nodes = useMemo(() => {
    const map = new Map<string, { label: string; liquidity: number; volume: number; pairs: number; row?: Assessment | undefined }>();
    for (const r of scoped) {
      const key = level === "MARKET" ? r.pair.chainId : level === "CHAIN" ? r.pair.dexId : r.pair.key;
      const e = map.get(key) ?? {
        label: level === "DEX" ? `${r.pair.baseSymbol}/${r.pair.quoteSymbol}` : key,
        liquidity: 0,
        volume: 0,
        pairs: 0,
        row: level === "DEX" ? r : undefined,
      };
      e.liquidity += r.pair.liquidityUsd ?? 0;
      e.volume += r.pair.volume.h24 ?? 0;
      e.pairs += 1;
      map.set(key, e);
    }
    return [...map.entries()].sort((a, b) => b[1].liquidity - a[1].liquidity).slice(0, 28);
  }, [scoped, level]);

  const maxLiq = Math.max(...nodes.map((n) => n[1].liquidity), 1);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="num text-[10px] tracking-[0.16em] text-muted-foreground">
          MARKET
          {chain ? ` → ${chain.toUpperCase()}` : ""}
          {dex ? ` → ${dex.toUpperCase()}` : ""}
        </span>
        {(chain || dex) && (
          <button
            onClick={() => {
              if (dex) {
                setDex(null);
                setLevel("CHAIN");
              } else {
                setChain(null);
                setLevel("MARKET");
              }
            }}
            className="num rounded-sm border border-border px-2 py-0.5 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
          >
            ZOOM OUT
          </button>
        )}
      </div>

      <div className="relative h-[420px] overflow-hidden rounded-md border border-border bg-background/40">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: "radial-gradient(circle at 50% 50%, oklch(0.35 0.1 268 / 0.35), transparent 70%)" }}
        />
        {nodes.map(([key, n], i) => {
          const angle = (i / nodes.length) * Math.PI * 2;
          const radius = 34 + (i % 3) * 8;
          const x = 50 + Math.cos(angle) * radius;
          const y = 50 + Math.sin(angle) * radius * 0.72;
          const size = 18 + (n.liquidity / maxLiq) * 44;
          const content = (
            <>
              <span
                className="absolute inset-0 rounded-full border border-cyan/40 bg-cyan/10"
                style={{ boxShadow: "0 0 24px -6px oklch(0.82 0.13 205 / 0.6)" }}
              />
              <span className="num absolute left-1/2 top-full mt-1 w-32 -translate-x-1/2 text-center text-[9px] uppercase tracking-[0.12em] text-foreground/85">
                {n.label}
              </span>
              <span className="num absolute left-1/2 top-full mt-4 w-32 -translate-x-1/2 text-center text-[9px] text-unknown">
                {usd(n.liquidity)} · {count(n.pairs)}
              </span>
            </>
          );
          const style = { left: `${x}%`, top: `${y}%`, width: size, height: size, transform: "translate(-50%,-50%)" };
          if (level === "DEX" && n.row) {
            return (
              <Link
                key={key}
                to="/pair/$chainId/$pairId"
                params={{ chainId: n.row.pair.chainId, pairId: n.row.pair.pairAddress }}
                className="absolute cursor-pointer"
                style={style}
              >
                {content}
              </Link>
            );
          }
          return (
            <button
              key={key}
              className={cn("absolute")}
              style={style}
              onClick={() => {
                if (level === "MARKET") {
                  setChain(key);
                  setLevel("CHAIN");
                } else if (level === "CHAIN") {
                  setDex(key);
                  setLevel("DEX");
                }
              }}
            >
              {content}
            </button>
          );
        })}
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet/40 bg-violet/10 anim-spin-slow" />
      </div>
      <p className="label-xs mt-2">
        node size = observed liquidity · click a node to zoom: market → chain → dex → pair
      </p>
    </div>
  );
}
