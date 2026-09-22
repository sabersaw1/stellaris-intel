/**
 * CONNECTIONS — the control surface for every real data connection.
 *
 * For each source: live state, what it provides, what it cannot provide, the
 * exact credential, where to obtain it, cost, last success, last error, data
 * freshness, and a Test Connection button that performs a real read-only probe.
 * Secret values are never shown, never sent to the browser and never stored in
 * the browser.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle } from "@/components/kit";
import { Btn, KV, StatePill } from "@/components/kit2";
import { connectionCenterReport, testConnection, type ConnectionRow, type ConnectionTestResult } from "@/lib/connections.functions";
import { DELIVERY, type ConnectionId } from "@/lib/providers/catalog";

export const Route = createFileRoute("/connections")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connections — Stellaris Meme Intelligence" },
      {
        name: "description",
        content:
          "Connect the real meme-coin data feeds: PumpPortal, DEX Screener, Solana RPC, X, FOMO, AI and your local agent — with the exact credential each one needs and a live connection test.",
      },
      { property: "og:title", content: "Connections — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Exact credentials, where to get them, what they unlock, what they do not unlock, and a real connection test." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectionsPage,
});

function tone(state: string): "ok" | "warn" | "bad" | "muted" | "info" {
  if (state.startsWith("CONNECTED")) return "ok";
  if (state === "DEGRADED") return "warn";
  if (state === "ERROR") return "bad";
  if (state === "CAPABILITY UNAVAILABLE") return "muted";
  return "warn";
}

function ago(t: number | null): string {
  if (!t) return "never";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}

function ConnectionsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["connection-center"], queryFn: () => connectionCenterReport(), refetchInterval: 30_000, staleTime: 15_000 });
  const [results, setResults] = useState<Record<string, ConnectionTestResult>>({});

  const test = useMutation({
    mutationFn: (id: ConnectionId) => testConnection({ data: { id } }),
    onSuccess: (r) => {
      setResults((prev) => ({ ...prev, [r.id]: r }));
      void qc.invalidateQueries({ queryKey: ["connection-center"] });
    },
  });

  const data = q.data;

  return (
    <TerminalShell>
      <SectionTitle sub="Every connection below is described exactly as the vendor actually offers it. A source reads CONNECTED only after it has really answered. Credentials are stored as server-side secrets — nothing is kept in this browser.">
        CONNECTIONS
      </SectionTitle>

      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        <Panel title="PERSISTENT MEMORY">
          <KV label="Supabase credentials" value={data ? (data.persistence.configured ? "CONFIGURED" : "MISSING") : "—"} />
          <KV label="Meme schema" value={data ? (data.persistence.schemaReady ? "APPLIED" : "NOT APPLIED") : "—"} />
          {data?.persistence.note ? <p className="mt-2 text-xs text-signal-mid">{data.persistence.note}</p> : null}
        </Panel>
        <Panel title="EXECUTION">
          <KV label="Real-money trading" value="HARD DISABLED" />
          <p className="mt-2 text-xs text-muted-foreground">
            No screen, API route or permission level can place an order. Proposals are recorded for your review only.
          </p>
        </Panel>
        <Panel title="SETUP CHECKLIST">
          <ul className="space-y-1 text-xs">
            {(data?.checklist ?? []).map((c) => (
              <li key={c.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-b border-border/40 pb-1 last:border-0">
                <span className="num min-w-0 truncate text-[11px] tracking-[0.1em] text-foreground/80">{c.name}</span>
                <span className="flex min-w-0 shrink-0 flex-wrap justify-end gap-1">
                  {c.steps.map((s) => (
                    <StatePill key={s.label} label={s.done ? "DONE" : "TODO"} tone={s.done ? "ok" : "warn"} title={s.label} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-3">
        {(data?.rows ?? []).map((r) => (
          <ConnectionCard
            key={r.id}
            row={r}
            result={results[r.id] ?? null}
            testing={test.isPending && test.variables === r.id}
            onTest={() => test.mutate(r.id)}
          />
        ))}
      </div>

      <div className="mt-4">
        <Panel title="HOW TO SUPPLY A CREDENTIAL">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Ask in chat for the secure form for the exact variable named on a card (for example STELLARIS_SOLANA_RPC_URL) and paste the value there. It is
            stored as a server-side secret: it never appears in this interface, in the browser bundle, in local storage or in the repository. The matching
            card switches state on the next check, with no code change. Never paste a password or a browser cookie — Stellaris does not use them.
          </p>
        </Panel>
      </div>
    </TerminalShell>
  );
}

function ConnectionCard({
  row,
  result,
  testing,
  onTest,
}: {
  row: ConnectionRow;
  result: ConnectionTestResult | null;
  testing: boolean;
  onTest: () => void;
}) {
  const state = result ? result.state : row.state;
  return (
    <Panel
      title={row.name}
      right={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <StatePill label={row.requirement} tone={row.requirement === "REQUIRED NOW" ? "info" : "muted"} />
          <StatePill label={state} tone={tone(state)} />
          <Btn onClick={onTest} disabled={testing}>{testing ? "TESTING…" : "TEST CONNECTION"}</Btn>
        </div>
      }
    >
      <p className="text-xs leading-relaxed text-muted-foreground">{row.purpose}</p>
      <p className="mt-1 text-xs leading-relaxed text-unknown">Why Stellaris needs it: {row.whyStellarisNeedsIt}</p>

      <div className="mt-3 grid gap-1 md:grid-cols-2 md:gap-x-6">
        <KV label="CREDENTIAL" value={row.credentialType} />
        <KV label="VARIABLE" value={row.id === "solana" ? "PUBLIC_SOLANA_MAINNET_RPC / optional STELLARIS_SOLANA_RPC_URL" : row.envVars.length ? row.envVars.join("  or  ") : "NONE REQUIRED"} />
        <KV label="COST" value={row.cost} />
        <KV label="DELIVERY" value={DELIVERY[row.id]} />
        <KV label="WHERE TO OBTAIN" value={row.whereToGet} />
        <KV label="LAST SUCCESSFUL REQUEST" value={ago(row.lastOkAt)} />
        <KV label="LAST RECEIVED DATA" value={row.lastOkAt ? ago(row.lastOkAt) : "NO DATA RECEIVED YET"} />
        <KV label="LATENCY" value={result?.latencyMs ?? row.latencyMs ? `${result?.latencyMs ?? row.latencyMs} ms` : "UNAVAILABLE"} />
        <KV label="LAST ERROR" value={row.lastError ?? "NONE RECORDED"} />
      </div>

      {row.blockedReason ? <p className="mt-2 text-xs text-signal-mid">{row.blockedReason}</p> : null}
      {result ? (
        <p className={`mt-2 text-xs ${result.ok ? "text-signal-low" : "text-signal-high"}`}>
          TEST {result.ok ? "PASSED" : "FAILED"} — {result.detail}
        </p>
      ) : null}
      {row.rateLimitNote ? <p className="mt-1 text-xs text-muted-foreground">Limits: {row.rateLimitNote}</p> : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Column title="WHAT THIS UNLOCKS" items={row.unlocks} />
        <Column title="WHAT IT DOES NOT UNLOCK" items={row.doesNotUnlock} />
      </div>

      <p className="mt-3 border-t border-border/50 pt-2 text-[11px] leading-relaxed text-unknown">HOW THE TEST WORKS — {row.howToTest}</p>
    </Panel>
  );
}

function Column({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <p className="label-xs">{title}</p>
      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
        {items.map((i) => (
          <li key={i}>• {i}</li>
        ))}
      </ul>
    </div>
  );
}
