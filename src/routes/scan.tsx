import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Star } from "lucide-react";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, EmptyState, Panel, SectionTitle, Tag } from "@/components/kit";
import { Drawer } from "@/components/stellaris/Drawer";
import { InvestigationPanel, StateBadge } from "@/components/stellaris/InvestigationPanel";
import { useStellaris } from "@/hooks/useStellaris";
import { ageFrom, usd } from "@/lib/format";
import { toggleWatch } from "@/lib/local-store";
import { upsertJob } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import type { Investigation, ResearchState } from "@/lib/stellaris";

export const Route = createFileRoute("/scan")({
  // Tiles read locally recorded watchlist, job and history state, which the server cannot see.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Rapid Scan — Stellaris Intel" },
      { name: "description", content: "The continuous market wall: every newly discovered market as a live investigation tile with its real research state." },
      { property: "og:title", content: "Rapid Scan — Stellaris Intel" },
      { property: "og:description", content: "Live investigation tiles for newly discovered decentralized markets, with research state, evidence quality and source agreement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RapidScan,
});

const STATES: (ResearchState | "ALL")[] = [
  "ALL",
  "NEW",
  "TRIAGING",
  "INVESTIGATING",
  "MONITORING",
  "LOW-CONCERN SIGNALS",
  "ELEVATED RISK SIGNALS",
  "HIGH-RISK SIGNALS",
  "CONFLICTING EVIDENCE",
  "INSUFFICIENT DATA",
  "RESOLVED",
];

type Sort = "PRIORITY" | "NEWEST" | "OLDEST" | "ACTIVITY" | "LIQUIDITY" | "DATA QUALITY";

function RapidScan() {
  const s = useStellaris();
  const [state, setState] = useState<ResearchState | "ALL">("ALL");
  const [chain, setChain] = useState("ALL");
  const [sort, setSort] = useState<Sort>("PRIORITY");
  const [onlyWatched, setOnlyWatched] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [onlyConflict, setOnlyConflict] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const chains = useMemo(() => ["ALL", ...new Set(s.investigations.map((i) => i.chainId))], [s.investigations]);

  const rows = useMemo(() => {
    let list = s.investigations;
    if (state !== "ALL") list = list.filter((i) => i.state === state);
    if (chain !== "ALL") list = list.filter((i) => i.chainId === chain);
    if (onlyWatched) list = list.filter((i) => i.watched);
    if (onlyChanged) list = list.filter((i) => i.changed);
    if (onlyConflict) list = list.filter((i) => i.conflicting.length);
    const created = (i: Investigation) => i.assessment.pair.pairCreatedAt ?? 0;
    const sorted = [...list];
    if (sort === "NEWEST") sorted.sort((a, b) => created(b) - created(a));
    if (sort === "OLDEST") sorted.sort((a, b) => (created(a) || Infinity) - (created(b) || Infinity));
    if (sort === "ACTIVITY") sorted.sort((a, b) => (b.assessment.calculated.txns24h ?? 0) - (a.assessment.calculated.txns24h ?? 0));
    if (sort === "LIQUIDITY") sorted.sort((a, b) => (b.assessment.pair.liquidityUsd ?? 0) - (a.assessment.pair.liquidityUsd ?? 0));
    if (sort === "DATA QUALITY") sorted.sort((a, b) => b.assessment.confidence.score - a.assessment.confidence.score);
    return sorted;
  }, [s.investigations, state, chain, sort, onlyWatched, onlyChanged, onlyConflict]);

  const selected = s.investigations.find((i) => i.key === open) ?? null;

  return (
    <TerminalShell>
      <SectionTitle sub="Every market Stellaris is currently observing, as a live investigation tile. Colour marks research state and risk evidence — never a trading instruction.">
        RAPID SCAN
      </SectionTitle>

      <Panel title="FILTERS" right={<Tag kind="CALCULATED" label={`${rows.length} OF ${s.investigations.length}`} />}>
        <div className="flex flex-wrap items-center gap-2">
          <Select label="STATE" value={state} options={STATES} onChange={(v) => setState(v as ResearchState | "ALL")} />
          <Select label="CHAIN" value={chain} options={chains} onChange={setChain} />
          <Select label="SORT" value={sort} options={["PRIORITY", "NEWEST", "OLDEST", "ACTIVITY", "LIQUIDITY", "DATA QUALITY"]} onChange={(v) => setSort(v as Sort)} />
          <Toggle label="WATCHLIST" on={onlyWatched} set={setOnlyWatched} />
          <Toggle label="SIGNIFICANT CHANGE" on={onlyChanged} set={setOnlyChanged} />
          <Toggle label="SOURCE DISAGREEMENT" on={onlyConflict} set={setOnlyConflict} />
        </div>
      </Panel>

      <div className="mt-4">
        {s.query.isLoading ? (
          <DataState state="WAITING FOR DATA" detail="Requesting the current market snapshot from the data source." />
        ) : rows.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((i) => (
              <Tile key={i.key} inv={i} onOpen={() => setOpen(i.key)} />
            ))}
          </div>
        ) : (
          <EmptyState title="NO MARKETS MATCH THESE FILTERS" hint="Relax a filter, or wait for the next observation cycle to bring new markets into the scan." />
        )}
      </div>

      <Drawer open={Boolean(selected)} onClose={() => setOpen(null)} title={selected ? `INVESTIGATION — ${selected.label}` : ""}>
        {selected && <InvestigationPanel inv={selected} />}
      </Drawer>
    </TerminalShell>
  );
}

