import { cn } from "@/lib/utils";
import type { AgentObservation } from "@/lib/dex-types";

/**
 * Agent flow diagram. Node labels/statuses are real execution state; the
 * animated flow only runs while work is actually in flight.
 */
export function AgentNetwork({ agents, busy }: { agents: AgentObservation[]; busy: boolean }) {
  const byId = (id: string) => agents.find((a) => a.agentId === id);
  const layout: { id: string; x: number; y: number }[] = [
    { id: "market-structure", x: 50, y: 8 },
    { id: "liquidity", x: 14, y: 34 },
    { id: "activity", x: 86, y: 34 },
    { id: "volatility", x: 14, y: 66 },
    { id: "anomaly", x: 86, y: 66 },
    { id: "data-quality", x: 50, y: 88 },
    { id: "promotional", x: 26, y: 88 },
    { id: "risk-synthesis", x: 74, y: 88 },
  ];

  return (
    <div className="relative h-[420px] overflow-hidden rounded-md border border-border bg-background/40">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {layout.map((n) => (
          <line
            key={n.id}
            x1={n.x}
            y1={n.y}
            x2={50}
            y2={50}
            stroke="oklch(0.72 0.15 250 / 0.28)"
            strokeWidth={0.25}
            strokeDasharray={busy ? "1.5 1.5" : undefined}
          />
        ))}
      </svg>

      <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan/40 bg-cyan/5">
        <span className="num text-[9px] tracking-[0.16em] text-cyan">AI CORE</span>
        {busy && <span className="absolute inset-0 rounded-full border border-cyan/40 anim-pulse-ring" />}
      </div>

      {layout.map((n) => {
        const a = byId(n.id);
        const status = busy ? "PROCESSING" : (a?.status ?? "WAITING");
        return (
          <div key={n.id} className="absolute w-24 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
            <div
              className={cn(
                "mx-auto flex h-9 w-9 items-center justify-center rounded-full border",
                status === "PROCESSING" ? "border-cyan/70 bg-cyan/10" : status === "ERROR" ? "border-signal-extreme/60" : "border-border bg-surface",
              )}
            >
              <span className="num text-[9px] text-foreground/80">{a?.agentNumber ?? "--"}</span>
            </div>
            <p className="num mt-1 text-[8px] leading-tight tracking-[0.06em] text-foreground/80">{a?.name ?? "OFFLINE"}</p>
            <p
              className={cn(
                "num text-[9px] tracking-[0.12em]",
                status === "PROCESSING" ? "text-cyan" : status === "ONLINE" ? "text-signal-low" : "text-unknown",
              )}
            >
              {status}
            </p>
          </div>
        );
      })}
    </div>
  );
}
