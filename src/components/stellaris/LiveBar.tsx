/**
 * The truthful live status line.
 *
 * Every value here is measured: the age of the last market snapshot the app
 * actually received, the last write your database actually recorded, and the
 * state of the live connection. Nothing is simulated, and nothing implies a
 * faster cadence than the sources provide.
 */

import { useEffect, useState } from "react";

import { useLiveMeta, useRealtimeStatus } from "@/hooks/useLive";
import { useMarketIntelligence } from "@/hooks/useMarket";
import { secondsSince } from "@/lib/format";
import { cn } from "@/lib/utils";

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="num text-[8px] tracking-[0.18em] text-unknown">{label}</p>
      <p className={cn("num truncate text-[10px] tracking-[0.1em]", tone ?? "text-foreground")}>{value}</p>
    </div>
  );
}

export function LiveBar() {
  const market = useMarketIntelligence();
  const rt = useRealtimeStatus();
  const meta = useLiveMeta();
  // Re-render on a one-second beat so the "age" figures stay honest without
  // touching any underlying value.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const d = meta.data;
  const rtTone =
    rt.state === "CONNECTED"
      ? "text-signal-low"
      : rt.state === "ERROR"
        ? "text-signal-high"
        : rt.state === "CONNECTING"
          ? "text-violet"
          : "text-unknown";

  const marketAge = market.query.dataUpdatedAt ? secondsSince(market.query.dataUpdatedAt) : "—";
  const sourceTone = market.query.isError
    ? "text-signal-high"
    : market.query.dataUpdatedAt && Date.now() - market.query.dataUpdatedAt > 120_000
      ? "text-signal-elevated"
      : "text-signal-low";

  return (
    <div className="mb-3 grid grid-cols-2 gap-3 rounded-sm border border-border/70 bg-background/50 px-3 py-2 sm:grid-cols-4 lg:grid-cols-7">
      <Cell
        label="MARKET DATA"
        value={market.query.isError ? "SOURCE UNAVAILABLE" : market.query.isFetching ? "RECEIVING…" : marketAge}
        tone={sourceTone}
      />
      <Cell label="MARKETS OBSERVED" value={market.assessments.length ? String(market.assessments.length) : "—"} />
      <Cell label="LIVE DB CONNECTION" value={rt.state} tone={rtTone} />
      <Cell label="LAST DB EVENT" value={rt.lastEventAt ? secondsSince(rt.lastEventAt) : "NONE THIS SESSION"} tone={rt.lastEventAt ? "text-cyan" : "text-unknown"} />
      <Cell
        label="LAST STORED OBSERVATION"
        value={!d ? "READING…" : !d.configured ? "DATABASE UNAVAILABLE" : d.lastObservationAt ? secondsSince(d.lastObservationAt) : "NONE YET"}
        tone={d?.lastObservationAt ? "text-foreground" : "text-unknown"}
      />
      <Cell
        label="LAST RESEARCH UPDATE"
        value={!d ? "READING…" : d.lastInvestigationAt ? secondsSince(d.lastInvestigationAt) : "NONE YET"}
        tone={d?.lastInvestigationAt ? "text-foreground" : "text-unknown"}
      />
      <Cell
        label="LAST BACKGROUND CYCLE"
        value={
          !d
            ? "READING…"
            : d.lastJob
              ? `${d.lastJob.state} · ${d.lastJob.finishedAt ? secondsSince(d.lastJob.finishedAt) : "RUNNING"}`
              : "NONE RECORDED"
        }
        tone={d?.lastJob?.state === "FAILED" ? "text-signal-high" : d?.lastJob ? "text-foreground" : "text-unknown"}
      />
    </div>
  );
}
