import { Link } from "@tanstack/react-router";

import { Panel, Tag } from "@/components/kit";
import { KV, StatePill, toneFor } from "@/components/kit2";
import type { WidgetType } from "@/lib/workspaces";
import type { AttentionItem } from "@/lib/attention";
import type { ResearchJob } from "@/lib/jobs";
import type { SystemEvent } from "@/lib/events";
import type { OpenQuestion } from "@/lib/questions";
import type { MemoryRecord } from "@/lib/memory";
import { usd, clockOf } from "@/lib/format";

export type WidgetData = {
  queue: AttentionItem[];
  jobs: ResearchJob[];
  events: SystemEvent[];
  questions: OpenQuestion[];
  memory: MemoryRecord[];
  api: { requests: number; cacheHits: number; errors: number } | null;
  historyPoints: number;
};

/** Renders a dashboard widget from data the terminal already holds. */
export function WorkspaceWidget({ type, data }: { type: WidgetType; data: WidgetData }) {
  const { queue, jobs, events, questions, memory, api } = data;

  const body = (() => {
    switch (type) {
      case "ATTENTION":
      case "OPPORTUNITY ENGINE":
        return queue.length === 0 ? (
          <p className="text-xs text-unknown">WAITING FOR DATA</p>
        ) : (
          <ul className="space-y-1.5">
            {queue.slice(0, 6).map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-2">
                <Link to="/room" search={{ key: i.key }} className="num truncate text-xs text-foreground hover:text-cyan">
                  {i.assessment.pair.baseSymbol}/{i.assessment.pair.quoteSymbol}
                </Link>
                <span className="flex items-center gap-1.5">
                  <StatePill label={i.klass} tone={toneFor(i.klass)} />
                  <span className="num text-[10px] text-unknown">{i.score ?? "NOT SCORED"}</span>
                </span>
              </li>
            ))}
          </ul>
        );
      case "RESEARCH":
        return jobs.length === 0 ? (
          <p className="text-xs text-unknown">NO RESEARCH JOBS OPEN</p>
        ) : (
          <ul className="space-y-1.5">
            {jobs.slice(0, 6).map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-2">
                <span className="num truncate text-xs">{j.targetLabel}</span>
                <StatePill label={j.status} tone={toneFor(j.status)} />
              </li>
            ))}
          </ul>
        );
      case "AGENT ROOM":
        return queue[0] ? (
          <ul className="space-y-1">
            {queue[0].assessment.agents.slice(0, 6).map((g) => (
              <li key={g.agentId} className="flex items-center justify-between gap-2">
                <span className="num truncate text-[11px]">{g.agentNumber} {g.name}</span>
                <StatePill label={g.vote} tone={toneFor(g.vote)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-unknown">WAITING FOR DATA</p>
        );
      case "MARKET MAP":
        return (
          <>
            <KV label="OBSERVED MARKETS" value={String(queue.length)} />
            <KV label="CHAINS" value={String(new Set(queue.map((i) => i.assessment.pair.chainId)).size)} />
            <KV label="TOTAL OBSERVED LIQUIDITY" value={usd(queue.reduce((s, i) => s + (i.assessment.pair.liquidityUsd ?? 0), 0))} />
          </>
        );
      case "ANOMALIES":
        return (
          <ul className="space-y-1.5">
            {queue.flatMap((i) => i.assessment.anomalies.map((a) => ({ i, a }))).slice(0, 6).map(({ i, a }, k) => (
              <li key={k} className="flex items-center justify-between gap-2">
                <span className="num truncate text-[11px]">{i.assessment.pair.baseSymbol} · {a.metric}</span>
                <StatePill label={a.severity} tone={toneFor(a.severity)} />
              </li>
            )) || null}
            {queue.every((i) => i.assessment.anomalies.length === 0) && <p className="text-xs text-unknown">NO ANOMALIES DETECTED</p>}
          </ul>
        );
      case "OPEN QUESTIONS":
        return questions.length === 0 ? (
          <p className="text-xs text-unknown">NO OPEN QUESTIONS</p>
        ) : (
          <ul className="space-y-1.5">
            {questions.slice(0, 5).map((q) => (
              <li key={q.id} className="text-[11px] text-muted-foreground">— {q.question}</li>
            ))}
          </ul>
        );
      case "INTELLIGENCE STREAM":
        return events.length === 0 ? (
          <p className="text-xs text-unknown">NO EVENTS YET</p>
        ) : (
          <ul className="space-y-1">
            {events.slice(0, 8).map((e) => (
              <li key={e.id} className="flex gap-2 text-[11px]">
                <span className="num shrink-0 text-unknown">{clockOf(e.t)}</span>
                <span className="truncate text-muted-foreground">{e.message}</span>
              </li>
            ))}
          </ul>
        );
      case "MEMORY":
        return (
          <>
            <KV label="RECORDS STORED" value={String(memory.length)} />
            <KV label="MOST RECENT" value={memory[0] ? clockOf(memory[0].t) : "NONE"} />
            <KV label="DURABILITY" value="WAITING FOR SUPABASE" />
          </>
        );
      case "HISTORICAL TIMELINE":
        return (
          <>
            <KV label="RECORDED OBSERVATION POINTS" value={String(data.historyPoints)} />
            <KV label="TRACKED TARGETS" value={String(queue.length)} />
            <Link to="/timemachine" className="num text-[10px] tracking-[0.12em] text-cyan">OPEN TIME MACHINE →</Link>
          </>
        );
      case "API USAGE":
        return api ? (
          <>
            <KV label="REQUESTS" value={String(api.requests)} />
            <KV label="CACHE HITS" value={String(api.cacheHits)} />
            <KV label="ERRORS" value={String(api.errors)} />
          </>
        ) : (
          <p className="text-xs text-unknown">UNAVAILABLE — no health report yet</p>
        );
      case "WATCHLIST":
        return <Link to="/watchlist" className="num text-[10px] tracking-[0.12em] text-cyan">OPEN WATCHLIST →</Link>;
      case "TRENDS":
        return <Link to="/trends" className="num text-[10px] tracking-[0.12em] text-cyan">OPEN TRENDS →</Link>;
      case "SYSTEM HEALTH":
        return <Link to="/system" className="num text-[10px] tracking-[0.12em] text-cyan">OPEN SYSTEM HEALTH →</Link>;
      case "INTEGRATION HEALTH":
        return <Link to="/integrations" className="num text-[10px] tracking-[0.12em] text-cyan">OPEN INTEGRATIONS →</Link>;
      case "WORKFLOW STATUS":
        return <Link to="/workflows" className="num text-[10px] tracking-[0.12em] text-cyan">OPEN WORKFLOW STUDIO →</Link>;
      case "AGENT PERFORMANCE":
        return <Link to="/performance" className="num text-[10px] tracking-[0.12em] text-cyan">OPEN PERFORMANCE CENTER →</Link>;
      case "NEURAL LINK":
        return <Link to="/neural" className="num text-[10px] tracking-[0.12em] text-cyan">OPEN NEURAL LINK →</Link>;
      default:
        return <p className="text-xs text-unknown">NOT AVAILABLE</p>;
    }
  })();

  return (
    <Panel title={type} right={<Tag kind="CALCULATED" />}>
      {body}
    </Panel>
  );
}
