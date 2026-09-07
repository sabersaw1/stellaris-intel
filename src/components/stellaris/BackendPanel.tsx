/**
 * Truthful status of the operator's own Supabase backend and its scheduled
 * processing endpoint. Every value here comes from an actual query performed by
 * the server; nothing is assumed to be connected.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Panel } from "@/components/kit";
import { Btn, KV, StatePill } from "@/components/kit2";
import { backendStatus, runIntelligenceTick, storedCounts } from "@/lib/backend.functions";
import { cn } from "@/lib/utils";

const tone = (s: string) =>
  s === "CONNECTED" || s === "AVAILABLE"
    ? "border-signal-low/50 text-signal-low"
    : s === "DEGRADED"
      ? "border-signal-mid/50 text-signal-mid"
      : "border-border text-unknown";

export function BackendPanel() {
  const status = useQuery({ queryKey: ["backend-status"], queryFn: () => backendStatus(), staleTime: 30_000 });
  const counts = useQuery({ queryKey: ["stored-counts"], queryFn: () => storedCounts(), staleTime: 30_000 });
  const tick = useServerFn(runIntelligenceTick);
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: () => tick(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stored-counts"] });
      void qc.invalidateQueries({ queryKey: ["backend-status"] });
    },
  });

  const s = status.data;
  const headline = !s
    ? "CHECKING"
    : !s.configured
      ? "NOT CONFIGURED"
      : s.migrated
        ? "CONNECTED"
        : s.reachable
          ? "SCHEMA MISSING"
          : "UNREACHABLE";

  return (
    <Panel
      title="PERSISTENT MEMORY — YOUR SUPABASE PROJECT"
      right={<StatePill label={headline} tone={headline === "CONNECTED" ? "low" : headline === "NOT CONFIGURED" ? "muted" : "mid"} />}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <KV label="CREDENTIALS" value={s ? (s.configured ? "PRESENT (SERVER-SIDE ONLY)" : "NOT PROVIDED") : "CHECKING"} />
        <KV label="DATABASE ANSWERED" value={s ? (s.reachable ? `YES · ${s.latencyMs ?? "?"}MS` : "NO") : "CHECKING"} />
        <KV label="SCHEMA 0001" value={s ? (s.migrated ? "APPLIED" : "NOT APPLIED") : "CHECKING"} />
        <KV label="WORKER SECRET" value={s ? (s.cronSecretPresent ? "PRESENT" : "NOT PROVIDED") : "CHECKING"} />
        <KV label="MARKETS STORED" value={counts.data?.markets ?? "—"} />
        <KV label="OBSERVATIONS STORED" value={counts.data?.observations ?? "—"} />
        <KV label="CHANGE EVENTS STORED" value={counts.data?.changes ?? "—"} />
        <KV
          label="LAST PROCESSING RUN"
          value={counts.data?.lastJob ? `${counts.data.lastJob.state} · ${counts.data.lastJob.finishedAt ?? "—"}` : "NONE RECORDED"}
        />
      </div>

      {s && !s.migrated && (
        <p className="mt-3 text-[11px] leading-snug text-signal-mid">
          Apply <span className="num">db/migrations/0001_stellaris_core.sql</span> in your Supabase SQL Editor. Until then, observations are
          collected but not retained, and memory falls back to this browser only.
        </p>
      )}

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {(s?.sources ?? []).map((src) => (
          <li key={src.id} className="rounded-md border border-border/60 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="num text-[10px] tracking-[0.12em] text-foreground">{src.label}</span>
              <span className={cn("num rounded-sm border px-1.5 py-0.5 text-[9px] tracking-[0.12em]", tone(src.state))}>{src.state}</span>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-unknown">{src.detail}</p>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? "RUNNING CYCLE…" : "RUN ONE PROCESSING CYCLE NOW"}
        </Btn>
        {run.data && (
          <span className="num text-[10px] tracking-[0.1em] text-muted-foreground">
            {run.data.pairsObserved} OBSERVED · {run.data.observationsStored} STORED · {run.data.changesDetected} CHANGE(S)
          </span>
        )}
      </div>
      {run.data?.note && <p className="mt-2 text-[10px] leading-snug text-unknown">{run.data.note}</p>}
      {run.data?.errors?.length ? <p className="mt-1 text-[10px] leading-snug text-signal-extreme">{run.data.errors.join(" · ")}</p> : null}

      <p className="num mt-3 text-[9px] leading-relaxed tracking-[0.1em] text-unknown">
        SCHEDULED PROCESSING IS A SIGNED ENDPOINT CALLED BY PG_CRON IN YOUR PROJECT. THERE IS NO ALWAYS-ON WORKER, SO EACH CYCLE HAPPENS ONLY WHEN
        SCHEDULED OR RUN MANUALLY. NO CREDENTIAL IS DISPLAYED OR SENT TO THE BROWSER.
      </p>
    </Panel>
  );
}
