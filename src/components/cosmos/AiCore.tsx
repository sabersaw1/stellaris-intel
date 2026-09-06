import { useIsFetching } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { Tag } from "@/components/kit";

const PIPELINE = ["SCANNING", "NORMALIZING", "ANALYZING", "COMPARING", "DETECTING", "ASSESSING", "UPDATING"] as const;

/**
 * Central AI CORE visualisation.
 * The rings/particles are VISUAL SYSTEM ACTIVITY, but every status label below
 * is derived from actual in-flight server work (React Query fetch counts).
 */
export function AiCore({ size = 260 }: { size?: number }) {
  const fetchingMarket = useIsFetching({ queryKey: ["market"] });
  const fetchingPair = useIsFetching({ queryKey: ["pair"] });
  const fetchingAny = useIsFetching();

  const busy = fetchingAny > 0;
  const stage = fetchingMarket > 0 ? "SCANNING" : fetchingPair > 0 ? "ANALYZING" : busy ? "UPDATING" : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full opacity-70 blur-2xl"
          style={{ background: "radial-gradient(circle, oklch(0.6 0.16 250 / 0.55), transparent 66%)" }}
        />
        <div className={cn("absolute inset-2 rounded-full border border-cyan/25", busy && "anim-spin-slow")}>
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-cyan" />
        </div>
        <div className={cn("absolute inset-8 rounded-full border border-violet/30", busy && "anim-spin-rev")}>
          <span className="absolute top-1/2 -right-1 h-1.5 w-1.5 rounded-full bg-violet" />
        </div>
        <div className={cn("absolute inset-14 rounded-full border border-electric/25 border-dashed", busy && "anim-spin-slow")} />
        {busy && <div className="absolute inset-6 rounded-full border border-cyan/25 anim-pulse-ring" />}
        <div className="absolute inset-[38%] rounded-full bg-surface-strong shadow-[0_0_50px_-8px_oklch(0.72_0.15_250/0.8)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="num text-[10px] tracking-[0.2em] text-cyan glow-cyan">{busy ? "ACTIVE" : "IDLE"}</span>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        {PIPELINE.map((s) => {
          const active = stage === s;
          return (
            <span
              key={s}
              className={cn(
                "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]",
                active ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-border text-unknown",
              )}
            >
              {s}
            </span>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className={cn("num text-xs tracking-[0.2em]", busy ? "text-cyan" : "text-signal-low")}>
          {busy ? `${stage ?? "PROCESSING"} · ${fetchingAny} TASK${fetchingAny === 1 ? "" : "S"}` : "SYSTEM READY"}
        </span>
        <Tag kind="AGENT" label="ENGINE STATE" />
      </div>
    </div>
  );
}
