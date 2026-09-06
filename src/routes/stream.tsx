import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, FreshnessBadge, StatePill, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { EVENT_BUS_VERSION, clearEvents, eventRate, eventsByType, getEvents, subscribeEvents, type EventSeverity } from "@/lib/events";
import { getPrefs, setPrefs, subscribePrefs } from "@/lib/workspaces";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stream")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Intelligence Stream — Market Intelligence OS" },
      {
        name: "description",
        content: "A continuous, filterable feed of what the system is actually doing: observations, attention, research passes, agent findings, contradictions and integration events.",
      },
      { property: "og:title", content: "Intelligence Stream — Market Intelligence OS" },
      { property: "og:description", content: "Every line is a real recorded event with its source, target and time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StreamPage,
});

const SEVERITIES: (EventSeverity | "ALL")[] = ["ALL", "INFO", "NOTABLE", "UNUSUAL", "SEVERE"];

function StreamPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeEvents);
  const prefTick = useStoreTick(subscribePrefs);
  const events = useMemo(() => getEvents(), [tick, brain.cycle]);
  const byType = useMemo(() => eventsByType(), [tick]);
  const rate = useMemo(() => eventRate(300_000), [tick]);
  const [sev, setSev] = useState<EventSeverity | "ALL">("ALL");
  const [type, setType] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const prefs = useMemo(() => getPrefs(), [prefTick]);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = events.filter(
    (e) =>
      (sev === "ALL" || e.severity === sev) &&
      (type === "ALL" || e.type === type) &&
      (q.trim() === "" || `${e.message} ${e.source} ${e.target ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
  );

  useEffect(() => {
    if (prefs.streamAutoScroll && listRef.current) listRef.current.scrollTop = 0;
  }, [rows.length, prefs.streamAutoScroll]);

  return (
    <TerminalShell>
      <SectionTitle sub="This is the system's own activity log. It only contains events that actually occurred; nothing is generated to make the feed look busy.">
        INTELLIGENCE STREAM
      </SectionTitle>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="EVENTS STORED" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{events.length}</p>
        </Panel>
        <Panel title="EVENTS LAST 5 MIN" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{rate}</p>
        </Panel>
        <Panel title="MOST RECENT" right={<FreshnessBadge observedAt={events[0]?.t ?? null} />}>
          <p className="num text-xs">{events[0] ? clockOf(events[0].t) : "NO EVENTS YET"}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{events[0]?.message ?? "waiting for the first cycle"}</p>
        </Panel>
        <Panel title="FEED" right={<Tag kind="VISUAL" />}>
          <div className="flex flex-wrap gap-2">
            <Btn tone={prefs.streamAutoScroll ? "primary" : "default"} onClick={() => setPrefs({ streamAutoScroll: !prefs.streamAutoScroll })}>
              {prefs.streamAutoScroll ? "AUTO-SCROLL ON" : "AUTO-SCROLL OFF"}
            </Btn>
            <Btn tone="danger" onClick={() => clearEvents()}>CLEAR</Btn>
          </div>
        </Panel>
      </div>

      <Panel className="mb-4" title="FILTER" right={<Tag kind="CALCULATED" />}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by message, source or target…"
          className="num mb-3 w-full rounded-sm border border-border bg-background/60 px-2.5 py-1.5 text-xs outline-none placeholder:text-unknown focus:border-cyan/50"
        />
        <div className="flex flex-wrap gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => setSev(s)}
              className={cn("num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]", sev === s ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => setType("ALL")}
            className={cn("num rounded-sm border px-1.5 py-0.5 text-[10px] tracking-[0.12em]", type === "ALL" ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground")}
          >
            ALL TYPES
          </button>
          {Object.entries(byType)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn("num rounded-sm border px-1.5 py-0.5 text-[10px] tracking-[0.12em]", type === t ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {t} <span className="text-unknown">{n}</span>
              </button>
            ))}
        </div>
      </Panel>

      <Panel title={`FEED · ${rows.length}`} right={<Tag kind="LIVE" />}>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-unknown">NO EVENTS MATCH THIS FILTER</p>
          ) : (
            <ul className="space-y-1">
              {rows.slice(0, 300).map((e) => (
                <li key={e.id} className="flex flex-wrap items-start gap-2 border-b border-border/40 py-1.5 last:border-0">
                  <span className="num shrink-0 text-[10px] text-unknown">{clockOf(e.t)}</span>
                  <StatePill label={e.severity} tone={toneFor(e.severity)} />
                  <span className="num shrink-0 text-[10px] tracking-[0.12em] text-cyan">{e.type}</span>
                  <span className="num shrink-0 text-[10px] tracking-[0.12em] text-violet">{e.source}</span>
                  <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">{e.message}</span>
                  {e.target && <span className="num shrink-0 text-[10px] text-foreground/80">{e.target}</span>}
                  {e.status && <StatePill label={e.status} tone={toneFor(e.status)} />}
                  {e.confidence !== null && e.confidence !== undefined && <span className="num shrink-0 text-[10px] text-unknown">CONF {e.confidence}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={EVENT_BUS_VERSION} />
      </div>
    </TerminalShell>
  );
}
