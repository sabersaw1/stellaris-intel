import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { DataState, Metric, Panel, SectionTitle, Tag } from "@/components/kit";
import { healthQuery, useMarketIntelligence } from "@/hooks/useMarket";
import { useStellaris } from "@/hooks/useStellaris";
import { Link } from "@tanstack/react-router";
import { clockOf, count } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AGENT_SUITE_VERSION, RISK_ENGINE_VERSION } from "@/lib/dex-types";

export const Route = createFileRoute("/system")({
  head: () => ({
    meta: [
      { title: "System — Stellaris Intel" },
      { name: "description", content: "Live service checks, request accounting, cache hit rate, stale records and engine versions for the intelligence pipeline." },
      { property: "og:title", content: "System — Stellaris Intel" },
      { property: "og:description", content: "Checked service status, API accounting and pipeline stage visibility." },
    ],
  }),
  component: SystemPage,
});

const toneFor = (s: string) =>
  s === "HEALTHY"
    ? "border-signal-low/50 text-signal-low"
    : s === "DEGRADED"
      ? "border-signal-mid/50 text-signal-mid"
      : s === "ERROR"
        ? "border-signal-extreme/60 text-signal-extreme"
        : "border-border text-unknown";

function SystemPage() {
  const health = useQuery(healthQuery);
  const { assessments, historyCounts } = useMarketIntelligence();
  const stellaris = useStellaris();
  const storedPoints = Object.values(historyCounts).reduce((s, n) => s + n, 0);

  return (
    <TerminalShell>
      <SectionTitle sub="Nothing is reported as healthy unless the corresponding service was actually checked by this report.">SYSTEM</SectionTitle>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="EVIDENCE SOURCE REGISTER" right={<Tag kind="LIVE" />}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {stellaris.sources.map((src) => (
              <li key={src.id} className="rounded-md border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-[11px] tracking-[0.12em] text-foreground">{src.label}</span>
                  <span
                    className={cn(
                      "num rounded-sm border px-1.5 py-0.5 text-[9px] tracking-[0.12em]",
                      src.state === "CONNECTED" || src.state === "AVAILABLE"
                        ? "border-signal-low/50 text-signal-low"
                        : src.state === "DEGRADED"
                          ? "border-signal-mid/50 text-signal-mid"
                          : "border-border text-unknown",
                    )}
                  >
                    {src.state}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{src.provides}</p>
                <p className="text-[10px] leading-snug text-unknown">{src.detail}</p>
              </li>
            ))}
          </ul>
          <p className="num mt-3 text-[9px] leading-relaxed tracking-[0.1em] text-unknown">
            NO CREDENTIAL, KEY OR TOKEN IS DISPLAYED ANYWHERE IN THIS APPLICATION. A SOURCE MARKED NOT CONFIGURED CONTRIBUTES NO EVIDENCE AND ITS
            RESEARCH LAYER STAYS UNKNOWN.
          </p>
        </Panel>

        <Panel title="ADVANCED SYSTEM PANELS">
          <ul className="space-y-1">
            {[
              ["/integrations", "INTEGRATIONS AND CREDENTIAL STATE"],
              ["/workflows", "WORKFLOW STUDIO"],
              ["/incidents", "INCIDENTS"],
              ["/audit", "AUDIT LOG"],
              ["/performance", "AGENT PERFORMANCE"],
              ["/calibration", "SIGNAL CALIBRATION"],
              ["/workspaces", "WORKSPACES, DENSITY AND MOTION"],
              ["/neural", "STELLARIS BRAIN VISUALISATION"],
              ["/stream", "INTELLIGENCE STREAM"],
            ].map(([to, label]) => (
              <li key={to}>
                <Link to={to!} className="num block text-[10px] leading-snug tracking-[0.1em] text-muted-foreground hover:text-cyan">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {health.isLoading ? (
        <DataState state="WAITING FOR DATA" detail="Running live service checks." />
      ) : health.data ? (
        <div className="space-y-4">
          <Panel title={`SERVICE STATUS · CHECKED ${clockOf(health.data.checkedAt)}`} right={<Tag kind="LIVE" />}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {health.data.services.map((s) => (
                <li key={s.name} className="flex items-start justify-between gap-3 rounded-md border border-border/60 p-3">
                  <div className="min-w-0">
                    <p className="num text-[11px] tracking-[0.12em] text-foreground">{s.name}</p>
                    <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{s.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={cn("num rounded-sm border px-2 py-0.5 text-[10px] tracking-[0.12em]", toneFor(s.status))}>{s.status}</span>
                    {s.latencyMs !== null && <p className="num mt-1 text-[10px] text-unknown">{s.latencyMs}ms</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="API REQUEST MANAGEMENT" right={<Tag kind="CALCULATED" />}>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="UPSTREAM REQUESTS" value={count(health.data.api.requests)} kind="CALCULATED" />
                <Metric label="CACHE HITS" value={count(health.data.api.cacheHits)} kind="CALCULATED" />
                <Metric label="CACHE HIT RATE" value={`${health.data.api.cacheHitRate}%`} kind="CALCULATED" />
                <Metric label="CACHED ENDPOINTS" value={count(health.data.api.cacheEntries)} kind="CALCULATED" />
                <Metric label="API ERRORS" value={count(health.data.api.errors)} kind="CALCULATED" />
                <Metric label="RATE-LIMIT DEFERRALS" value={count(health.data.api.rateLimitDeferrals)} kind="CALCULATED" />
                <Metric label="LAST SUCCESS" value={clockOf(health.data.api.lastSuccessAt)} />
                <Metric label="LAST ERROR" value={health.data.api.lastErrorMessage ?? "NONE"} />
              </div>
            </Panel>

            <Panel title="PIPELINE & STORAGE" right={<Tag kind="CALCULATED" />}>
              <ol className="num space-y-1 text-[11px] text-muted-foreground">
                {["DEX API", "INGESTION", "VALIDATION", "NORMALIZATION", "HISTORICAL ENGINE", "BASELINE ENGINE", "ANALYSIS AGENTS", "RISK ENGINE", "ANOMALY ENGINE", "ALERT ENGINE", "FRONTEND"].map(
                  (stage, i) => (
                    <li key={stage} className="flex items-center gap-2">
                      <span className="text-unknown">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-foreground/85">{stage}</span>
                    </li>
                  ),
                )}
              </ol>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3">
                <Metric label="ASSESSED PAIRS" value={count(assessments.length)} kind="AGENT" />
                <Metric label="STORED OBSERVATIONS" value={count(storedPoints)} kind="CALCULATED" />
                <Metric label="STALE RECORDS" value={count(assessments.filter((a) => a.confidence.freshnessSeconds > 300).length)} kind="CALCULATED" />
                <Metric label="AGENT FAILURES" value={count(assessments.reduce((s, a) => s + a.agents.filter((g) => g.status === "ERROR").length, 0))} kind="AGENT" />
              </div>
              <p className="label-xs mt-3">{RISK_ENGINE_VERSION} · {AGENT_SUITE_VERSION}</p>
            </Panel>
          </div>

          <Panel title="ANALYTICS QUALITY" right={<Tag kind="CALCULATED" />}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="DATA COMPLETENESS"
                value={assessments.length ? `${Math.round(assessments.reduce((s, a) => s + a.confidence.completeness, 0) / assessments.length)}%` : "INSUFFICIENT DATA"}
                kind="CALCULATED"
              />
              <Metric
                label="MEAN FRESHNESS"
                value={assessments.length ? `${Math.round(assessments.reduce((s, a) => s + a.confidence.freshnessSeconds, 0) / assessments.length)}s` : "INSUFFICIENT DATA"}
                kind="CALCULATED"
              />
              <Metric
                label="ANOMALY RATE"
                value={assessments.length ? `${Math.round((assessments.filter((a) => a.anomalies.length).length / assessments.length) * 100)}%` : "INSUFFICIENT DATA"}
                kind="CALCULATED"
              />
              <Metric
                label="LOW-CONFIDENCE SHARE"
                value={assessments.length ? `${Math.round((assessments.filter((a) => a.confidence.band === "LOW").length / assessments.length) * 100)}%` : "INSUFFICIENT DATA"}
                kind="CALCULATED"
              />
            </div>
            <p className="label-xs mt-3">
              precision / recall accounting requires labelled outcomes over time; it stays INSUFFICIENT DATA until a persistent store is configured
            </p>
          </Panel>
        </div>
      ) : (
        <DataState state="DATA UNAVAILABLE" detail="The health report could not be produced." />
      )}
    </TerminalShell>
  );
}
