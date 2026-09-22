import type { ReactNode } from "react";
import { AlertTriangle, Database, Bot, Sparkles, Activity } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RiskBand, Severity } from "@/lib/dex-types";
import { clockOf } from "@/lib/format";

/* ------------------------------ containers ---------------------------- */

export function Panel({
  title,
  right,
  children,
  className,
  tone = "default",
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "strong";
}) {
  return (
    <section className={cn("panel anim-in p-4", tone === "strong" && "bg-surface-strong", className)}>
      {(title || right) && (
        <header className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          {title ? <h2 className="label-xs min-w-0 break-words text-foreground/80">{title}</h2> : <span />}
          {right ? <div className="min-w-0 shrink-0">{right}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold tracking-wide text-foreground sm:text-2xl">{children}</h1>
      {sub && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ------------------------------ data tags ----------------------------- */

export type Provenance = "LIVE" | "CALCULATED" | "AGENT" | "VISUAL" | "STORED";

const provenanceStyles: Record<Provenance, string> = {
  LIVE: "border-cyan/40 text-cyan",
  CALCULATED: "border-electric/40 text-electric",
  AGENT: "border-violet/45 text-violet",
  VISUAL: "border-border text-muted-foreground",
  // read from the operator's Supabase project
  STORED: "border-signal-low/50 text-signal-low",
};

const provenanceIcon: Record<Provenance, typeof Database> = {
  LIVE: Database,
  CALCULATED: Activity,
  AGENT: Bot,
  STORED: Database,
  VISUAL: Sparkles,
};

export function Tag({ kind, label }: { kind: Provenance; label?: string }) {
  const Icon = provenanceIcon[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border bg-background/40 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase",
        provenanceStyles[kind],
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {label ?? kind}
    </span>
  );
}

/* ------------------------------- metrics ------------------------------ */

export function Metric({
  label,
  value,
  kind = "LIVE",
  hint,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  kind?: Provenance;
  hint?: string;
  emphasis?: boolean;
}) {
  const unavailable = typeof value === "string" && /UNAVAILABLE|INSUFFICIENT|WAITING/.test(value);
  return (
    <div className="min-w-0">
      {/* The label may wrap; the provenance tag never shrinks. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="label-xs min-w-0 break-words">{label}</span>
        <span className="shrink-0">
          <Tag kind={kind} />
        </span>
      </div>
      <div
        className={cn(
          "num mt-1 truncate",
          emphasis ? "text-2xl" : "text-base",
          unavailable ? "text-unknown text-xs tracking-wide" : "text-foreground",
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="num text-unknown">—</span>;
  return (
    <span className={cn("num", value > 0 ? "text-signal-low" : value < 0 ? "text-signal-extreme" : "text-muted-foreground")}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

/* ------------------------------- badges ------------------------------- */

const severityStyle: Record<Severity, string> = {
  NORMAL: "border-border text-muted-foreground",
  NOTABLE: "border-signal-mid/50 text-signal-mid",
  UNUSUAL: "border-signal-high/50 text-signal-high",
  SEVERE: "border-signal-extreme/60 text-signal-extreme",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cn("rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em]", severityStyle[severity])}>
      {severity}
    </span>
  );
}

const riskStyle: Record<RiskBand, string> = {
  "LOWER OBSERVED RISK": "border-signal-low/50 text-signal-low",
  "MODERATE OBSERVED RISK": "border-signal-mid/50 text-signal-mid",
  "HIGH OBSERVED RISK": "border-signal-high/55 text-signal-high",
  "EXTREME OBSERVED RISK": "border-signal-extreme/60 text-signal-extreme",
  "INSUFFICIENT DATA": "border-border text-unknown",
};

export function RiskBadge({ band, score }: { band: RiskBand; score?: number | null }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em]", riskStyle[band])}>
      {band}
      {score !== null && score !== undefined && <span className="num text-foreground/90">{score}</span>}
    </span>
  );
}

export function ConfidenceBadge({ score, band }: { score: number; band: "LOW" | "MODERATE" | "HIGH" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em]",
        band === "HIGH" ? "border-cyan/45 text-cyan" : band === "MODERATE" ? "border-signal-mid/45 text-signal-mid" : "border-border text-unknown",
      )}
    >
      CONFIDENCE {band}
      <span className="num text-foreground/90">{score}</span>
    </span>
  );
}

/* ------------------------- states & provenance ------------------------ */

export function DataState({
  state,
  detail,
}: {
  state: "WAITING FOR DATA" | "DATA UNAVAILABLE" | "INSUFFICIENT DATA" | "STALE DATA";
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-background/40 px-3 py-3">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-mid" />
      <div>
        <p className="num text-xs tracking-[0.14em] text-signal-mid">{state}</p>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background/30 px-4 py-8 text-center">
      <p className="num text-xs tracking-[0.16em] text-foreground/80">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">{hint}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function SourceLine({
  observedAt,
  calculatedAt,
  engineVersion,
  cached,
  stale,
}: {
  observedAt: number | null;
  calculatedAt?: number | null | undefined;
  engineVersion?: string | undefined;
  cached?: boolean | undefined;
  stale?: boolean | undefined;
}) {
  return (
    <p className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-[0.1em] text-muted-foreground">
      <span>SOURCE DEX SCREENER</span>
      <span>OBSERVED {clockOf(observedAt)}</span>
      {calculatedAt ? <span>CALCULATED {clockOf(calculatedAt)}</span> : null}
      {engineVersion ? <span className="uppercase">{engineVersion}</span> : null}
      {cached ? <span className="text-electric">CACHE HIT</span> : null}
      {stale ? <span className="text-signal-mid">STALE DATA</span> : null}
    </p>
  );
}

export function Bar({ value, max, tone = "cyan" }: { value: number; max: number; tone?: "cyan" | "violet" | "warn" }) {
  const w = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", tone === "cyan" ? "bg-cyan" : tone === "violet" ? "bg-violet" : "bg-signal-high")}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}
