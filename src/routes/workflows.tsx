import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { newId } from "@/lib/persist";
import { audit } from "@/lib/incidents";
import {
  NODE_LIBRARY,
  TEMPLATES,
  WORKFLOW_VERSION,
  createFromTemplate,
  deleteWorkflow,
  getExecutions,
  getVersions,
  getWorkflows,
  restoreVersion,
  runWorkflow,
  saveWorkflow,
  setActive,
  subscribeWorkflows,
  validateWorkflow,
  type WFNode,
  type Workflow,
} from "@/lib/workflows";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workflows")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Workflow Studio — Market Intelligence OS" },
      {
        name: "description",
        content: "Build, validate, dry-run and version automation workflows over real observations, with node-level execution records and clear credential requirements.",
      },
      { property: "og:title", content: "Workflow Studio — Market Intelligence OS" },
      { property: "og:description", content: "Runs report per-node state from a genuine pass; nodes needing missing credentials are blocked, not faked." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkflowsPage,
});

function blankWorkflow(): Workflow {
  return {
    id: newId("wf"),
    name: "New workflow",
    description: "Created manually",
    nodes: [],
    edges: [],
    active: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1,
  };
}

function WorkflowsPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeWorkflows);
  const workflows = useMemo(() => getWorkflows(), [tick]);
  const [id, setId] = useState<string | null>(null);
  const active = workflows.find((w) => w.id === id) ?? workflows[0] ?? null;
  const executions = useMemo(() => (active ? getExecutions(active.id) : []), [active, tick]);
  const versions = useMemo(() => (active ? getVersions(active.id) : []), [active, tick]);
  // Credentials are server-side; the studio only knows which ones the connectors declared missing.
  const missingEnv = useMemo(() => ["FOMO_API_KEY", "TRADINGVIEW_WEBHOOK_SECRET", "N8N_WEBHOOK_SECRET", "N8N_WEBHOOK_URL", "SUPABASE_URL"], []);
  const issues = useMemo(() => (active ? validateWorkflow(active, missingEnv) : []), [active, missingEnv, tick]);
  const blocking = issues.filter((i) => i.severity === "BLOCKING");

  const addNode = (type: string, group: WFNode["group"]) => {
    if (!active) return;
    const node: WFNode = {
      id: newId("n"),
      type,
      group,
      label: type,
      x: 0,
      y: active.nodes.length,
      ...(type === "IF" || type === "FILTER" ? { field: "ATTENTION SCORE" as const, op: ">=" as const, value: 60 } : {}),
    };
    const nodes = [...active.nodes, node];
    const edges = active.nodes.length ? [...active.edges, { id: newId("e"), from: active.nodes[active.nodes.length - 1]!.id, to: node.id }] : active.edges;
    saveWorkflow({ ...active, nodes, edges }, `Added ${type}`);
    audit("WORKFLOW", "NODE ADDED", `${type} in ${active.name}`);
  };

  return (
    <TerminalShell>
      <SectionTitle sub="Workflows run over the observations the terminal already holds. Validation names exactly what is wrong and why, and a dry run performs the same evaluation with no external side effects.">
        VISUAL WORKFLOW STUDIO
      </SectionTitle>

      <Panel className="mb-4" title="WORKFLOWS" right={<Tag kind="CALCULATED" />}>
        <div className="mb-3 flex flex-wrap gap-2">
          <Btn
            tone="primary"
            onClick={() => {
              const w = blankWorkflow();
              saveWorkflow(w, "Created");
              setId(w.id);
              audit("WORKFLOW", "WORKFLOW CREATED", w.name);
            }}
          >
            NEW WORKFLOW
          </Btn>
          {TEMPLATES.map((t) => (
            <Btn
              key={t.name}
              onClick={() => {
                const w = createFromTemplate(t);
                setId(w.id);
                audit("WORKFLOW", "TEMPLATE USED", t.name);
              }}
              title={t.description}
            >
              + {t.name}
            </Btn>
          ))}
        </div>
        {workflows.length === 0 ? (
          <p className="text-xs text-unknown">NO WORKFLOWS — create one, or start from a template</p>
        ) : (
          <Table head={["NAME", "NODES", "VERSION", "STATE", "UPDATED", ""]}>
            {workflows.map((w) => (
              <tr key={w.id} onClick={() => setId(w.id)} className={cn("cursor-pointer", active?.id === w.id && "bg-accent/40")}>
                <Td className="num">{w.name}</Td>
                <Td className="num">{w.nodes.length}</Td>
                <Td className="num">v{w.version}</Td>
                <Td><StatePill label={w.active ? "ACTIVE" : "INACTIVE"} tone={w.active ? "ok" : "muted"} /></Td>
                <Td className="num text-unknown">{clockOf(w.updatedAt)}</Td>
                <Td>
                  <Btn tone="danger" onClick={() => { deleteWorkflow(w.id); audit("WORKFLOW", "WORKFLOW DELETED", w.name); }}>DELETE</Btn>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {!active ? (
        <EmptyState title="NO WORKFLOW SELECTED" hint="Create a workflow or pick a template above to start building." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Panel title="NODE LIBRARY" right={<Tag kind="CALCULATED" />}>
            {(["DATA", "INTELLIGENCE", "LOGIC", "OUTPUT"] as const).map((g) => (
              <div key={g} className="mb-3">
                <p className="label-xs mb-1.5">{g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {NODE_LIBRARY.filter((n) => n.group === g).map((n) => (
                    <button
                      key={n.type}
                      onClick={() => addNode(n.type, g)}
                      title={`${n.note}${n.needs.length ? ` · requires ${n.needs.join(", ")}` : ""}`}
                      className="num rounded-sm border border-border px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-muted-foreground hover:border-cyan/50 hover:text-cyan"
                    >
                      {n.type}
                      {n.needs.length > 0 && <span className="ml-1 text-unknown">◍</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-unknown">◍ needs a credential that is configured server-side</p>
          </Panel>

          <div className="space-y-4">
            <Panel
              title={active.name}
              right={
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={() => { setActive(active.id, !active.active); audit("WORKFLOW", active.active ? "DEACTIVATED" : "ACTIVATED", active.name); }}>
                    {active.active ? "DEACTIVATE" : "ACTIVATE"}
                  </Btn>
                  <Btn
                    onClick={() => {
                      runWorkflow(active, { items: brain.queue, missingEnv }, "DRY RUN");
                      audit("WORKFLOW", "DRY RUN", active.name);
                    }}
                  >
                    DRY RUN
                  </Btn>
                  <Btn
                    tone="primary"
                    disabled={blocking.length > 0}
                    title={blocking.length ? "Blocking validation issues must be resolved first" : "Runs over current observations"}
                    onClick={() => {
                      runWorkflow(active, { items: brain.queue, missingEnv }, "LIVE");
                      audit("WORKFLOW", "LIVE RUN", active.name);
                    }}
                  >
                    RUN
                  </Btn>
                </div>
              }
            >
              <input
                value={active.name}
                onChange={(e) => saveWorkflow({ ...active, name: e.target.value }, "Renamed")}
                className="num mb-2 w-full rounded-sm border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-cyan/50"
              />
              {active.nodes.length === 0 ? (
                <p className="text-xs text-unknown">NO NODES — add nodes from the library</p>
              ) : (
                <ol className="space-y-1.5">
                  {active.nodes.map((n, i) => (
                    <li key={n.id} className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-1.5 last:border-0">
                      <span className="num text-[10px] text-unknown">{String(i + 1).padStart(2, "0")}</span>
                      <StatePill label={n.group} tone={n.group === "OUTPUT" ? "warn" : n.group === "INTELLIGENCE" ? "agent" : "info"} />
                      <span className="num text-xs text-foreground">{n.type}</span>
                      {(n.type === "IF" || n.type === "FILTER") && (
                        <span className="flex items-center gap-1">
                          <select
                            value={n.field ?? ""}
                            onChange={(e) =>
                              saveWorkflow(
                                {
                                  ...active,
                                  nodes: active.nodes.map((x) =>
                                    x.id === n.id ? { ...x, field: e.target.value as NonNullable<WFNode["field"]> } : x,
                                  ),
                                },
                                "Condition changed",
                              )
                            }
                            className="num rounded-sm border border-border bg-background px-1 py-0.5 text-[10px]"
                          >
                            {["ATTENTION SCORE", "RISK SCORE", "CONFIDENCE", "ANOMALY COUNT", "LIQUIDITY USD", "VOLUME 24H"].map((f) => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                          <select
                            value={n.op ?? ">="}
                            onChange={(e) =>
                              saveWorkflow({ ...active, nodes: active.nodes.map((x) => (x.id === n.id ? { ...x, op: e.target.value as ">=" | "<=" } : x)) }, "Condition changed")
                            }
                            className="num rounded-sm border border-border bg-background px-1 py-0.5 text-[10px]"
                          >
                            <option value=">=">≥</option>
                            <option value="<=">≤</option>
                          </select>
                          <input
                            type="number"
                            value={n.value ?? 0}
                            onChange={(e) =>
                              saveWorkflow({ ...active, nodes: active.nodes.map((x) => (x.id === n.id ? { ...x, value: Number(e.target.value) } : x)) }, "Condition changed")
                            }
                            className="num w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-[10px]"
                          />
                        </span>
                      )}
                      <Btn
                        tone="danger"
                        onClick={() =>
                          saveWorkflow(
                            { ...active, nodes: active.nodes.filter((x) => x.id !== n.id), edges: active.edges.filter((e) => e.from !== n.id && e.to !== n.id) },
                            "Node removed",
                          )
                        }
                      >
                        REMOVE
                      </Btn>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel title="VALIDATION" right={<StatePill label={blocking.length ? `${blocking.length} BLOCKING` : "READY"} tone={blocking.length ? "bad" : "ok"} />}>
              {issues.length === 0 ? (
                <p className="text-xs text-signal-low">NO ISSUES FOUND</p>
              ) : (
                <Table head={["SEVERITY", "WHAT", "WHY", "AFFECTED", "ACTION"]}>
                  {issues.map((i, k) => (
                    <tr key={k}>
                      <Td><StatePill label={i.severity} tone={i.severity === "BLOCKING" ? "bad" : "warn"} /></Td>
                      <Td className="max-w-[14rem] text-[11px] text-foreground">{i.what}</Td>
                      <Td className="max-w-[16rem] text-[11px] text-muted-foreground">{i.why}</Td>
                      <Td className="num max-w-[10rem] truncate text-[11px]">{i.affected}</Td>
                      <Td className="max-w-[14rem] text-[11px] text-cyan">{i.action}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>

            <Panel title="EXECUTION HISTORY" right={<Tag kind="CALCULATED" />}>
              {executions.length === 0 ? (
                <p className="text-xs text-unknown">NEVER RUN</p>
              ) : (
                <div className="space-y-3">
                  {executions.slice(0, 6).map((x) => (
                    <div key={x.id} className="rounded-sm border border-border/60 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatePill label={x.mode} tone={x.mode === "LIVE" ? "ok" : "info"} />
                        <StatePill label={x.status} tone={toneFor(x.status)} />
                        <span className="num text-[10px] text-unknown">{clockOf(x.startedAt)} · {x.durationMs ?? "—"}ms</span>
                      </div>
                      <KV label="INPUT" value={x.input} />
                      <KV label="OUTPUT" value={x.output} />
                      <ul className="mt-1.5 space-y-1">
                        {x.nodes.map((n) => (
                          <li key={n.nodeId} className="flex flex-wrap items-center gap-2 text-[11px]">
                            <StatePill label={n.state} tone={toneFor(n.state)} />
                            <span className="num text-foreground">{n.type}</span>
                            <span className="text-muted-foreground">{n.detail}</span>
                            {n.records !== null && <span className="num text-unknown">{n.records} records</span>}
                          </li>
                        ))}
                      </ul>
                      {x.errors.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {x.errors.map((e, i) => (
                            <li key={i} className="text-[11px] text-signal-extreme">{e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="VERSION HISTORY" right={<Tag kind="CALCULATED" />}>
              {versions.length === 0 ? (
                <p className="text-xs text-unknown">NO SAVED VERSIONS YET</p>
              ) : (
                <Table head={["VERSION", "SAVED", "NOTE", ""]}>
                  {versions.slice(0, 12).map((v) => (
                    <tr key={v.version}>
                      <Td className="num">v{v.version}</Td>
                      <Td className="num text-unknown">{clockOf(v.savedAt)}</Td>
                      <Td className="text-muted-foreground">{v.note}</Td>
                      <Td>
                        <Btn onClick={() => { restoreVersion(active.id, v.version); audit("WORKFLOW", "VERSION RESTORED", `${active.name} v${v.version}`); }}>RESTORE</Btn>
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>
          </div>
        </div>
      )}

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={WORKFLOW_VERSION} />
      </div>
    </TerminalShell>
  );
}
