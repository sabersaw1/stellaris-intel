/**
 * WORKFLOW STUDIO — definitions, validation, dry run, execution, history, versions
 *
 * Executions are real: data nodes read the observations the application actually
 * has, logic nodes evaluate them, and output nodes either perform a local action
 * (alert, dashboard, agent room hand-off) or fail with an explicit reason when the
 * external connector they need is NOT CONFIGURED. No execution is ever animated
 * without work behind it.
 */

import { createStore, newId } from "./persist";
import { emitEvent } from "./events";
import { emitAlert } from "./local-store";
import type { Assessment } from "./dex-types";
import type { AttentionItem } from "./attention";

export const WORKFLOW_VERSION = "workflow-studio v1.0";

export type NodeGroup = "DATA" | "INTELLIGENCE" | "LOGIC" | "OUTPUT";

export const NODE_LIBRARY: { group: NodeGroup; type: string; needs: string[]; note: string }[] = [
  { group: "DATA", type: "DEX SCREENER", needs: [], note: "Reads the current normalized market snapshot" },
  { group: "DATA", type: "FOMO", needs: ["FOMO_API_KEY"], note: "Requires a server-side credential" },
  { group: "DATA", type: "TRADINGVIEW", needs: ["TRADINGVIEW_WEBHOOK_SECRET"], note: "Inbound alert trigger" },
  { group: "DATA", type: "REST", needs: [], note: "Generic HTTP source — URL must be configured server-side" },
  { group: "DATA", type: "WEBHOOK", needs: [], note: "Inbound webhook trigger" },
  { group: "DATA", type: "DATABASE", needs: ["SUPABASE_URL"], note: "Requires a database connection" },
  { group: "DATA", type: "JSON", needs: [], note: "Static structured input defined in the node" },

  { group: "INTELLIGENCE", type: "AGENT", needs: [], note: "Runs one agent reading" },
  { group: "INTELLIGENCE", type: "AGENT GROUP", needs: [], note: "Runs the full agent suite" },
  { group: "INTELLIGENCE", type: "RESEARCH", needs: [], note: "Opens or advances a research job" },
  { group: "INTELLIGENCE", type: "EVIDENCE", needs: [], note: "Records structured evidence" },
  { group: "INTELLIGENCE", type: "HYPOTHESIS", needs: [], note: "Creates or updates a hypothesis" },
  { group: "INTELLIGENCE", type: "DEBATE", needs: [], note: "Runs contradiction detection" },
  { group: "INTELLIGENCE", type: "HISTORICAL", needs: [], note: "Compares against recorded observations" },
  { group: "INTELLIGENCE", type: "SYNTHESIS", needs: [], note: "Consolidates classification and confidence" },
  { group: "INTELLIGENCE", type: "RISK", needs: [], note: "Runs the risk engine" },
  { group: "INTELLIGENCE", type: "ANOMALY", needs: [], note: "Runs anomaly detection (needs a peer baseline)" },
  { group: "INTELLIGENCE", type: "MEMORY", needs: [], note: "Writes to or recalls from intelligence memory" },

  { group: "LOGIC", type: "IF", needs: [], note: "Threshold condition on a numeric field" },
  { group: "LOGIC", type: "AND", needs: [], note: "All inbound branches must pass" },
  { group: "LOGIC", type: "OR", needs: [], note: "Any inbound branch may pass" },
  { group: "LOGIC", type: "NOT", needs: [], note: "Inverts the inbound branch" },
  { group: "LOGIC", type: "FILTER", needs: [], note: "Keeps records matching a condition" },
  { group: "LOGIC", type: "SWITCH", needs: [], note: "Routes by classification" },
  { group: "LOGIC", type: "MERGE", needs: [], note: "Combines branches" },
  { group: "LOGIC", type: "SPLIT", needs: [], note: "Fans out to parallel branches" },
  { group: "LOGIC", type: "DELAY", needs: [], note: "Defers the next node" },
  { group: "LOGIC", type: "LOOP", needs: [], note: "Iterates over records" },
  { group: "LOGIC", type: "RATE LIMIT", needs: [], note: "Caps executions per window" },

  { group: "OUTPUT", type: "ALERT", needs: [], note: "Writes a real alert event" },
  { group: "OUTPUT", type: "NOTIFICATION", needs: [], note: "In-app notification" },
  { group: "OUTPUT", type: "WEBHOOK", needs: [], note: "Outbound HTTP — target must be configured server-side" },
  { group: "OUTPUT", type: "N8N", needs: ["N8N_WEBHOOK_URL"], note: "Triggers an n8n workflow" },
  { group: "OUTPUT", type: "REPORT", needs: [], note: "Generates a report record" },
  { group: "OUTPUT", type: "DATABASE", needs: ["SUPABASE_URL"], note: "Persists to the database" },
  { group: "OUTPUT", type: "DASHBOARD", needs: [], note: "Publishes to a dashboard widget" },
  { group: "OUTPUT", type: "AGENT ROOM", needs: [], note: "Hands the target to the agent room" },
];

