/**
 * Mobile-first building blocks shared by the redesigned STELLARIS surfaces.
 *
 * Rules baked in here:
 *  - every container is min-w-0 so nothing can force sideways scrolling
 *  - stacked cards on phones, grids only from sm: upward
 *  - touch targets are at least 40px tall
 *  - a value that was never observed renders as an explicit unknown, never 0
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatePill } from "@/components/kit2";

export function SurfaceHead({
  eyebrow,
  title,
  blurb,
  right,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  right?: ReactNode;
}) {
  return (
    <header className="anim-in mb-4 min-w-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="num text-[10px] tracking-[0.24em] text-cyan">{eyebrow}</p>
          <h1 className="display mt-1 truncate text-lg tracking-[0.12em] text-foreground sm:text-2xl">{title}</h1>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">{blurb}</p>
    </header>
  );
}

export function StatStrip({ items }: { items: { label: string; value: string; tone?: "ok" | "warn" | "bad" | "info" | "muted" }[] }) {
  return (
    <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="panel min-w-0 px-3 py-2.5">
          <p className="label-xs truncate">{i.label}</p>
          <p
            className={cn(
              "num mt-1 truncate text-base",
              i.tone === "ok"
                ? "text-signal-low"
                : i.tone === "warn"
                  ? "text-signal-mid"
                  : i.tone === "bad"
                    ? "text-signal-extreme"
                    : i.tone === "info"
                      ? "text-cyan"
                      : "text-foreground",
            )}
          >
            {i.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/** A stacked, tappable record card — the mobile primitive replacing wide tables. */
export function RowCard({
  title,
  subtitle,
  pills,
  facts,
  footer,
  onClick,
}: {
  title: string;
  subtitle?: string | null;
  pills?: ReactNode;
  facts: { label: string; value: string }[];
  footer?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <article
      onClick={onClick}
      className={cn(
        "panel anim-in min-w-0 p-3",
        onClick && "cursor-pointer transition-colors hover:border-cyan/40",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <h3 className="num truncate text-sm tracking-[0.08em] text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {pills ? <div className="flex shrink-0 flex-wrap justify-end gap-1">{pills}</div> : null}
      </div>
      {facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="label-xs truncate">{f.label}</dt>
              <dd className="num mt-0.5 truncate text-xs text-foreground/90">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {footer ? <div className="mt-3 border-t border-border/50 pt-2">{footer}</div> : null}
    </article>
  );
}

/** Truthful credential requirements for a surface. Never claims a connection. */
export function NeedsPanel({
  persistence,
  needs,
  note,
}: {
  persistence: boolean;
  needs: { credential: string; present: boolean; unlocks: string }[];
  note: string | null;
}) {
  return (
    <div className="panel min-w-0 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="label-xs">DATA SOURCES FOR THIS SCREEN</span>
        <StatePill label={persistence ? "SUPABASE CONNECTED" : "SUPABASE NOT CONFIGURED"} tone={persistence ? "ok" : "bad"} />
      </div>
      {note ? <p className="mb-2 text-xs text-signal-mid">{note}</p> : null}
      {needs.length === 0 ? (
        <p className="text-xs text-muted-foreground">This screen reads stored data only — no external credential is required.</p>
      ) : (
        <ul className="space-y-2">
          {needs.map((n) => (
            <li key={n.credential} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <div className="min-w-0">
                <p className="num truncate text-[11px] text-foreground/90">{n.credential}</p>
                <p className="text-[11px] text-muted-foreground">{n.unlocks}</p>
              </div>
              <StatePill label={n.present ? "CONFIGURED" : "NOT CONFIGURED"} tone={n.present ? "ok" : "muted"} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Stack({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-3">{children}</div>;
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background/30 px-4 py-8 text-center">
      <p className="num text-[11px] tracking-[0.16em] text-foreground/80">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

export const when = (iso: string | null): string => {
  if (!iso) return "NOT OBSERVED";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "NOT OBSERVED";
  return new Date(t).toISOString().replace("T", " ").slice(0, 16) + "Z";
};

export const num = (v: number | null, prefix = ""): string => (v === null || !Number.isFinite(v) ? "UNKNOWN" : `${prefix}${v}`);
