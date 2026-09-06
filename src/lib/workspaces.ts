/**
 * WORKSPACES, CUSTOM DASHBOARDS AND USER PREFERENCES
 *
 * Workspace and widget configuration persists locally. Widgets render real
 * subsystem data; a widget whose data source is not configured says so.
 */

import { createStore, newId } from "./persist";

export const WORKSPACE_VERSION = "workspaces v1.0";

export type WidgetType =
  | "ATTENTION"
  | "RESEARCH"
  | "AGENT ROOM"
  | "OPPORTUNITY ENGINE"
  | "MARKET MAP"
  | "NEURAL LINK"
  | "ANOMALIES"
  | "TRENDS"
  | "WATCHLIST"
  | "SYSTEM HEALTH"
  | "INTEGRATION HEALTH"
  | "WORKFLOW STATUS"
  | "MEMORY"
  | "HISTORICAL TIMELINE"
  | "AGENT PERFORMANCE"
  | "API USAGE"
  | "OPEN QUESTIONS"
  | "INTELLIGENCE STREAM";

export const ALL_WIDGETS: WidgetType[] = [
  "ATTENTION",
  "RESEARCH",
  "AGENT ROOM",
  "OPPORTUNITY ENGINE",
  "MARKET MAP",
  "NEURAL LINK",
  "ANOMALIES",
  "TRENDS",
  "WATCHLIST",
  "SYSTEM HEALTH",
  "INTEGRATION HEALTH",
  "WORKFLOW STATUS",
  "MEMORY",
  "HISTORICAL TIMELINE",
  "AGENT PERFORMANCE",
  "API USAGE",
  "OPEN QUESTIONS",
  "INTELLIGENCE STREAM",
];

export type Widget = { id: string; type: WidgetType; span: 1 | 2 | 3; height: "S" | "M" | "L" };

export type Workspace = {
  id: string;
  name: string;
  widgets: Widget[];
  createdAt: number;
  updatedAt: number;
};

const DEFAULT_WORKSPACES: Workspace[] = [
  { name: "Main Command Center", widgets: ["ATTENTION", "INTELLIGENCE STREAM", "ANOMALIES", "SYSTEM HEALTH"] },
  { name: "Market Research", widgets: ["MARKET MAP", "TRENDS", "WATCHLIST", "OPPORTUNITY ENGINE"] },
  { name: "Narrative Lab", widgets: ["TRENDS", "OPEN QUESTIONS", "MEMORY"] },
  { name: "Risk Lab", widgets: ["ANOMALIES", "ATTENTION", "AGENT ROOM"] },
  { name: "Agent Monitoring", widgets: ["AGENT PERFORMANCE", "AGENT ROOM", "RESEARCH"] },
  { name: "Integration Center", widgets: ["INTEGRATION HEALTH", "WORKFLOW STATUS", "API USAGE"] },
  { name: "Workflow Lab", widgets: ["WORKFLOW STATUS", "NEURAL LINK", "INTELLIGENCE STREAM"] },
  { name: "Historical Research", widgets: ["HISTORICAL TIMELINE", "MEMORY", "OPEN QUESTIONS"] },
  { name: "System Health", widgets: ["SYSTEM HEALTH", "API USAGE", "INTEGRATION HEALTH"] },
].map((w, i) => ({
  id: `ws-default-${i}`,
  name: w.name,
  widgets: (w.widgets as WidgetType[]).map((t, j) => ({ id: `w-${i}-${j}`, type: t, span: 1 as const, height: "M" as const })),
  createdAt: 0,
  updatedAt: 0,
}));

const store = createStore<{ workspaces: Workspace[]; activeId: string } | null>("dmi.workspaces.v1", null);
export const subscribeWorkspaces = store.subscribe;

function state() {
  const cur = store.get();
  if (cur && cur.workspaces.length) return cur;
  return { workspaces: DEFAULT_WORKSPACES, activeId: DEFAULT_WORKSPACES[0]!.id };
}

export function getWorkspaces(): Workspace[] {
  return state().workspaces;
}

export function activeWorkspace(): Workspace {
  const s = state();
  return s.workspaces.find((w) => w.id === s.activeId) ?? s.workspaces[0]!;
}

export function setActiveWorkspace(id: string) {
  store.set({ ...state(), activeId: id });
}

