import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { WorkspaceWidget } from "@/components/WorkspaceWidget";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { healthQuery } from "@/hooks/useMarket";
import {
  ALL_WIDGETS,
  WORKSPACE_VERSION,
  activeWorkspace,
  addWidget,
  createWorkspace,
  deleteWorkspace,
  duplicateWorkspace,
  getPrefs,
  getWorkspaces,
  moveWidget,
  moveWorkspace,
  removeWidget,
  renameWorkspace,
  resetPrefs,
  setActiveWorkspace,
  setPrefs,
  subscribePrefs,
  subscribeWorkspaces,
  updateWidget,
} from "@/lib/workspaces";
import { getGovernor, resetGovernor, resourceReport, setGovernor, subscribeGovernor } from "@/lib/governor";
import { getEvents } from "@/lib/events";
import { getMemory } from "@/lib/memory";
import { getQuestions } from "@/lib/questions";
import { historyCounts } from "@/lib/local-store";
import { storeFootprint } from "@/lib/persist";
import { audit } from "@/lib/incidents";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspaces")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Workspaces & Preferences — Market Intelligence OS" },
      {
        name: "description",
        content: "Build custom dashboards from live intelligence widgets, and control density, motion, accent, alert thresholds and research budgets.",
      },
      { property: "og:title", content: "Workspaces & Preferences — Market Intelligence OS" },
      { property: "og:description", content: "Layouts and preferences are stored locally and applied immediately." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const brain = useGlobalBrain();
  const wsTick = useStoreTick(subscribeWorkspaces);
  const prefTick = useStoreTick(subscribePrefs);
  const govTick = useStoreTick(subscribeGovernor);
  const health = useQuery(healthQuery);

  const workspaces = useMemo(() => getWorkspaces(), [wsTick]);
  const active = useMemo(() => activeWorkspace(), [wsTick]);
  const prefs = useMemo(() => getPrefs(), [prefTick]);
  const gov = useMemo(() => getGovernor(), [govTick]);
  const api = health.data?.api ?? null;
  const resources = useMemo(
    () => resourceReport(api ? { requests: api.requests, cacheHits: api.cacheHits, rateLimitDeferrals: api.rateLimitDeferrals } : null),
    [api, govTick],
  );
  const footprint = useMemo(() => storeFootprint().reduce((sum, r) => sum + r.bytes, 0), [brain.cycle, wsTick]);

  const data = {
    queue: brain.queue,
    jobs: brain.jobs,
    events: getEvents(),
    questions: getQuestions(),
    memory: getMemory(),
    api: api ? { requests: api.requests, cacheHits: api.cacheHits, errors: api.errors } : null,
    historyPoints: Object.values(historyCounts()).reduce((s, n) => s + n, 0),
  };

  return (
    <TerminalShell>
      <SectionTitle sub="Arrange the terminal the way you work. Widgets show the same real data as their full pages — nothing here is a placeholder.">
        WORKSPACES & PREFERENCES
      </SectionTitle>

      <Panel className="mb-4" title="WORKSPACES" right={<Tag kind="CALCULATED" />}>
        <div className="mb-3 flex flex-wrap gap-2">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => setActiveWorkspace(w.id)}
              className={cn("num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]", active.id === w.id ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {w.name} <span className="text-unknown">{w.widgets.length}</span>
            </button>
          ))}
          <Btn
            tone="primary"
            onClick={() => {
              const w = createWorkspace(`Workspace ${workspaces.length + 1}`);
              setActiveWorkspace(w.id);
              audit("WORKSPACE", "WORKSPACE CREATED", w.name);
            }}
          >
            NEW
          </Btn>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={active.name}
            onChange={(e) => renameWorkspace(active.id, e.target.value)}
            className="num rounded-sm border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-cyan/50"
          />
          <Btn onClick={() => duplicateWorkspace(active.id)}>DUPLICATE</Btn>
          <Btn onClick={() => moveWorkspace(active.id, -1)}>◀ MOVE</Btn>
          <Btn onClick={() => moveWorkspace(active.id, 1)}>MOVE ▶</Btn>
          <Btn tone="danger" onClick={() => { deleteWorkspace(active.id); audit("WORKSPACE", "WORKSPACE DELETED", active.name); }}>DELETE</Btn>
        </div>
        <div className="mt-3">
          <p className="label-xs mb-1.5">ADD WIDGET</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_WIDGETS.map((t) => (
              <button
                key={t}
                onClick={() => addWidget(active.id, t)}
                className="num rounded-sm border border-border px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
              >
                + {t}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        {active.widgets.length === 0 ? (
          <Panel title="EMPTY WORKSPACE" right={<Tag kind="VISUAL" />}>
            <p className="text-xs text-unknown">NO WIDGETS — add one above</p>
          </Panel>
        ) : (
          active.widgets.map((w) => (
            <div key={w.id} className={cn(w.span === 3 ? "lg:col-span-3" : w.span === 2 ? "lg:col-span-2" : "")}>
              <WorkspaceWidget type={w.type} data={data} />
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Btn onClick={() => moveWidget(active.id, w.id, -1)}>◀</Btn>
                <Btn onClick={() => moveWidget(active.id, w.id, 1)}>▶</Btn>
                <Btn onClick={() => updateWidget(active.id, w.id, { span: w.span === 3 ? 1 : w.span === 2 ? 3 : 2 })}>WIDTH {w.span}</Btn>
                <Btn tone="danger" onClick={() => removeWidget(active.id, w.id)}>REMOVE</Btn>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="PREFERENCES" right={<Tag kind="VISUAL" />}>
          <p className="label-xs mb-1.5">DENSITY</p>
          <div className="mb-3 flex gap-2">
            {(["COMPACT", "NORMAL", "SPACIOUS"] as const).map((d) => (
              <Btn key={d} tone={prefs.density === d ? "primary" : "default"} onClick={() => setPrefs({ density: d })}>{d}</Btn>
            ))}
          </div>
          <p className="label-xs mb-1.5">MOTION</p>
          <div className="mb-3 flex gap-2">
            {(["FULL", "REDUCED", "OFF"] as const).map((d) => (
              <Btn key={d} tone={prefs.animation === d ? "primary" : "default"} onClick={() => setPrefs({ animation: d })}>{d}</Btn>
            ))}
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">Your operating system's reduced-motion setting is always respected regardless of this choice.</p>
          <p className="label-xs mb-1.5">ACCENT</p>
          <div className="mb-3 flex gap-2">
            {(["CYAN", "VIOLET", "ELECTRIC", "AMBER"] as const).map((d) => (
              <Btn key={d} tone={prefs.accent === d ? "primary" : "default"} onClick={() => setPrefs({ accent: d })}>{d}</Btn>
            ))}
          </div>
          <p className="label-xs mb-1.5">NOTIFY FROM SEVERITY</p>
          <div className="mb-3 flex gap-2">
            {(["ALL", "NOTABLE", "UNUSUAL", "SEVERE"] as const).map((d) => (
              <Btn key={d} tone={prefs.notifySeverity === d ? "primary" : "default"} onClick={() => setPrefs({ notifySeverity: d })}>{d}</Btn>
            ))}
          </div>
          <Btn tone="danger" onClick={() => resetPrefs()}>RESET PREFERENCES</Btn>
        </Panel>

        <Panel title="RESEARCH BUDGETS & SCHEDULING" right={<Tag kind="CALCULATED" />}>
          <KV label="MAX CONCURRENT JOBS" value={String(gov.maxConcurrentJobs)} />
          <input
            type="range"
            min={1}
            max={40}
            value={gov.maxConcurrentJobs}
            onChange={(e) => setGovernor({ maxConcurrentJobs: Number(e.target.value) })}
            className="mb-2 w-full accent-[var(--cyan)]"
          />
          <KV label="TARGETS SCHEDULED PER CYCLE" value={String(gov.maxScheduledPerCycle)} />
          <input
            type="range"
            min={1}
            max={40}
            value={gov.maxScheduledPerCycle}
            onChange={(e) => setGovernor({ maxScheduledPerCycle: Number(e.target.value) })}
            className="mb-2 w-full accent-[var(--cyan)]"
          />
          <KV label="HISTORICAL DEPTH (OBSERVATIONS)" value={String(gov.historicalDepth)} />
          <input
            type="range"
            min={2}
            max={500}
            step={2}
            value={gov.historicalDepth}
            onChange={(e) => setGovernor({ historicalDepth: Number(e.target.value) })}
            className="mb-2 w-full accent-[var(--cyan)]"
          />
          <KV label="UPSTREAM BUDGET PER MINUTE" value={String(gov.apiBudgetPerMinute)} />
          <KV label="DEFAULT RESEARCH DEPTH" value={gov.defaultDepth} />
          <div className="my-2 flex flex-wrap gap-2">
            {(["QUICK", "STANDARD", "DEEP", "EXTREME / LAB"] as const).map((d) => (
              <Btn key={d} tone={gov.defaultDepth === d ? "primary" : "default"} onClick={() => setGovernor({ defaultDepth: d })}>{d}</Btn>
            ))}
          </div>
          <KV label="LOCAL STORE FOOTPRINT" value={`${Math.round(footprint / 1024)} KB`} />
          <Btn tone="danger" onClick={() => resetGovernor()}>RESET BUDGETS</Btn>
        </Panel>

        <Panel title="RESOURCE MANAGER" right={<Tag kind="CALCULATED" />} className="lg:col-span-2">
          <Table head={["RESOURCE", "USED", "LIMIT", "UTILISATION", "STATE", "NOTE"]}>
            {resources.map((r) => (
              <tr key={r.resource}>
                <Td className="num">{r.resource}</Td>
                <Td className={cn("num", r.state === "UNAVAILABLE" && "text-unknown")}>{r.used}</Td>
                <Td className="num text-muted-foreground">{r.limit}</Td>
                <Td className="num">{r.utilisationPct === null ? "—" : `${r.utilisationPct}%`}</Td>
                <Td><StatePill label={r.state} tone={toneFor(r.state)} /></Td>
                <Td className="max-w-[22rem] text-[11px] text-muted-foreground">{r.note}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={WORKSPACE_VERSION} />
      </div>
    </TerminalShell>
  );
}