const EDGE: Record<ResearchState, string> = {
  NEW: "border-cyan/45",
  TRIAGING: "border-signal-mid/40",
  INVESTIGATING: "border-signal-mid/55",
  MONITORING: "border-cyan/35",
  "LOW-CONCERN SIGNALS": "border-signal-low/45",
  "ELEVATED RISK SIGNALS": "border-signal-high/50",
  "HIGH-RISK SIGNALS": "border-signal-extreme/60",
  "CONFLICTING EVIDENCE": "border-violet/50",
  "INSUFFICIENT DATA": "border-border",
  RESOLVED: "border-signal-low/35",
};

function Tile({ inv, onOpen }: { inv: Investigation; onOpen: () => void }) {
  const [watched, setWatched] = useState(inv.watched);
  const p = inv.assessment.pair;
  return (
    <article className={cn("panel anim-in p-3 transition-colors", EDGE[inv.state])}>
      <button onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="num truncate text-xs text-foreground">
              {p.baseSymbol}/{p.quoteSymbol}
            </p>
            <p className="num text-[9px] tracking-[0.12em] text-unknown">
              {p.chainId} · {p.dexId} · AGE {ageFrom(p.pairCreatedAt)}
            </p>
          </div>
          <StateBadge state={inv.state} />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <Cell label="LIQ" value={usd(p.liquidityUsd)} />
          <Cell label="VOL 24H" value={usd(p.volume.h24)} />
          <Cell label="TXNS 24H" value={inv.assessment.calculated.txns24h === null ? "UNKNOWN" : String(inv.assessment.calculated.txns24h)} />
          <Cell label="RISK" value={inv.assessment.risk.score === null ? "NOT SCORED" : `${inv.assessment.risk.score}/100`} />
          <Cell label="EVIDENCE" value={inv.evidenceQuality} />
          <Cell label="AGREEMENT" value={inv.sourceAgreement} />
        </div>

        {inv.changed && <p className="mt-2 text-[10px] leading-snug text-signal-mid">{inv.changed}</p>}
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{inv.why[0]}</p>
      </button>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
        <Mini onClick={onOpen}>WHY</Mini>
        <Mini onClick={() => upsertJob(inv.attention, "USER", "Investigation requested from Rapid Scan")}>INVESTIGATE</Mini>
        <Mini onClick={() => setWatched(toggleWatch(p))} active={watched}>
          <Star className={cn("h-2.5 w-2.5", watched && "fill-current")} /> WATCH
        </Mini>
        <Mini onClick={onOpen}>DETAILS</Mini>
      </div>
    </article>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="num text-[9px] tracking-[0.1em] text-unknown">{label}</span>
      <span className="num truncate text-[10px] text-foreground">{value}</span>
    </div>
  );
}

function Mini({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "num inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] tracking-[0.14em] transition-colors",
        active ? "border-cyan/50 text-cyan" : "border-border text-muted-foreground hover:border-cyan/50 hover:text-cyan",
      )}
    >
      {children}
    </button>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="num text-[9px] tracking-[0.14em] text-unknown">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num rounded-sm border border-border bg-background/60 px-2 py-1 text-[10px] tracking-[0.12em] text-foreground"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      onClick={() => set(!on)}
      className={cn(
        "num rounded-sm border px-2 py-1 text-[10px] tracking-[0.12em] transition-colors",
        on ? "border-cyan/50 text-cyan" : "border-border text-muted-foreground hover:border-cyan/50 hover:text-cyan",
      )}
    >
      {label}
    </button>
  );
}
