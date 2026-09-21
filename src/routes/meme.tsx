/**
 * MEME INTELLIGENCE — the meme-coin collection pipeline, end to end.
 *
 * Shows only what is actually stored: classified meme tokens, their latest
 * observation with its real timestamp, detected change events, alerts, and the
 * exact capability each data source can and cannot serve today.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle, Tag } from "@/components/kit";
import { Btn, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import {
  listMemeAlerts,
  listMemeEvents,
  listMemeTokens,
  memePipelineStatus,
  runMemeCollection,
} from "@/lib/meme.functions";
import { secondsSince, usd } from "@/lib/format";

export const Route = createFileRoute("/meme")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Meme Intelligence — Stellaris" },
      {
        name: "description",
        content:
          "Meme-coin discovery, classification, stored observations, change events and alerts, with the exact capability each data source can serve.",
      },
      { property: "og:title", content: "Meme Intelligence — Stellaris" },
      {
        property: "og:description",
        content: "Only confirmed meme tokens enter research. Uncertain tokens stay UNKNOWN instead of being guessed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MemePage,
});

const n = (v: number | null | undefined): string => (v === null || v === undefined ? "UNAVAILABLE" : v.toLocaleString());

function MemePage() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["meme", "status"], queryFn: () => memePipelineStatus(), refetchInterval: 30_000 });
  const tokens = useQuery({ queryKey: ["meme", "tokens"], queryFn: () => listMemeTokens(), refetchInterval: 20_000 });
  const events = useQuery({ queryKey: ["meme", "events"], queryFn: () => listMemeEvents(), refetchInterval: 20_000 });
  const alerts = useQuery({ queryKey: ["meme", "alerts"], queryFn: () => listMemeAlerts(), refetchInterval: 30_000 });

  const collect = useMutation({
    mutationFn: () => runMemeCollection(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["meme"] }),
  });

  const s = status.data;
  const rows = tokens.data?.rows ?? [];

  return (
    <TerminalShell>
      <SectionTitle sub="Discovery classifies every observed market as MEME, NOT MEME or UNKNOWN before anything is stored. Only tokens classified MEME are promoted into research; UNKNOWN stays visible but excluded, and nothing is inferred to fill a gap.">
        MEME INTELLIGENCE
      </SectionTitle>

      {s && !s.supabaseConfigured && (
        <Panel title="NOT CONFIGURED" tone="strong">
          <p className="text-xs text-unknown">
            No database is configured, so discovered tokens cannot be remembered between cycles.
          </p>
        </Panel>
      )}
      {s?.supabaseConfigured && !s.schemaReady && (
        <Panel title="MIGRATION REQUIRED" tone="strong">
          <p className="text-xs text-unknown">{s.schemaNote}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Apply db/migrations/0007_stellaris_meme_core.sql in your database, then run a collection cycle.
          </p>
        </Panel>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel
          title="STORED MEMORY"
          right={
            <Btn onClick={() => collect.mutate()} disabled={collect.isPending}>
              {collect.isPending ? "COLLECTING…" : "RUN COLLECTION CYCLE"}
            </Btn>
          }
        >
          <div className="grid gap-1">
            <KV label="MEME TOKENS" value={n(s?.counts.memeTokens)} />
            <KV label="TOKENS OBSERVED (INCL. UNKNOWN)" value={n(s?.counts.tokens)} />
            <KV label="STORED OBSERVATIONS" value={n(s?.counts.snapshots)} />
            <KV label="CHANGE EVENTS" value={n(s?.counts.events)} />
            <KV label="ALERTS" value={n(s?.counts.alerts)} />
          </div>
          {collect.data && (
            <div className="mt-3 border-t border-border/40 pt-2 text-xs text-muted-foreground">
              <p>
                Last cycle: {collect.data.memes} meme, {collect.data.unknown} unknown, {collect.data.rejected} rejected ·{" "}
                {collect.data.snapshotsStored} new observation(s) · {collect.data.eventsStored} event(s) ·{" "}
                {collect.data.alertsRaised} alert(s)
              </p>
              {collect.data.notes.map((note) => (
                <p key={note} className="mt-1 text-unknown">
                  {note}
                </p>
              ))}
              {collect.data.errors.map((err) => (
                <p key={err} className="mt-1 text-destructive">
                  {err}
                </p>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="CAPABILITY COVERAGE">
          <p className="mb-2 text-xs text-muted-foreground">
            What the system can actually answer today. A blocked capability stays blocked until its source is connected —
            it is never approximated.
          </p>
          <div className="flex flex-wrap gap-1">
            {(s?.coverage ?? []).map((c) => (
              <Tag key={c.capability} tone={c.available ? "ok" : "muted"}>
                {c.capability.replace(/_/g, " ")} {c.available ? "✓" : "—"}
              </Tag>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {(s?.providers ?? []).map((p) => (
          <Panel key={p.id} title={p.name} right={<StatePill label={p.status} tone={toneFor(p.status)} />}>
            <div className="grid gap-1">
              <KV label="CREDENTIAL" value={p.credential ?? "NONE REQUIRED"} />
              <KV label="WHERE TO OBTAIN" value={p.whereToGet ?? "NOT APPLICABLE"} />
              <KV label="LAST SUCCESSFUL REQUEST" value={p.lastOkAt ? secondsSince(p.lastOkAt) : "NONE RECORDED"} />
              <KV label="ERROR" value={p.lastError ?? "NONE RECORDED"} />
              <KV label="LIMITS" value={p.rateLimitNote ?? "NOT DOCUMENTED"} />
            </div>
            {p.blockedReason && <p className="mt-2 text-xs text-unknown">{p.blockedReason}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {p.capabilities.map((c) => (
                <Tag key={c.capability} tone={c.state === "SUPPORTED" ? "ok" : c.state === "UNSUPPORTED" ? "muted" : "warn"}>
                  {c.capability.replace(/_/g, " ")}
                </Tag>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="mt-3" title={`CLASSIFIED TOKENS (${rows.length})`}>
        {tokens.data?.note && <p className="mb-2 text-xs text-unknown">{tokens.data.note}</p>}
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No tokens stored yet. Run a collection cycle, or wait for the background cycle.
          </p>
        ) : (
          <Table head={["TOKEN", "CHAIN", "ORIGIN", "VERDICT", "PRICE", "LIQUIDITY", "24H VOLUME", "OBSERVED"]}>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-border/30">
                <Td>{t.symbol || t.address.slice(0, 8)}</Td>
                <Td>{t.chainId}</Td>
                <Td>{t.origin}</Td>
                <Td>
                  <Tag tone={t.verdict === "MEME" ? "ok" : "warn"}>{t.verdict}</Tag>
                </Td>
                <Td>{t.priceUsd === null ? "UNAVAILABLE" : usd(t.priceUsd)}</Td>
                <Td>{t.liquidityUsd === null ? "UNAVAILABLE" : usd(t.liquidityUsd)}</Td>
                <Td>{t.volume24hUsd === null ? "UNAVAILABLE" : usd(t.volume24hUsd)}</Td>
                <Td>{t.observedAt ? secondsSince(Date.parse(t.observedAt)) : "NO OBSERVATION"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Panel title="CHANGE EVENTS">
          {(events.data?.rows ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No change events recorded. Events exist only when a stored value moved past its threshold.
            </p>
          ) : (
            <ul className="grid gap-2 text-xs">
              {(events.data?.rows ?? []).slice(0, 25).map((e, i) => (
                <li key={`${String(e["received_at"])}-${i}`} className="border-l-2 border-border/50 pl-2">
                  <div className="flex items-center gap-2">
                    <Tag tone="muted">{String(e["kind"]).replace(/_/g, " ")}</Tag>
                    <span className="text-muted-foreground">{String(e["source"])}</span>
                  </div>
                  <p className="mt-1">{String(e["summary"] ?? "")}</p>
                  <p className="text-muted-foreground">
                    {e["observed_at"] ? secondsSince(Date.parse(String(e["observed_at"]))) : "NO SOURCE TIMESTAMP"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="ALERTS">
          {(alerts.data?.rows ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No alerts. Alerts fire only on conditions worth interrupting you for, with a cooldown per token.
            </p>
          ) : (
            <ul className="grid gap-2 text-xs">
              {(alerts.data?.rows ?? []).map((a) => (
                <li key={String(a["id"])} className="border-l-2 border-destructive/60 pl-2">
                  <div className="flex items-center gap-2">
                    <Tag tone="warn">{String(a["severity"])}</Tag>
                    <span>{String(a["title"])}</span>
                  </div>
                  <ul className="mt-1 text-muted-foreground">
                    {(Array.isArray(a["why"]) ? (a["why"] as string[]) : []).map((w) => (
                      <li key={w}>· {w}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </TerminalShell>
  );
}