export function createWorkspace(name: string): Workspace {
  const ws: Workspace = { id: newId("ws"), name, widgets: [], createdAt: Date.now(), updatedAt: Date.now() };
  const s = state();
  store.set({ workspaces: [...s.workspaces, ws], activeId: ws.id });
  return ws;
}

export function renameWorkspace(id: string, name: string) {
  const s = state();
  store.set({ ...s, workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name, updatedAt: Date.now() } : w)) });
}

export function duplicateWorkspace(id: string) {
  const s = state();
  const src = s.workspaces.find((w) => w.id === id);
  if (!src) return;
  const copy: Workspace = {
    ...src,
    id: newId("ws"),
    name: `${src.name} (copy)`,
    widgets: src.widgets.map((w) => ({ ...w, id: newId("w") })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set({ workspaces: [...s.workspaces, copy], activeId: copy.id });
}

export function deleteWorkspace(id: string) {
  const s = state();
  const workspaces = s.workspaces.filter((w) => w.id !== id);
  if (!workspaces.length) return;
  store.set({ workspaces, activeId: s.activeId === id ? workspaces[0]!.id : s.activeId });
}

export function moveWorkspace(id: string, dir: -1 | 1) {
  const s = state();
  const i = s.workspaces.findIndex((w) => w.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= s.workspaces.length) return;
  const next = [...s.workspaces];
  const a = next[i]!;
  next[i] = next[j]!;
  next[j] = a;
  store.set({ ...s, workspaces: next });
}

export function addWidget(workspaceId: string, type: WidgetType) {
  const s = state();
  store.set({
    ...s,
    workspaces: s.workspaces.map((w) =>
      w.id === workspaceId
        ? { ...w, updatedAt: Date.now(), widgets: [...w.widgets, { id: newId("w"), type, span: 1, height: "M" }] }
        : w,
    ),
  });
}

export function removeWidget(workspaceId: string, widgetId: string) {
  const s = state();
  store.set({
    ...s,
    workspaces: s.workspaces.map((w) =>
      w.id === workspaceId ? { ...w, updatedAt: Date.now(), widgets: w.widgets.filter((x) => x.id !== widgetId) } : w,
    ),
  });
}

export function updateWidget(workspaceId: string, widgetId: string, patch: Partial<Pick<Widget, "span" | "height">>) {
  const s = state();
  store.set({
    ...s,
    workspaces: s.workspaces.map((w) =>
      w.id === workspaceId ? { ...w, updatedAt: Date.now(), widgets: w.widgets.map((x) => (x.id === widgetId ? { ...x, ...patch } : x)) } : w,
    ),
  });
}

export function moveWidget(workspaceId: string, widgetId: string, dir: -1 | 1) {
  const s = state();
  store.set({
    ...s,
    workspaces: s.workspaces.map((w) => {
      if (w.id !== workspaceId) return w;
      const i = w.widgets.findIndex((x) => x.id === widgetId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= w.widgets.length) return w;
      const next = [...w.widgets];
      const a = next[i]!;
      next[i] = next[j]!;
      next[j] = a;
      return { ...w, widgets: next, updatedAt: Date.now() };
    }),
  });
}

/* ----------------------------- preferences ---------------------------- */

export type Preferences = {
  density: "COMPACT" | "NORMAL" | "SPACIOUS";
  animation: "FULL" | "REDUCED" | "OFF";
  accent: "CYAN" | "VIOLET" | "ELECTRIC" | "AMBER";
  hiddenAgents: string[];
  notifySeverity: "ALL" | "NOTABLE" | "UNUSUAL" | "SEVERE";
  streamAutoScroll: boolean;
};

const PREF_DEFAULTS: Preferences = {
  density: "NORMAL",
  animation: "FULL",
  accent: "CYAN",
  hiddenAgents: [],
  notifySeverity: "NOTABLE",
  streamAutoScroll: true,
};

const prefStore = createStore<Preferences>("dmi.prefs.v1", PREF_DEFAULTS);
export const subscribePrefs = prefStore.subscribe;
export const getPrefs = prefStore.get;

export function setPrefs(patch: Partial<Preferences>) {
  prefStore.update((cur) => ({ ...cur, ...patch }));
}

export function resetPrefs() {
  prefStore.set(PREF_DEFAULTS);
}
