/**
 * CONNECTIONS — one screen that answers, for every data source: is it connected,
 * what does it supply, what does it not supply, what credential is missing, when
 * did it last succeed, and what failed. Nothing is described as live unless the
 * provider actually reported a successful observation.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle } from "@/components/kit";
import { KV, StatePill } from "@/components/kit2";
import { connectionCenter, type ConnectionCenterRow } from "@/lib/intel.functions";

export const Route = createFileRoute("/connections")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connections — Stellaris Intel" },
      {
        name: "description",
        content:
          "Every Stellaris data connection in one place: connection state, supplied and unsupplied data, credential requirements, last successful observation and last error.",
      },
      { property: "og:title", content: "Connections — Stellaris Intel" },
      { property: "og:description", content: "Truthful connection state for every meme-coin data source, with the exact credential each one needs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectionsPage,
});

function tone(status: string): "ok" | "warn" | "bad" | "muted" | "info" {
  if (status === "CONNECTED") return "ok";
  if (status === "DEGRADED" || status === "PARTIALLY AVAILABLE" || status === "STALE") return "warn";
  if (status === "ERROR") return "bad";
  if (status === "AVAILABLE") return "info";
  return "muted";
}

function ago(t: number | null): string {
  if (!t) return "never";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}

function statusLabel(r: ConnectionCenterRow): string {
  if (r.status === "NOT CONNECTED" && r.credential) return "READY — CREDENTIAL REQUIRED";
  if (r.status === "NOT CONNECTED" && !r.credential) return "UNAVAILABLE — CAPABILITY NOT OFFERED";
  if (r.status === "CONNECTED" && r.supplies.length && r.needsCredential.length) return "PARTIALLY AVAILABLE";
  return r.status;
}

function ConnectionsPage() {
  const q = useQuery({ queryKey: ["connection-center"], queryFn: () => connectionCenter(), refetchInterval: 30_000, staleTime: 15_000 });
  const data = q.data;

  return (
    <TerminalShell>
      <SectionTitle sub="Connection state is derived from real requests. A source is only CONNECTED when it has actually answered.">
        CONNECTIONS
      </SectionTitle>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel title="PERSISTENCE">
          <KV label="Supabase credentials" value={data ? (data.persistence.configured ? "CONFIGURED" : "MISSING") : "—"} />
          <KV label="Meme schema" value={data ? (data.persistence.schemaReady ? "APPLIED" : "NOT APPLIED") : "—"} />
          {data?.persistence.note ? <p className="mt-2 text-xs text-muted-foreground">{data.persistence.note}</p> : null}
        </Panel>
        <Panel title="AGENT API">
          <KV label="Machine API" value={data?.agentApiConfigured ? "OPEN (token set)" : "CLOSED (no token)"} />
          <p className="mt-2 text-xs text-muted-foreground">
            /api/public/intelligence/status, /api/public/intelligence/events, /api/public/research/analyze and /api/public/trade/propose require a bearer
            token. Without STELLARIS_AGENT_TOKEN they stay closed.
          </p>
        </Panel>
        <Panel title="EXECUTION">
          <KV label="Real-money trading" value="HARD DISABLED" />
          <p className="mt-2 text-xs text-muted-foreground">
            No screen, API route or permission level can place an order. Proposals are recorded for your review only.
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-3">
        {(data?.rows ?? []).map((r) => (
          <Panel key={r.id} title={r.name.toUpperCase()}>
            <div className="flex flex-wrap items-center gap-2">
              <StatePill label={statusLabel(r)} tone={tone(r.status)} />
              {r.credential ? <StatePill label={`CREDENTIAL: ${r.credential}`} tone={r.configured ? "ok" : "warn"} /> : <StatePill label="NO CREDENTIAL NEEDED" tone="info" />}
              <StatePill label={`LAST SUCCESS ${ago(r.lastOkAt)}`} tone={r.lastOkAt ? "ok" : "muted"} />
              {r.lastError ? <StatePill label="LAST ERROR RECORDED" tone="bad" /> : null}
            </div>

            {r.blockedReason ? <p className="mt-2 text-xs text-signal-mid">{r.blockedReason}</p> : null}
            {r.lastError ? <p className="mt-2 text-xs text-signal-high">Last error: {r.lastError}</p> : null}
            {r.whereToGet ? <p className="mt-2 text-xs text-muted-foreground">Where to get it: {r.whereToGet}</p> : null}
            {r.rateLimitNote ? <p className="mt-1 text-xs text-muted-foreground">Limits: {r.rateLimitNote}</p> : null}

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Column title="SUPPLIES" items={r.supplies} empty="Nothing until it is connected." />
              <Column title="NEEDS A CREDENTIAL" items={r.needsCredential} empty="No credential-gated data." />
              <Column title="DOES NOT SUPPLY" items={r.doesNotSupply} empty="No documented gaps recorded." />
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-4">
        <Panel title="CAPABILITY COVERAGE">
          <div className="flex flex-wrap gap-2">
            {(data?.coverage ?? []).map((c) => (
              <StatePill key={c.capability} label={`${c.capability}: ${c.available ? "AVAILABLE" : "UNAVAILABLE"}`} tone={c.available ? "ok" : "muted"} />
            ))}
          </div>
        </Panel>
      </div>
    </TerminalShell>
  );
}

function Column({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className="label-xs">{title}</p>
      {items.length ? (
        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
          {items.map((i) => (
            <li key={i}>• {i}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-unknown">{empty}</p>
      )}
    </div>
  );
}
