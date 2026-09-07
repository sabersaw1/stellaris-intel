/**
 * INVESTIGATION WORKSPACE
 *
 * Three information levels in one panel:
 *  LEVEL 1  current assessment, WHY, what changed, what is next
 *  LEVEL 2  evidence layers, source agreement, challenger, historical comparison
 *  LEVEL 3  per-item technical detail behind each layer
 */

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";

import { ConfidenceBadge, Panel, RiskBadge, SeverityBadge, Tag } from "@/components/kit";
import { cn } from "@/lib/utils";
import { toggleWatch } from "@/lib/local-store";
import type { EvidenceGrade, Investigation } from "@/lib/stellaris";
import { STATE_TONE } from "@/lib/stellaris";
import { upsertJob } from "@/lib/jobs";

const GRADE_TONE: Record<EvidenceGrade, string> = {
  VERIFIED: "text-signal-low",
  OBSERVED: "text-cyan",
  INFERRED: "text-violet",
  UNKNOWN: "text-unknown",
  CONFLICTING: "text-signal-high",
  "INSUFFICIENT DATA": "text-unknown",
};

export function StateBadge({ state }: { state: Investigation["state"] }) {
  return (
    <span className={cn("num rounded-sm border border-border px-1.5 py-0.5 text-[9px] tracking-[0.14em]", STATE_TONE[state])}>{state}</span>
  );
}