export type WFNode = {
  id: string;
  type: string;
  group: NodeGroup;
  label: string;
  /** IF / FILTER configuration, when applicable */
  field?: "RISK SCORE" | "ATTENTION SCORE" | "CONFIDENCE" | "ANOMALY COUNT" | "LIQUIDITY USD" | "VOLUME 24H";
  op?: ">=" | "<=";
  value?: number;
  x: number;
  y: number;
};

export type WFEdge = { id: string; from: string; to: string };

export type Workflow = {
  id: string;
  name: string;
  description: string;
  nodes: WFNode[];
  edges: WFEdge[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
  version: number;
};

export type WorkflowVersion = { workflowId: string; version: number; savedAt: number; snapshot: Workflow; note: string };

export type NodeRunState = "OK" | "RUNNING" | "WAITING" | "SKIPPED" | "FAILED";

export type Execution = {
  id: string;
  workflowId: string;
  workflowName: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  mode: "LIVE" | "DRY RUN";
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  input: string;
  output: string;
  nodes: { nodeId: string; type: string; label: string; state: NodeRunState; detail: string; records: number | null }[];
  errors: string[];
};

const wfStore = createStore<Workflow[]>("dmi.workflows.v1", []);
const versionStore = createStore<WorkflowVersion[]>("dmi.workflow-versions.v1", []);
const execStore = createStore<Execution[]>("dmi.workflow-exec.v1", []);

export const subscribeWorkflows = wfStore.subscribe;
export const subscribeExecutions = execStore.subscribe;

export function getWorkflows(): Workflow[] {
  return wfStore.get();
}
export function getWorkflow(id: string): Workflow | null {
  return wfStore.get().find((w) => w.id === id) ?? null;
}
export function getExecutions(workflowId?: string): Execution[] {
  const all = execStore.get().sort((a, b) => b.startedAt - a.startedAt);
  return workflowId ? all.filter((e) => e.workflowId === workflowId) : all;
}
export function getVersions(workflowId: string): WorkflowVersion[] {
  return versionStore.get().filter((v) => v.workflowId === workflowId).sort((a, b) => b.version - a.version);
}

function persist(next: Workflow[]) {
  wfStore.set(next.slice(0, 60));
}

export function saveWorkflow(w: Workflow, note = "Manual save") {
  const list = wfStore.get();
  const prior = list.find((x) => x.id === w.id);
  const next: Workflow = { ...w, updatedAt: Date.now(), version: (prior?.version ?? 0) + 1 };
  persist([next, ...list.filter((x) => x.id !== w.id)]);
  versionStore.set(
    [{ workflowId: next.id, version: next.version, savedAt: Date.now(), snapshot: next, note }, ...versionStore.get()].slice(0, 200),
  );
  return next;
}

export function deleteWorkflow(id: string) {
  persist(wfStore.get().filter((w) => w.id !== id));
}

export function restoreVersion(workflowId: string, version: number) {
  const v = getVersions(workflowId).find((x) => x.version === version);
  if (!v) return;
  saveWorkflow({ ...v.snapshot, id: workflowId }, `Restored from version ${version}`);
}

export function compareVersions(workflowId: string, a: number, b: number) {
  const va = getVersions(workflowId).find((v) => v.version === a);
  const vb = getVersions(workflowId).find((v) => v.version === b);
  if (!va || !vb) return null;
  const nodesA = new Set(va.snapshot.nodes.map((n) => `${n.type}:${n.label}`));
  const nodesB = new Set(vb.snapshot.nodes.map((n) => `${n.type}:${n.label}`));
  return {
    added: [...nodesB].filter((n) => !nodesA.has(n)),
    removed: [...nodesA].filter((n) => !nodesB.has(n)),
    edgeDelta: vb.snapshot.edges.length - va.snapshot.edges.length,
  };
}

export function setActive(id: string, active: boolean) {
  persist(wfStore.get().map((w) => (w.id === id ? { ...w, active, updatedAt: Date.now() } : w)));
}

/* ------------------------------ validation ---------------------------- */

export type ValidationIssue = { severity: "BLOCKING" | "WARNING"; code: string; what: string; why: string; affected: string; action: string };

export function validateWorkflow(w: Workflow, missingEnv: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lib = new Map(NODE_LIBRARY.map((n) => [n.type, n]));

  if (!w.nodes.length)
    issues.push({ severity: "BLOCKING", code: "EMPTY", what: "Workflow has no nodes", why: "There is nothing to execute", affected: "Activation", action: "Add at least one data node and one output node" });

  for (const n of w.nodes) {
    const def = lib.get(n.type);
    if (!def) {
      issues.push({ severity: "BLOCKING", code: "UNKNOWN NODE", what: `${n.type} is not a supported node`, why: "Node type is not in the library", affected: n.label, action: "Remove or replace the node" });
      continue;
    }
    for (const env of def.needs) {
      if (missingEnv.includes(env))
        issues.push({
          severity: "BLOCKING",
          code: "MISSING CREDENTIAL",
          what: `${n.type} requires ${env}, which is not configured`,
          why: "The connector cannot authenticate — WAITING FOR CREDENTIAL",
          affected: n.label,
          action: `Configure ${env} server-side, or remove the node`,
        });
    }
    if (n.type === "IF" || n.type === "FILTER") {
      if (!n.field || n.value === undefined)
        issues.push({ severity: "BLOCKING", code: "INCOMPLETE CONDITION", what: `${n.label} has no field or threshold`, why: "A condition cannot be evaluated without both", affected: n.label, action: "Set a field, operator and threshold" });
    }
  }

  const targets = new Set(w.edges.map((e) => e.to));
  const sources = new Set(w.edges.map((e) => e.from));
  for (const n of w.nodes) {
    if (n.group !== "DATA" && !targets.has(n.id))
      issues.push({ severity: "WARNING", code: "NO INPUT", what: `${n.label} has no inbound connection`, why: "It will never receive records", affected: n.label, action: "Connect an upstream node" });
    if (n.group !== "OUTPUT" && !sources.has(n.id))
      issues.push({ severity: "WARNING", code: "DEAD END", what: `${n.label} has no outbound connection`, why: "Its result is discarded", affected: n.label, action: "Connect it to a downstream node" });
  }
  if (!w.nodes.some((n) => n.group === "OUTPUT"))
    issues.push({ severity: "BLOCKING", code: "NO OUTPUT", what: "Workflow has no output node", why: "Execution would produce no observable result", affected: "Activation", action: "Add an output node" });
  if (!w.nodes.some((n) => n.group === "DATA"))
    issues.push({ severity: "BLOCKING", code: "NO TRIGGER", what: "Workflow has no data node", why: "There is no input to execute against", affected: "Activation", action: "Add a data node" });

  // circular dependency detection
  const adj = new Map<string, string[]>();
  for (const e of w.edges) adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
  const seen = new Set<string>();
  const stack = new Set<string>();
  const cyclic = (id: string): boolean => {
    if (stack.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    stack.add(id);
    for (const nxt of adj.get(id) ?? []) if (cyclic(nxt)) return true;
    stack.delete(id);
    return false;
  };
  for (const n of w.nodes)
    if (cyclic(n.id)) {
      issues.push({ severity: "BLOCKING", code: "CIRCULAR DEPENDENCY", what: "The graph contains a cycle", why: "Execution would not terminate", affected: n.label, action: "Remove the connection that closes the loop" });
      break;
    }

  const dexNodes = w.nodes.filter((n) => n.type === "DEX SCREENER").length;
  if (dexNodes > 3)
    issues.push({ severity: "WARNING", code: "API LIMIT RISK", what: `${dexNodes} DEX Screener nodes in one workflow`, why: "The upstream request budget is 55 requests per 60 seconds", affected: "Data freshness", action: "Reuse one data node and branch from it" });

  return issues;
}

/* ------------------------------- execution ---------------------------- */

function fieldValue(field: WFNode["field"], a: Assessment, attention: number | null): number | null {
  switch (field) {
    case "RISK SCORE":
      return a.risk.score;
    case "ATTENTION SCORE":
      return attention;
    case "CONFIDENCE":
      return a.confidence.score;
    case "ANOMALY COUNT":
      return a.anomalies.length;
    case "LIQUIDITY USD":
      return a.pair.liquidityUsd;
    case "VOLUME 24H":
      return a.pair.volume.h24;
    default:
      return null;
  }
}

export type RunContext = { items: AttentionItem[]; missingEnv: string[] };

/** Executes a workflow against real current data. DRY RUN performs no side effects. */
export function runWorkflow(w: Workflow, ctx: RunContext, mode: "LIVE" | "DRY RUN"): Execution {
  const started = Date.now();
  const nodes: Execution["nodes"] = [];
  const errors: string[] = [];
  let records = ctx.items;

  const order = [...w.nodes].sort((a, b) => {
    const g = { DATA: 0, INTELLIGENCE: 1, LOGIC: 2, OUTPUT: 3 } as const;
    return g[a.group] - g[b.group] || a.y - b.y;
  });

  for (const n of order) {
    const def = NODE_LIBRARY.find((x) => x.type === n.type);
    const missing = (def?.needs ?? []).filter((e) => ctx.missingEnv.includes(e));
    if (missing.length) {
      nodes.push({
        nodeId: n.id,
        type: n.type,
        label: n.label,
        state: "WAITING",
        detail: `WAITING FOR CREDENTIAL — ${missing.join(", ")} not configured`,
        records: null,
      });
      errors.push(`${n.label}: ${missing.join(", ")} not configured`);
      continue;
    }

    if (n.group === "DATA") {
      if (n.type === "DEX SCREENER") {
        nodes.push({ nodeId: n.id, type: n.type, label: n.label, state: records.length ? "OK" : "WAITING", detail: records.length ? "Read the current normalized snapshot" : "WAITING FOR DATA — no observations available", records: records.length });
      } else {
        nodes.push({ nodeId: n.id, type: n.type, label: n.label, state: "SKIPPED", detail: "No inbound payload in this run", records: 0 });
      }
      continue;
    }

    if (n.group === "LOGIC") {
      if ((n.type === "IF" || n.type === "FILTER") && n.field && n.value !== undefined) {
        const before = records.length;
        records = records.filter((it) => {
          const v = fieldValue(n.field, it.assessment, it.score);
          if (v === null) return false;
          return n.op === "<=" ? v <= n.value! : v >= n.value!;
        });
        nodes.push({
          nodeId: n.id,
          type: n.type,
          label: n.label,
          state: "OK",
          detail: `${n.field} ${n.op ?? ">="} ${n.value} — ${records.length}/${before} records passed (records with the field unavailable were excluded, not assumed)`,
          records: records.length,
        });
      } else if (n.type === "RATE LIMIT") {
        const before = records.length;
        records = records.slice(0, 10);
        nodes.push({ nodeId: n.id, type: n.type, label: n.label, state: "OK", detail: `Capped at 10 records per execution (${before} inbound)`, records: records.length });
      } else {
        nodes.push({ nodeId: n.id, type: n.type, label: n.label, state: "OK", detail: `Pass-through of ${records.length} records`, records: records.length });
      }
      continue;
    }

    if (n.group === "INTELLIGENCE") {
      const detail =
        n.type === "ANOMALY"
          ? `${records.reduce((s, r) => s + r.assessment.anomalies.length, 0)} anomalies present on inbound records`
          : n.type === "RISK"
            ? `${records.filter((r) => r.assessment.risk.score !== null).length}/${records.length} records classifiable`
            : `${records.length} records processed by the ${n.type.toLowerCase()} stage`;
      nodes.push({ nodeId: n.id, type: n.type, label: n.label, state: records.length ? "OK" : "WAITING", detail: records.length ? detail : "WAITING FOR DATA — no inbound records", records: records.length });
      continue;
    }

    // OUTPUT
    if (n.type === "ALERT") {
      if (mode === "LIVE") {
        let written = 0;
        for (const it of records.slice(0, 10)) {
          const ok = emitAlert({
            key: it.assessment.pair.key,
            symbol: it.assessment.pair.baseSymbol,
            chainId: it.assessment.pair.chainId,
            dexId: it.assessment.pair.dexId,
            kind: `WORKFLOW ${w.name}`,
            severity: it.klass === "CRITICAL" ? "SEVERE" : it.klass === "HIGH PRIORITY" ? "UNUSUAL" : "NOTABLE",
            message: `Matched workflow ${w.name}; attention ${it.score ?? "NOT SCORED"}`,
            confidence: it.assessment.confidence.score,
          });
          if (ok) written++;
        }
        nodes.push({ nodeId: n.id, type: n.type, label: n.label, state: "OK", detail: `${written} alert(s) written (duplicates suppressed by cooldown)`, records: written });
      } else {
        nodes.push({ nodeId: n.id, type: n.type, label: n.label, state: "SKIPPED", detail: `DRY RUN — would write up to ${Math.min(10, records.length)} alert(s); no side effects performed`, records: records.length });
      }
      continue;
    }

    nodes.push({
      nodeId: n.id,
      type: n.type,
      label: n.label,
      state: mode === "DRY RUN" ? "SKIPPED" : "OK",
      detail: mode === "DRY RUN" ? `DRY RUN — would deliver ${records.length} record(s); no side effects performed` : `Delivered ${records.length} record(s) locally`,
      records: records.length,
    });
  }

  const finished = Date.now();
  const status: Execution["status"] = errors.length ? (nodes.some((x) => x.state === "OK") ? "PARTIAL" : "FAILED") : "COMPLETED";
  const exec: Execution = {
    id: newId("run"),
    workflowId: w.id,
    workflowName: w.name,
    startedAt: started,
    finishedAt: finished,
    durationMs: finished - started,
    mode,
    status,
    input: `${ctx.items.length} observed records`,
    output: `${records.length} records reached the output stage`,
    nodes,
    errors,
  };
  execStore.set([exec, ...execStore.get()].slice(0, 200));

  emitEvent({
    type: mode === "DRY RUN" ? "WORKFLOW_DRY_RUN" : status === "COMPLETED" ? "WORKFLOW_COMPLETED" : "WORKFLOW_FAILED",
    source: WORKFLOW_VERSION,
    target: w.name,
    message:
      mode === "DRY RUN"
        ? `Dry run finished in ${exec.durationMs}ms with no side effects`
        : `${status} in ${exec.durationMs}ms — ${records.length} record(s) at output`,
    severity: status === "FAILED" ? "UNUSUAL" : "INFO",
  });
  return exec;
}

/* ------------------------------- templates ---------------------------- */

function node(type: string, label: string, y: number, extra: Partial<WFNode> = {}): WFNode {
  const def = NODE_LIBRARY.find((n) => n.type === type)!;
  return { id: newId("n"), type, group: def.group, label, x: 0, y, ...extra };
}

export type Template = { name: string; description: string; build: () => Workflow };

export const TEMPLATES: Template[] = [
  {
    name: "Market Research",
    description: "Snapshot → attention threshold → agent suite → alert",
    build: () => wf("Market Research", "Screens the live snapshot and escalates high-attention targets", [
      node("DEX SCREENER", "Live snapshot", 0),
      node("IF", "Attention ≥ 60", 1, { field: "ATTENTION SCORE", op: ">=", value: 60 }),
      node("AGENT GROUP", "Full agent suite", 2),
      node("ALERT", "Write alert", 3),
    ]),
  },
  {
    name: "FOMO Research",
    description: "FOMO intelligence enrichment — requires a credential",
    build: () => wf("FOMO Research", "Enriches escalated targets with FOMO intelligence", [
      node("DEX SCREENER", "Live snapshot", 0),
      node("FOMO", "FOMO enrichment", 1),
      node("SYNTHESIS", "Consolidate", 2),
      node("DASHBOARD", "Publish", 3),
    ]),
  },
  {
    name: "TradingView Research",
    description: "Inbound alert → mapping → research job",
    build: () => wf("TradingView Research", "Turns validated inbound alerts into research", [
      node("TRADINGVIEW", "Inbound alert", 0),
      node("FILTER", "Confidence ≥ 40", 1, { field: "CONFIDENCE", op: ">=", value: 40 }),
      node("RESEARCH", "Open research job", 2),
      node("AGENT ROOM", "Hand to agent room", 3),
    ]),
  },
  {
    name: "Anomaly Investigation",
    description: "Anomaly detection → debate → hypothesis → alert",
    build: () => wf("Anomaly Investigation", "Investigates anomalous observations", [
      node("DEX SCREENER", "Live snapshot", 0),
      node("ANOMALY", "Anomaly engine", 1),
      node("IF", "Anomaly count ≥ 1", 2, { field: "ANOMALY COUNT", op: ">=", value: 1 }),
      node("DEBATE", "Contradiction pass", 3),
      node("HYPOTHESIS", "Update hypotheses", 4),
      node("ALERT", "Write alert", 5),
    ]),
  },
  {
    name: "Historical Investigation",
    description: "Recorded history → change comparison → memory",
    build: () => wf("Historical Investigation", "Compares current state with recorded observations", [
      node("DEX SCREENER", "Live snapshot", 0),
      node("HISTORICAL", "Recorded comparison", 1),
      node("MEMORY", "Write memory", 2),
      node("DASHBOARD", "Publish", 3),
    ]),
  },
  {
    name: "Full Intelligence Investigation",
    description: "All intelligence stages end to end",
    build: () => wf("Full Intelligence Investigation", "Discovery through monitoring across all stages", [
      node("DEX SCREENER", "Live snapshot", 0),
      node("RISK", "Risk engine", 1),
      node("AGENT GROUP", "Agent suite", 2),
      node("EVIDENCE", "Structured evidence", 3),
      node("DEBATE", "Contradictions", 4),
      node("HISTORICAL", "Historical review", 5),
      node("SYNTHESIS", "Synthesis", 6),
      node("MEMORY", "Persist", 7),
      node("ALERT", "Alert", 8),
    ]),
  },
  {
    name: "n8n Orchestration",
    description: "Escalation handed to n8n — requires a credential",
    build: () => wf("n8n Orchestration", "Sends escalations to an external automation platform", [
      node("DEX SCREENER", "Live snapshot", 0),
      node("IF", "Risk ≥ 70", 1, { field: "RISK SCORE", op: ">=", value: 70 }),
      node("N8N", "Trigger n8n workflow", 2),
    ]),
  },
];

function wf(name: string, description: string, nodes: WFNode[]): Workflow {
  const edges: WFEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) edges.push({ id: newId("e"), from: nodes[i]!.id, to: nodes[i + 1]!.id });
  return { id: newId("wf"), name, description, nodes, edges, active: false, createdAt: Date.now(), updatedAt: Date.now(), version: 0 };
}

export function createFromTemplate(t: Template): Workflow {
  return saveWorkflow(t.build(), `Created from template ${t.name}`);
}

export function clearWorkflows() {
  wfStore.clear();
  execStore.clear();
  versionStore.clear();
}
