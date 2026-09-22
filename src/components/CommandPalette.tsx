import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { universalSearch, UNSUPPORTED_CATEGORIES, type SearchHit } from "@/lib/search";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { attentionQueue, warrantsResearch } from "@/lib/attention";
import { upsertJob } from "@/lib/jobs";
import { runWorkflow, getWorkflows } from "@/lib/workflows";
import { emitAlert } from "@/lib/local-store";
import { audit } from "@/lib/incidents";
import { emitEvent } from "@/lib/events";
import { EXPLANATIONS } from "@/lib/explain";

type Command = { id: string; label: string; hint: string; run: () => void };

/** CTRL/CMD + K — every command performs a real application action. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const mi = useMarketIntelligence();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setI(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  const go = (to: string, search?: Record<string, unknown>, params?: Record<string, string>) => {
    setOpen(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void navigate({ to, ...(search ? { search } : {}), ...(params ? { params } : {}) } as any);
  };

  const commands: Command[] = useMemo(
    () => [
      { id: "c-search", label: "Search everything", hint: "type to search markets, research, memory, workflows", run: () => inputRef.current?.focus() },
      { id: "c-discover", label: "Open market search", hint: "/discover", run: () => go("/discover", { q: "", focus: true }) },
      { id: "c-markets", label: "Open markets", hint: "/markets", run: () => go("/markets") },
      { id: "c-attention", label: "Open Attention", hint: "/attention", run: () => go("/attention") },
      { id: "c-research", label: "Open Research", hint: "/research", run: () => go("/research") },
      { id: "c-room", label: "Open Agent Room", hint: "/room", run: () => go("/room") },
      { id: "c-memory", label: "Open Memory", hint: "/memory", run: () => go("/memory") },
      { id: "c-time", label: "Open Time Machine", hint: "/timemachine", run: () => go("/timemachine") },
      { id: "c-post", label: "Open Post-Mortems", hint: "/postmortems", run: () => go("/postmortems") },
      { id: "c-cal", label: "Open Calibration", hint: "/calibration", run: () => go("/calibration") },
      { id: "c-perf", label: "Open Agent Performance", hint: "/performance", run: () => go("/performance") },
      { id: "c-ws", label: "Open Workspaces", hint: "/workspaces", run: () => go("/workspaces") },
      { id: "c-int", label: "Open Integrations", hint: "/integrations", run: () => go("/integrations") },
      { id: "c-wf", label: "Open Workflow Studio", hint: "/workflows", run: () => go("/workflows") },
      { id: "c-neural", label: "Open Neural Link", hint: "/neural", run: () => go("/neural") },
      { id: "c-stream", label: "Open Intelligence Stream", hint: "/stream", run: () => go("/stream") },
      { id: "c-q", label: "Open Open Questions", hint: "/questions", run: () => go("/questions") },
      { id: "c-hyp", label: "Open Hypotheses", hint: "/hypotheses", run: () => go("/hypotheses") },
      { id: "c-con", label: "Open Contradictions", hint: "/contradictions", run: () => go("/contradictions") },
      { id: "c-inc", label: "Open Incidents", hint: "/incidents", run: () => go("/incidents") },
      { id: "c-aud", label: "Open Audit Log", hint: "/audit", run: () => go("/audit") },
      { id: "c-sys", label: "Open System Health", hint: "/system", run: () => go("/system") },
      { id: "s-search", label: "/search — search every stored record", hint: "type after opening: markets, research, memory, workflows", run: () => inputRef.current?.focus() },
      { id: "s-find-token", label: "/find token — find a meme token", hint: "opens market search", run: () => go("/discover", { q: "", focus: true }) },
      { id: "s-find-trader", label: "/find trader — traders observed acting", hint: "/traders", run: () => go("/traders") },
      { id: "s-find-wallet", label: "/find wallet — wallets observed acting", hint: "/wallets", run: () => go("/wallets") },
      { id: "s-radar", label: "/show radar — live meme radar", hint: "/radar", run: () => go("/radar") },
      { id: "s-alerts", label: "/show alerts — alerts raised from real events", hint: "/alerts", run: () => go("/alerts") },
      { id: "s-research", label: "/show research — research and dossiers", hint: "/meme", run: () => go("/meme") },
      { id: "s-watchlist", label: "/show watchlist — tracked tokens", hint: "/watchlist", run: () => go("/watchlist") },
      { id: "s-providers", label: "/show providers — connection states", hint: "/connections", run: () => go("/connections") },
      { id: "s-paper", label: "/show paper trades — simulated positions only", hint: "/paper", run: () => go("/paper") },
      { id: "s-narratives", label: "/show narratives — shared meme themes", hint: "/narratives", run: () => go("/narratives") },
      { id: "s-learning", label: "/show learning — outcomes and calibration", hint: "/learning", run: () => go("/learning") },
      ...EXPLANATIONS.map((e) => ({
        id: `s-explain-${e.key}`,
        label: `/explain ${e.title.toLowerCase()}`,
        hint: "opens the definition, with observed fact separated from interpretation",
        run: () => go("/help", { topic: e.key }),
      })),
      {
        id: "c-job",
        label: "Create research job on the highest-attention target",
        hint: "opens a real job from the current observation",
        run: () => {
          const queue = attentionQueue(mi.assessments);
          const top = queue.find(warrantsResearch) ?? queue[0];
          if (!top) return;
          const job = upsertJob(top, "USER", "Created from the command palette on the current observation");
          audit("SETTINGS", "RESEARCH JOB CREATED", `${job.targetLabel} via command palette`);
          go("/research");
        },
      },
      {
        id: "c-alert",
        label: "Create alert on the highest-attention target",
        hint: "writes a real alert event",
        run: () => {
          const top = attentionQueue(mi.assessments)[0];
          if (!top) return;
          const a = top.assessment;
          emitAlert({
            key: a.pair.key,
            symbol: a.pair.baseSymbol,
            chainId: a.pair.chainId,
            dexId: a.pair.dexId,
            kind: "USER ALERT",
            severity: "NOTABLE",
            message: `Manual alert from command palette — attention ${top.score ?? "NOT SCORED"} (${top.klass})`,
            confidence: a.confidence.score,
          });
          audit("ALERTS", "ALERT CREATED", `${a.pair.baseSymbol} via command palette`);
          go("/alerts");
        },
      },
      {
        id: "c-dry",
        label: "Run simulation (dry run of the first workflow)",
        hint: "no external side effects",
        run: () => {
          const wf = getWorkflows()[0];
          if (!wf) {
            go("/workflows");
            return;
          }
          runWorkflow(wf, { items: attentionQueue(mi.assessments), missingEnv: [] }, "DRY RUN");
          emitEvent({ type: "SYSTEM_EVENT", source: "COMMAND PALETTE", message: `Dry run requested for ${wf.name}` });
          go("/workflows");
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mi.assessments.length],
  );

  const filteredCommands = commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  const hits: SearchHit[] = q.trim().length > 1 ? universalSearch(q, mi.assessments) : [];
  const rows: { key: string; label: string; hint: string; run: () => void; kind: string }[] = [
    ...filteredCommands.map((c) => ({ key: c.id, label: c.label, hint: c.hint, run: c.run, kind: "COMMAND" })),
    ...hits.map((h, idx) => ({
      key: `h-${idx}`,
      label: h.label,
      hint: h.detail,
      kind: h.category,
      run: () => go(h.to, h.search, h.params),
    })),
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/85 p-4 pt-[10vh] backdrop-blur-md" onClick={() => setOpen(false)}>
      <div className="panel w-full max-w-2xl overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-3.5 w-3.5 text-cyan" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setI((v) => Math.min(rows.length - 1, v + 1));
              if (e.key === "ArrowUp") setI((v) => Math.max(0, v - 1));
              if (e.key === "Enter") rows[i]?.run();
            }}
            placeholder="Search commands, markets, research, memory, workflows…"
            className="num w-full bg-transparent text-xs tracking-wide text-foreground outline-none placeholder:text-unknown"
          />
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto">
          {rows.length === 0 && <li className="px-3 py-6 text-center text-xs text-unknown">NO MATCHING COMMAND OR RECORD</li>}
          {rows.slice(0, 40).map((r, idx) => (
            <li key={r.key}>
              <button
                onMouseEnter={() => setI(idx)}
                onClick={r.run}
                className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left", idx === i ? "bg-accent" : "hover:bg-accent/50")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs text-foreground">{r.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{r.hint}</span>
                </span>
                <span className="num shrink-0 text-[9px] tracking-[0.14em] text-unknown">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
        {q.trim().length > 1 && (
          <div className="border-t border-border px-3 py-2">
            <p className="num text-[10px] tracking-[0.12em] text-unknown">
              {UNSUPPORTED_CATEGORIES.map((c) => `${c.category}: ${c.note}`).join(" · ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