export function InvestigationPanel({ inv }: { inv: Investigation }) {
  const [openLayer, setOpenLayer] = useState<string | null>("MARKET");
  const [watched, setWatched] = useState(inv.watched);

  return (
    <div className="space-y-4">
      {/* LEVEL 1 */}
      <Panel
        title={`INVESTIGATION — ${inv.label}`}
        right={
          <div className="flex items-center gap-2">
            <StateBadge state={inv.state} />
            {inv.dataDegraded && <span className="num text-[9px] tracking-[0.14em] text-signal-mid">STELLARIS DATA DEGRADED</span>}
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-foreground">{inv.summary}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RiskBadge band={inv.assessment.risk.band} score={inv.assessment.risk.score} />
          <ConfidenceBadge score={inv.assessment.confidence.score} band={inv.assessment.confidence.band} />
          <Chip label="EVIDENCE QUALITY" value={inv.evidenceQuality} />
          <Chip label="SOURCE AGREEMENT" value={inv.sourceAgreement} />
          <Chip label="PRIORITY" value={inv.priority === null ? "INSUFFICIENT DATA" : `${inv.priority}/100`} />
          <Chip label="OBSERVATIONS" value={String(inv.historyPoints)} />
        </div>
        <p className="num mt-2 text-[10px] leading-relaxed tracking-[0.1em] text-unknown">{inv.sourceAgreementBasis}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Block title="WHY">
            <ul className="space-y-1">
              {inv.why.map((w) => (
                <li key={w} className="text-[11px] leading-snug text-muted-foreground">
                  · {w}
                </li>
              ))}
            </ul>
          </Block>
          <Block title="WHAT CHANGED / WHAT IS NEXT">
            <p className="text-[11px] leading-snug text-muted-foreground">{inv.changed ?? "No meaningful change detected between recorded observations."}</p>
            <p className="mt-2 text-[11px] leading-snug text-cyan">{inv.investigatingNext}</p>
          </Block>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/pair/$chainId/$pairId"
            params={{ chainId: inv.chainId, pairId: inv.pairAddress }}
            className="num rounded-sm border border-border px-2.5 py-1.5 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
          >
            ADVANCED DETAIL
          </Link>
          <button
            onClick={() => setWatched(toggleWatch(inv.assessment.pair))}
            className={cn(
              "num flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[10px] tracking-[0.14em]",
              watched ? "border-cyan/50 text-cyan" : "border-border text-muted-foreground hover:border-cyan/50 hover:text-cyan",
            )}
          >
            <Star className={cn("h-3 w-3", watched && "fill-current")} /> {watched ? "WATCHED" : "WATCH"}
          </button>
          <button
            onClick={() => upsertJob(inv.attention, "USER", "Investigation requested from the investigation workspace")}
            className="num rounded-sm border border-border px-2.5 py-1.5 text-[10px] tracking-[0.14em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
          >
            INVESTIGATE
          </button>
        </div>
      </Panel>

      {/* KNOWN / UNKNOWN / CONFLICTING / NEXT QUESTION */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="KNOWN" right={<Tag kind="LIVE" />}>
          <List items={inv.known} empty="Nothing has been established from the current observation." />
        </Panel>
        <Panel title="UNKNOWN" right={<Tag kind="CALCULATED" label="OPEN" />}>
          <List items={inv.unknown} empty="No open unknowns recorded." tone="text-unknown" />
        </Panel>
        <Panel title="CONFLICTING">
          <List items={inv.conflicting} empty="No disagreement recorded between the available readings." tone="text-signal-high" />
        </Panel>
        <Panel title="NEXT QUESTION">
          <p className="text-xs leading-relaxed text-cyan">{inv.nextQuestion}</p>
        </Panel>
      </div>

      {/* LEVEL 2 — EVIDENCE LAYERS */}
      <Panel title="EVIDENCE LAYERS" right={<Tag kind="AGENT" />}>
        <div className="space-y-2">
          {inv.layers.map((layer) => {
            const open = openLayer === layer.id;
            return (
              <div key={layer.id} className="rounded-sm border border-border/60">
                <button
                  onClick={() => setOpenLayer(open ? null : layer.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                >
                  <span className="flex items-center gap-2">
                    {open ? <ChevronDown className="h-3 w-3 text-cyan" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    <span className="num text-[11px] tracking-[0.14em] text-foreground">{layer.title}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {layer.requires && <span className="num text-[9px] tracking-[0.12em] text-unknown">REQUIRES {layer.requires}</span>}
                    <span className={cn("num text-[9px] tracking-[0.14em]", GRADE_TONE[layer.grade])}>{layer.grade}</span>
                  </span>
                </button>
                {open && (
                  <ul className="space-y-2 border-t border-border/60 px-3 py-2">
                    {layer.items.map((it) => (
                      <li key={it.label} className="grid gap-0.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="label-xs">{it.label}</span>
                          <span className={cn("num text-[11px]", GRADE_TONE[it.grade])}>{it.value}</span>
                        </div>
                        <span className="num text-[9px] tracking-[0.1em] text-unknown">
                          {it.grade} · {it.source}
                        </span>
                        {it.note && <span className="text-[10px] leading-snug text-muted-foreground">{it.note}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="CHALLENGER REVIEW">
          <p className="text-[11px] leading-snug text-muted-foreground">{inv.challenger.question}</p>
          <p className="num mt-2 text-[11px] tracking-[0.12em] text-cyan">{inv.challenger.outcome}</p>
          <List items={inv.challenger.checked} empty="No challenge could be performed with the available evidence." />
        </Panel>
        <Panel title="HISTORICAL COMPARISON">
          <p className="num text-[11px] tracking-[0.12em] text-foreground">
            {inv.historical.cases > 0 ? `${inv.historical.cases} SIMILAR CASE(S)` : "INSUFFICIENT DATA"}
          </p>
          <List items={inv.historical.sharedCharacteristics} empty="No shared characteristics could be computed." />
          <List items={inv.historical.differences} empty="" />
          <p className="num mt-2 text-[9px] leading-relaxed tracking-[0.1em] text-unknown">{inv.historical.limitation}</p>
        </Panel>
      </div>

      <Panel title="EVIDENCE SOURCES">
        <ul className="space-y-2">
          {inv.sources.map((s) => (
            <li key={s.id} className="border-b border-border/40 pb-2">
              <div className="flex items-center justify-between gap-2">
                <span className="num text-[11px] tracking-[0.12em] text-foreground">{s.label}</span>
                <span
                  className={cn(
                    "num text-[9px] tracking-[0.14em]",
                    s.state === "CONNECTED" || s.state === "AVAILABLE" ? "text-signal-low" : s.state === "DEGRADED" ? "text-signal-mid" : "text-unknown",
                  )}
                >
                  {s.state}
                </span>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">{s.provides}</p>
              <p className="text-[10px] leading-snug text-unknown">{s.detail}</p>
            </li>
          ))}
        </ul>
      </Panel>

      {inv.assessment.anomalies.length > 0 && (
        <Panel title="ANOMALY DETAIL" right={<Tag kind="CALCULATED" />}>
          <ul className="space-y-2">
            {inv.assessment.anomalies.map((an) => (
              <li key={an.metric} className="border-b border-border/40 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-[11px] text-foreground">{an.metric}</span>
                  <SeverityBadge severity={an.severity} />
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">{an.what}</p>
                <p className="num text-[9px] tracking-[0.1em] text-unknown">
                  OBSERVED {an.observedValue} · BASELINE {an.baseline} · {an.deviation}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="num inline-flex items-center gap-1.5 rounded-sm border border-border bg-background/40 px-1.5 py-0.5 text-[10px] tracking-[0.12em]">
      <span className="text-unknown">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border/60 p-3">
      <p className="label-xs mb-2">{title}</p>
      {children}
    </div>
  );
}

function List({ items, empty, tone = "text-muted-foreground" }: { items: string[]; empty: string; tone?: string }) {
  if (!items.length) return empty ? <p className="text-[11px] text-unknown">{empty}</p> : null;
  return (
    <ul className="mt-1 space-y-1">
      {items.map((i) => (
        <li key={i} className={cn("text-[11px] leading-snug", tone)}>
          · {i}
        </li>
      ))}
    </ul>
  );
}
