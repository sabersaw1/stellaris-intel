/**
 * ENTITY GRAPH (pure, deterministic, testable)
 *
 * X ACCOUNT -> TRADER -> WALLET -> TOKEN -> PAIR -> NARRATIVE
 *
 * The graph is built only from observed edges. It never connects two entities
 * because they "probably" belong together, and every edge keeps its source and
 * observation time so the market map can explain any line it draws.
 */

export type EntityKindG = "X_ACCOUNT" | "TRADER" | "WALLET" | "TOKEN" | "PAIR" | "NARRATIVE";

export type GraphNode = {
  id: string;
  kind: EntityKindG;
  label: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  relation: "CONTROLS" | "OPERATES" | "TRADED" | "QUOTES" | "BELONGS_TO";
  source: string;
  observedAt: number | null;
};

export type EntityGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type GraphObservations = {
  accounts: { id: string; handle: string; traderId: string | null; source: string; observedAt: number | null }[];
  traders: { id: string; label: string; source: string }[];
  wallets: { id: string; address: string; traderId: string | null; source: string; observedAt: number | null }[];
  walletTrades: { walletId: string; tokenId: string; source: string; observedAt: number | null }[];
  tokens: { id: string; label: string }[];
  pairs: { id: string; label: string; tokenId: string }[];
  narratives: { theme: string; tokenIds: string[] }[];
};

const node = (id: string, kind: EntityKindG, label: string): GraphNode => ({ id, kind, label });

export function buildEntityGraph(o: GraphObservations): EntityGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const add = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };

  for (const t of o.tokens) add(node(`token:${t.id}`, "TOKEN", t.label));
  for (const t of o.traders) add(node(`trader:${t.id}`, "TRADER", t.label));

  for (const a of o.accounts) {
    add(node(`x:${a.id}`, "X_ACCOUNT", `@${a.handle}`));
    if (a.traderId) {
      add(node(`trader:${a.traderId}`, "TRADER", a.traderId));
      edges.push({ from: `x:${a.id}`, to: `trader:${a.traderId}`, relation: "OPERATES", source: a.source, observedAt: a.observedAt });
    }
  }

  for (const w of o.wallets) {
    add(node(`wallet:${w.id}`, "WALLET", w.address));
    if (w.traderId) {
      add(node(`trader:${w.traderId}`, "TRADER", w.traderId));
      edges.push({ from: `trader:${w.traderId}`, to: `wallet:${w.id}`, relation: "CONTROLS", source: w.source, observedAt: w.observedAt });
    }
  }

  for (const tr of o.walletTrades) {
    add(node(`wallet:${tr.walletId}`, "WALLET", tr.walletId));
    add(node(`token:${tr.tokenId}`, "TOKEN", tr.tokenId));
    edges.push({ from: `wallet:${tr.walletId}`, to: `token:${tr.tokenId}`, relation: "TRADED", source: tr.source, observedAt: tr.observedAt });
  }

  for (const p of o.pairs) {
    add(node(`pair:${p.id}`, "PAIR", p.label));
    add(node(`token:${p.tokenId}`, "TOKEN", p.tokenId));
    edges.push({ from: `token:${p.tokenId}`, to: `pair:${p.id}`, relation: "QUOTES", source: "dexscreener", observedAt: null });
  }

  for (const n of o.narratives) {
    add(node(`narrative:${n.theme}`, "NARRATIVE", n.theme));
    for (const tokenId of n.tokenIds) {
      add(node(`token:${tokenId}`, "TOKEN", tokenId));
      edges.push({ from: `token:${tokenId}`, to: `narrative:${n.theme}`, relation: "BELONGS_TO", source: "narrative-engine", observedAt: null });
    }
  }

  // One edge per (from, to, relation); repeated observations never duplicate lines.
  const seen = new Set<string>();
  const unique = edges.filter((e) => {
    const k = `${e.from}|${e.to}|${e.relation}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { nodes: [...nodes.values()], edges: unique };
}

/** Every entity reachable from a token, for the token dossier's relationship block. */
export function neighboursOfToken(graph: EntityGraph, tokenId: string): GraphNode[] {
  const id = `token:${tokenId}`;
  const ids = new Set<string>();
  for (const e of graph.edges) {
    if (e.from === id) ids.add(e.to);
    if (e.to === id) ids.add(e.from);
  }
  return graph.nodes.filter((n) => ids.has(n.id));
}
