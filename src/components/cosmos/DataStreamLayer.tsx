import { useMemo } from "react";

import type { PairObservation } from "@/lib/dex-types";

/**
 * VISUAL SYSTEM ACTIVITY layer.
 * Drifting fragments are drawn from real observations when they are available,
 * and from neutral system words otherwise. No numeric value here is invented:
 * if there is no live data, only system words appear.
 */
export function DataStreamLayer({ pairs }: { pairs: PairObservation[] }) {
  const fragments = useMemo(() => {
    const system = ["SCANNING", "ANALYZING", "DATA RECEIVED", "NORMALIZING", "BASELINE", "RISK UPDATE", "CHAIN", "DEX", "PAIR"];
    const live: string[] = [];
    for (const p of pairs.slice(0, 26)) {
      live.push(p.baseSymbol.toUpperCase());
      live.push(p.chainId.toUpperCase());
      if (p.liquidityUsd !== null) live.push(`LIQ ${Math.round(p.liquidityUsd / 1000)}K`);
      if (p.volume.h24 !== null) live.push(`VOL ${Math.round(p.volume.h24 / 1000)}K`);
      if (p.priceChange.h24 !== null) live.push(`${p.priceChange.h24 > 0 ? "+" : ""}${p.priceChange.h24.toFixed(2)}%`);
      const tx = p.txns.h24;
      if (tx) live.push(`TX ${(tx.buys + tx.sells).toLocaleString()}`);
    }
    const pool = live.length ? [...live, ...system] : system;
    return Array.from({ length: 22 }, (_, i) => ({
      text: pool[(i * 7 + 3) % pool.length]!,
      left: (i * 4.6 + (i % 3) * 2.2) % 98,
      duration: 26 + ((i * 5) % 22),
      delay: -(i * 2.3),
      opacity: 0.1 + ((i % 4) * 0.045),
    }));
  }, [pairs]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[9] overflow-hidden">
      {fragments.map((f, i) => (
        <span
          key={i}
          className="num anim-drift absolute bottom-0 whitespace-nowrap text-[10px] tracking-[0.22em] text-cyan"
          style={{
            left: `${f.left}%`,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            opacity: f.opacity,
          }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}
