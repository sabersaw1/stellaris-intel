import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { FRESHNESS_TONE, freshnessOf, freshnessDetail, type Freshness } from "@/lib/freshness";

/** LIVE / RECENT / DELAYED / STALE / HISTORICAL / UNAVAILABLE from real timestamps. */
export function FreshnessBadge({ observedAt, historical }: { observedAt: number | null | undefined; historical?: boolean }) {
  const f: Freshness = freshnessOf(observedAt, historical ? { historical: true } : {});
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em]", FRESHNESS_TONE[f])}
      title={freshnessDetail(observedAt)}
    >
      {f}
    </span>
  );
}

const PILL_TONE: Record<string, string> = {
  ok: "border-signal-low/50 text-signal-low",
  info: "border-cyan/45 text-cyan",
  warn: "border-signal-mid/50 text-signal-mid",
  bad: "border-signal-extreme/55 text-signal-extreme",
  muted: "border-border text-unknown",
  agent: "border-violet/45 text-violet",
};

export function StatePill({ label, tone = "muted", title }: { label: string; tone?: keyof typeof PILL_TONE; title?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-sm border bg-background/40 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em]", PILL_TONE[tone])}
      title={title}
    >
      {label}
    </span>
  );
}

/** Tone for any of the application's declared state strings. */
export function toneFor(state: string): keyof typeof PILL_TONE {
  if (/^(CONNECTED|OK|PASS|LIVE|COMPLETED|SUPPORTED|RESOLVED|MEASURED|ACTIVE)/.test(state)) return "ok";
  if (/(NOT CONFIGURED|WAITING|INSUFFICIENT|UNAVAILABLE|NOT AVAILABLE|UNSUPPORTED|NOT SCORED|UNRESOLVED|NOT APPLICABLE)/.test(state)) return "muted";
  if (/(FAIL|ERROR|SEVERE|INVALIDATED|BLOCKING|DISCONNECTED)/.test(state)) return "bad";
  if (/(WARN|DEGRADED|STALE|CONTESTED|PARTIAL|RATE LIMITED|NEAR LIMIT|WEAKENED)/.test(state)) return "warn";
  if (/(AGENT|DEBATING|MINORITY)/.test(state)) return "agent";
  return "info";
}

export function KV({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  const unavailable = typeof value === "string" && /UNAVAILABLE|INSUFFICIENT|WAITING|NOT AVAILABLE|UNSUPPORTED|NOT SCORED/.test(value);
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <span className="label-xs shrink-0">{label}</span>
      <span className={cn("min-w-0 truncate text-right text-xs", mono && "num", unavailable ? "text-unknown" : "text-foreground")} title={typeof value === "string" ? value : undefined}>
        {value}
      </span>
    </div>
  );
}

/** DATA SOURCE → RAW OBSERVATION → ANALYSIS → AGENT → EVIDENCE → CONCLUSION */
export function ProvenanceChain({ chain }: { chain: string[] }) {
  if (!chain.length) return <p className="text-xs text-unknown">PROVENANCE NOT RECORDED</p>;
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {chain.map((step, i) => (
        <li key={`${step}-${i}`} className="flex items-center gap-1.5">
          <span className="num rounded-sm border border-border bg-background/40 px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-foreground/80">{step}</span>
          {i < chain.length - 1 && <span className="text-unknown">→</span>}
        </li>
      ))}
    </ol>
  );
}

/** Wraps a section so it can fill the viewport. No layout is replaced, only expanded. */
export function Fullscreenable({ title, children }: { title: string; children: ReactNode }) {
  const [full, setFull] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={ref} className={cn(full && "fixed inset-0 z-40 overflow-auto bg-background/97 p-4 backdrop-blur-xl")}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label-xs">{title}</span>
        <button
          onClick={() => setFull((v) => !v)}
          className="num flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground transition-colors hover:border-cyan/50 hover:text-cyan"
        >
          {full ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {full ? "EXIT FULLSCREEN" : "FULLSCREEN"}
        </button>
      </div>
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  tone = "default",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "num rounded-sm border px-2.5 py-1.5 text-[10px] tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        tone === "primary"
          ? "border-cyan/50 text-cyan hover:bg-cyan/10"
          : tone === "danger"
            ? "border-signal-extreme/50 text-signal-extreme hover:bg-signal-extreme/10"
            : "border-border text-muted-foreground hover:border-cyan/50 hover:text-cyan",
      )}
    >
      {children}
    </button>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} className="label-xs py-2 pr-3 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-b border-border/40 py-2 pr-3 align-top text-xs", className)}>{children}</td>;
}
