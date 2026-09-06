/**
 * UNIVERSAL SEARCH
 *
 * Searches the entities this application actually holds. Categories that the
 * current data sources do not provide (wallets, traders) are reported as
 * UNSUPPORTED BY CONFIGURED SOURCES rather than returning invented results.
 */

import type { Assessment } from "./dex-types";
import { getJobs } from "./jobs";
import { getMemory } from "./memory";
import { getHypotheses } from "./hypotheses";
import { getContradictions } from "./contradictions";
import { getQuestions } from "./questions";
import { getWorkflows } from "./workflows";
import { getAlerts, getWatchlist, getNote } from "./local-store";

export type SearchHit = {
  category:
    | "PAIR"
    | "TOKEN"
    | "CHAIN"
    | "RESEARCH JOB"
    | "AGENT"
    | "EVIDENCE"
    | "HYPOTHESIS"
    | "CONTRADICTION"
    | "QUESTION"
    | "MEMORY"
    | "WORKFLOW"
    | "INTEGRATION"
    | "ALERT"
    | "NOTE"
    | "NARRATIVE";
  label: string;
  detail: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

export const UNSUPPORTED_CATEGORIES = [
  { category: "WALLET", note: "UNSUPPORTED BY CONFIGURED SOURCES — no wallet endpoint is available" },
  { category: "TRADER", note: "UNSUPPORTED BY CONFIGURED SOURCES — no per-trader endpoint is available" },
];

export function universalSearch(q: string, assessments: Assessment[], metas: string[] = []): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 1) return [];
  const has = (s: string | null | undefined) => Boolean(s && s.toLowerCase().includes(needle));
  const hits: SearchHit[] = [];

  for (const a of assessments) {
    if (has(a.pair.baseSymbol) || has(a.pair.baseName) || has(a.pair.pairAddress) || has(a.pair.baseAddress)) {
      hits.push({
        category: "PAIR",
        label: `${a.pair.baseSymbol}/${a.pair.quoteSymbol}`,
        detail: `${a.pair.chainId} · ${a.pair.dexId} · ${a.risk.band}`,
        to: "/pair/$chainId/$pairId",
        params: { chainId: a.pair.chainId, pairId: a.pair.pairAddress },
      });
    }
  }

  const chains = [...new Set(assessments.map((a) => a.pair.chainId))].filter(has);
  for (const c of chains) hits.push({ category: "CHAIN", label: c, detail: `${assessments.filter((a) => a.pair.chainId === c).length} observed pairs`, to: "/markets" });

  for (const j of getJobs()) {
    if (has(j.targetLabel) || has(j.reason) || has(j.id))
      hits.push({ category: "RESEARCH JOB", label: j.targetLabel, detail: `${j.status} · ${j.origin}`, to: "/research" });
  }

  for (const a of new Set(getJobs().flatMap((j) => j.assignedAgents))) {
    if (has(a)) hits.push({ category: "AGENT", label: a, detail: "Agent reading and performance", to: "/performance" });
  }

  for (const r of getMemory()) {
    if (has(r.summary) || has(r.targetLabel) || has(r.source))
      hits.push({
        category: r.kind === "EVIDENCE" ? "EVIDENCE" : "MEMORY",
        label: r.summary.slice(0, 70),
        detail: `${r.kind} · ${r.source}`,
        to: "/memory",
      });
  }

  for (const h of getHypotheses()) if (has(h.statement) || has(h.targetLabel)) hits.push({ category: "HYPOTHESIS", label: h.statement.slice(0, 70), detail: `${h.status} · ${h.targetLabel}`, to: "/hypotheses" });
  for (const c of getContradictions()) if (has(c.topic) || has(c.targetLabel)) hits.push({ category: "CONTRADICTION", label: `${c.topic} — ${c.targetLabel}`, detail: c.status, to: "/contradictions" });
  for (const qq of getQuestions()) if (has(qq.question) || has(qq.targetLabel)) hits.push({ category: "QUESTION", label: qq.question.slice(0, 80), detail: `${qq.kind} · ${qq.status}`, to: "/questions" });
  for (const w of getWorkflows()) if (has(w.name) || has(w.description)) hits.push({ category: "WORKFLOW", label: w.name, detail: `${w.nodes.length} nodes · ${w.active ? "ACTIVE" : "INACTIVE"}`, to: "/workflows" });
  for (const al of getAlerts()) if (has(al.symbol) || has(al.kind) || has(al.message)) hits.push({ category: "ALERT", label: `${al.symbol} — ${al.kind}`, detail: al.severity, to: "/alerts" });

  for (const w of getWatchlist()) {
    const note = getNote(w.key);
    if (has(note)) hits.push({ category: "NOTE", label: `${w.symbol} note`, detail: note.slice(0, 80), to: "/watchlist" });
  }

  for (const m of metas) if (has(m)) hits.push({ category: "NARRATIVE", label: m, detail: "Trending metadata reported by the source", to: "/trends" });

  for (const name of ["DEX SCREENER", "FOMO", "TRADINGVIEW", "N8N", "SUPABASE"]) {
    if (has(name)) hits.push({ category: "INTEGRATION", label: name, detail: "Integration status and capabilities", to: "/integrations" });
  }

  return hits.slice(0, 60);
}
