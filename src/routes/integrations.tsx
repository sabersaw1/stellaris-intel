import { createFileRoute } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, FreshnessBadge, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { useStoreTick } from "@/hooks/useBrain";
import { healthQuery } from "@/hooks/useMarket";
import { integrationsReport } from "@/lib/integrations.functions";
import {
  INTEGRATIONS_VERSION,
  WEBHOOK_ENDPOINTS,
  addAccount,
  connectionGraph,
  dependencyMap,
  getAccounts,
  removeAccount,
  subscribeAccounts,
  systemDoctor,
} from "@/lib/integrations";
import { audit } from "@/lib/incidents";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations Command Center — Market Intelligence OS" },
      {
        name: "description",
        content: "Checked status of every data source and automation connector, required credentials, capabilities, permissions, webhooks, dependencies and diagnostics.",
      },
      { property: "og:title", content: "Integrations Command Center — Market Intelligence OS" },
      { property: "og:description", content: "Nothing is reported connected unless a real request succeeded. Missing credentials read NOT CONFIGURED." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationsPage,
});

const reportQuery = queryOptions({
  queryKey: ["integrations", "report"],
  queryFn: () => integrationsReport(),
  refetchInterval: 60_000,
});

function IntegrationsPage() {
  const q = useQuery(reportQuery);
  const health = useQuery(healthQuery);
  const tick = useStoreTick(subscribeAccounts);
  const report = q.data ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const accounts = useMemo(() => getAccounts(), [tick]);
  const deps = useMemo(() => dependencyMap(report), [report, tick]);
  const graph = useMemo(() => connectionGraph(report), [report]);
  const doctor = useMemo(() => systemDoctor(report, health.data?.api.errors ?? null), [report, health.data]);
  const active = report?.connectors.find((c) => c.id === selected) ?? report?.connectors[0] ?? null;

  return (
    <TerminalShell>
      <SectionTitle sub="Every connector below was actually probed by the server. Connectors without credentials are reported as not configured, and capabilities that no configured source supports are marked unsupported.">
        INTEGRATIONS COMMAND CENTER
      </SectionTitle>

      {q.isError ? (
        <DataState state="DATA UNAVAILABLE" detail="The integration probe could not be completed." />
      ) : !report ? (
        <DataState state="WAITING FOR DATA" detail="Probing connectors…" />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {report.connectors.map((c) => (
              <Panel
                key={c.id}
                title={c.name}
                right={<StatePill label={c.status} tone={toneFor(c.status)} />}
                className={cn("cursor-pointer", active?.id === c.id && "border-cyan/40")}
              >
                <div onClick={() => setSelected(c.id)}>
                  <p className="text-[11px] text-muted-foreground">{c.detail}</p>
                  <KV label="KIND" value={c.kind} />
                  <KV label="CREDENTIALS" value={c.credentialState === "PRESENT" ? "PRESENT (server-side)" : `MISSING — ${c.requiredEnv.join(", ")}`} />
                  <KV label="LATENCY" value={c.latencyMs === null ? "NOT MEASURED" : `${c.latencyMs}ms`} />
                  <KV label="LAST CHECK" value={c.observedAt ? clockOf(c.observedAt) : "NOT CHECKED"} />
                </div>
              </Panel>
            ))}
          </div>

          {active && (
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Panel title={`${active.name} · DETAIL`} right={<FreshnessBadge observedAt={active.observedAt} />}>
                <KV label="STATUS" value={active.status} />
                <KV label="REQUESTS" value={active.requests === null ? "NOT MEASURED" : String(active.requests)} />
                <KV label="ERRORS" value={active.errors === null ? "NOT MEASURED" : String(active.errors)} />
                <KV label="CACHE HITS" value={active.cacheHits === null ? "NOT MEASURED" : String(active.cacheHits)} />
                <KV label="RATE-LIMIT DEFERRALS" value={active.rateLimitDeferrals === null ? "NOT MEASURED" : String(active.rateLimitDeferrals)} />
                <p className="label-xs mt-3 mb-1">CAPABILITIES</p>
                <ul className="flex flex-wrap gap-1.5">
                  {active.capabilities.map((c) => (
                    <li key={c.name}><StatePill label={`${c.name}: ${c.state}`} tone={toneFor(c.state)} /></li>
                  ))}
                </ul>
                <p className="label-xs mt-3 mb-1">PERMISSIONS</p>
                <Table head={["SCOPE", "LEVEL", "NOTE"]}>
                  {active.permissions.map((p) => (
                    <tr key={p.scope}>
                      <Td className="num">{p.scope}</Td>
                      <Td><StatePill label={p.level} tone={p.level === "NONE" ? "muted" : p.level === "WRITE" ? "warn" : "ok"} /></Td>
                      <Td className="text-[11px] text-muted-foreground">{p.note}</Td>
                    </tr>
                  ))}
                </Table>
              </Panel>

              <Panel title="ACCOUNTS" right={<Tag kind="CALCULATED" />}>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Accounts record which connections you intend to use. Credentials themselves are never entered or stored here — they stay in server-side environment variables.
                </p>
                <Btn
                  onClick={() => {
                    const a = addAccount(active.id, `${active.name} account ${accounts.filter((x) => x.connectorId === active.id).length + 1}`);
                    audit("ACCOUNT", "ACCOUNT ADDED", `${a.label} for ${active.name}`);
                  }}
                >
                  ADD ACCOUNT FOR {active.name}
                </Btn>
                {accounts.length === 0 ? (
                  <p className="mt-3 text-xs text-unknown">NO ACCOUNTS RECORDED</p>
                ) : (
                  <Table head={["LABEL", "CONNECTOR", "AUTHORISED", "LAST ACTIVITY", ""]}>
                    {accounts.map((a) => (
                      <tr key={a.id}>
                        <Td className="num">{a.label}</Td>
                        <Td className="num text-muted-foreground">{a.connectorId}</Td>
                        <Td><StatePill label={a.authorised ? "AUTHORISED" : "WAITING FOR CREDENTIAL"} tone={a.authorised ? "ok" : "muted"} /></Td>
                        <Td className="num text-unknown">{a.lastActivityAt ? clockOf(a.lastActivityAt) : "NEVER"}</Td>
                        <Td>
                          <Btn
                            tone="danger"
                            onClick={() => {
                              removeAccount(a.id);
                              audit("ACCOUNT", "ACCOUNT REMOVED", a.label);
                            }}
                          >
                            REMOVE
                          </Btn>
                        </Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            </div>
          )}

          <Panel className="mb-4" title="WEBHOOK ENDPOINTS" right={<Tag kind="CALCULATED" />}>
            <Table head={["DIRECTION", "CONNECTOR", "PATH", "VALIDATION", "REQUIRED SECRET"]}>
              {WEBHOOK_ENDPOINTS.map((w) => (
                <tr key={w.id}>
                  <Td><StatePill label={w.direction} tone="info" /></Td>
                  <Td className="num">{w.connectorId}</Td>
                  <Td className="num max-w-[16rem] truncate">{w.path}</Td>
                  <Td className="max-w-[22rem] text-[11px] text-muted-foreground">{w.validation}</Td>
                  <Td className="num text-unknown">{w.requiredEnv.join(", ")}</Td>
                </tr>
              ))}
            </Table>
          </Panel>

          <Panel className="mb-4" title="CONNECTION GRAPH" right={<Tag kind="VISUAL" />}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {["source", "core", "intelligence", "automation", "storage"].map((g) => (
                <div key={g} className="rounded-sm border border-border/60 p-2">
                  <p className="label-xs mb-2">{g.toUpperCase()}</p>
                  <ul className="space-y-1.5">
                    {graph.nodes.filter((n) => n.group === g).map((n) => (
                      <li key={n.id}>
                        <p className="num text-[11px] text-foreground">{n.label}</p>
                        <StatePill label={n.state} tone={toneFor(n.state)} title={n.detail} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <p className="label-xs mb-1">DATA PATHS</p>
              <ul className="space-y-1">
                {graph.edges.map((e, i) => (
                  <li key={i} className="num flex items-center gap-2 text-[11px]">
                    <span className={cn(e.live ? "text-cyan" : "text-unknown")}>{e.from} → {e.to}</span>
                    <span className="text-muted-foreground">{e.label}</span>
                    <StatePill label={e.live ? "LIVE" : "NOT ACTIVE"} tone={e.live ? "ok" : "muted"} />
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel className="mb-4" title="DEPENDENCY MAP" right={<Tag kind="CALCULATED" />}>
            <Table head={["CONNECTOR", "STATUS", "WHAT DEPENDS ON IT"]}>
              {deps.map((d) => (
                <tr key={d.connectorId}>
                  <Td className="num">{d.connectorName}</Td>
                  <Td><StatePill label={d.status} tone={toneFor(d.status)} /></Td>
                  <Td>
                    <ul className="space-y-1">
                      {d.affected.map((a) => (
                        <li key={a.area} className="text-[11px] text-muted-foreground">
                          <span className="num text-foreground">{a.area}</span>{a.count === null ? "" : ` · ${a.count}`} — {a.detail}
                        </li>
                      ))}
                    </ul>
                  </Td>
                </tr>
              ))}
            </Table>
          </Panel>

          <Panel title="SYSTEM DOCTOR" right={<Tag kind="CALCULATED" />}>
            <Table head={["CHECK", "STATE", "WHAT", "WHY", "AFFECTED", "SUGGESTED ACTION"]}>
              {doctor.map((d) => (
                <tr key={d.check}>
                  <Td className="num whitespace-nowrap">{d.check}</Td>
                  <Td><StatePill label={d.state} tone={toneFor(d.state)} /></Td>
                  <Td className="max-w-[16rem] text-[11px] text-muted-foreground">{d.what}</Td>
                  <Td className="max-w-[16rem] text-[11px] text-muted-foreground">{d.why}</Td>
                  <Td className="max-w-[12rem] text-[11px] text-muted-foreground">{d.affected}</Td>
                  <Td className="max-w-[16rem] text-[11px] text-cyan">{d.action}</Td>
                </tr>
              ))}
            </Table>
          </Panel>

          <div className="mt-4">
            <SourceLine observedAt={report.checkedAt} calculatedAt={report.checkedAt} engineVersion={INTEGRATIONS_VERSION} />
          </div>
        </>
      )}
    </TerminalShell>
  );
}
