/**
 * RESEARCH ENGINE — the automated pipeline, end to end.
 *
 * Everything shown here is read from the database: predictions written before
 * their outcome could be known, outcomes resolved from genuinely later market
 * observations, calibration computed from resolved rows only, signals with an
 * independent risk verdict, and paper positions that never touch real funds.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle, Tag } from "@/components/kit";
import { Btn, KV, StatePill, Table, Td, toneFor } from "@/components/kit2";
import { engineState, runResearchCycleNow, setTradingMode } from "@/lib/research-engine.functions";
import { secondsSince, usd } from "@/lib/format";

export const Route = createFileRoute("/engine")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Research Engine — Stellaris Intel" },
      {
        name: "description",
        content: "Automated research pipeline: features, market regime, recorded predictions, outcome resolution, calibration, signals, independent risk checks and paper trading.",
      },
      { property: "og:title", content: "Research Engine — Stellaris Intel" },
      { property: "og:description", content: "Calibration shows INSUFFICIENT DATA until enough real outcomes have matured. Live trading is disabled." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EnginePage,
});

function EnginePage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["engine", "state"], queryFn: () => engineState(), refetchInterval: 15_000, staleTime: 10_000 });
  const cycle = useMutation({
    mutationFn: () => runResearchCycleNow(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["engine", "state"] }),
  });
  const mode = useMutation({
    mutationFn: (m: string) => setTradingMode({ data: { mode: m } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["engine", "state"] }),
  });

  const s = q.data;
  const enough = (s?.counts.resolved ?? 0) >= (s?.minResolved ?? 20);
  const overall = s?.calibration.find((c) => c.scope === "OVERALL");

  return (
    <TerminalShell>
      <SectionTitle sub="The pipeline runs on its own: stored market observations become features and a market regime, a versioned strategy records a prediction with a horizon, and when that horizon has genuinely passed the prediction is resolved against real later market data. Calibration is derived from those resolved outcomes only.">
        RESEARCH ENGINE
      </SectionTitle>

      {!s?.configured && (
        <Panel title="NOT CONFIGURED" tone="strong">
          <p className="text-xs text-unknown">
            The database is not configured, so no research observation can be stored. Supply your Supabase project values
            and the engine begins recording on the next cycle.
          </p>
        </Panel>
      )}
      {s?.configured && !s.migrated && (
        <Panel title="MIGRATION REQUIRED" tone="strong">
          <p className="text-xs text-unknown">{s.error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Apply db/migrations/0006_stellaris_research_engine.sql in your Supabase SQL Editor.
          </p>
        </Panel>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="PIPELINE STATE" right={<Tag kind="STORED" />}>
          <KV label="TRACKED ASSETS" value={s?.universe.join(" ") || "UNAVAILABLE"} />
          <KV label="MARKETS ANALYSED" value={s?.regimes.length ? `${s.regimes.length} recent regime readings` : "WAITING FOR HISTORY"} />
          <KV label="PREDICTIONS RECORDED" value={s ? String(s.counts.predictions) : "UNAVAILABLE"} />
          <KV label="AWAITING HORIZON" value={s ? String(s.counts.open) : "UNAVAILABLE"} />
          <KV label="RESOLVED OUTCOMES" value={s ? String(s.counts.resolved) : "UNAVAILABLE"} />
          <KV label="UNRESOLVABLE" value={s ? String(s.counts.unresolvable) : "UNAVAILABLE"} />
          <div className="mt-3">
            <Btn onClick={() => cycle.mutate()} disabled={cycle.isPending || !s?.migrated}>
              {cycle.isPending ? "RUNNING CYCLE…" : "RUN ONE RESEARCH CYCLE NOW"}
            </Btn>
          </div>
          {cycle.data && (
            <p className="mt-2 text-[11px] leading-relaxed text-unknown">
              {cycle.data.marketsAnalysed} market(s) analysed, {cycle.data.predictionsStored} prediction(s) recorded,{" "}
              {cycle.data.predictionsResolved} resolved, {cycle.data.signalsStored} signal(s), {cycle.data.paperOpened} paper
              position(s) opened, {cycle.data.paperClosed} closed.
              {cycle.data.skipped.length ? ` Skipped: ${cycle.data.skipped.map((x) => `${x.asset} (${x.reason})`).join("; ")}` : ""}
              {cycle.data.errors.length ? ` Errors: ${cycle.data.errors.join("; ")}` : ""}
            </p>
          )}
        </Panel>

        <Panel title="CALIBRATION" right={<Tag kind="CALCULATED" />}>
          <KV label="RESOLVED CASES" value={s ? String(s.counts.resolved) : "UNAVAILABLE"} />
          <KV label="MINIMUM BEFORE ANY FIGURE" value={String(s?.minResolved ?? 20)} />
          <KV
            label="DIRECTIONAL ACCURACY"
            value={enough && overall?.accuracyPct !== null && overall ? `${overall.accuracyPct}%` : "INSUFFICIENT DATA"}
          />
          <KV label="BRIER SCORE" value={enough && overall?.brier !== null && overall ? overall.brier!.toFixed(4) : "INSUFFICIENT DATA"} />
          <KV label="AVERAGE PREDICTION ERROR" value={enough && overall?.avgError != null ? overall.avgError.toFixed(4) : "INSUFFICIENT DATA"} />
          <p className="mt-2 text-[11px] leading-relaxed text-unknown">
            No accuracy figure is displayed before {s?.minResolved ?? 20} real outcomes exist. Nothing is back-filled.
          </p>
        </Panel>

        <Panel title="TRADING MODE" right={<StatePill label={s?.mode.mode ?? "RESEARCH ONLY"} tone={toneFor(s?.mode.mode ?? "")} />}>
          <KV label="MODE" value={s?.mode.mode ?? "RESEARCH ONLY"} />
          <KV label="LIVE EXECUTION" value="DISABLED — no exchange is connected and no order can be submitted" />
          <KV label="EMERGENCY STOP" value={s?.risk?.["emergencyStop"] ? "ENGAGED" : "NOT ENGAGED"} />
          <KV label="NOTE" value={s?.mode.note ?? "—"} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={() => mode.mutate("PAPER TRADING")} disabled={mode.isPending}>PAPER TRADING</Btn>
            <Btn onClick={() => mode.mutate("RESEARCH ONLY")} disabled={mode.isPending}>RESEARCH ONLY</Btn>
            <Btn tone="danger" onClick={() => mode.mutate("EMERGENCY STOP")} disabled={mode.isPending}>EMERGENCY STOP</Btn>
          </div>
          {mode.data?.error && <p className="mt-2 text-[11px] text-signal-extreme">{mode.data.error}</p>}
        </Panel>
      </div>

      <Panel title="OPEN RESEARCH OBSERVATIONS (HORIZON NOT YET REACHED)" right={<Tag kind="STORED" />}>
        {!s?.openPredictions.length ? (
          <p className="text-xs text-unknown">NO OPEN PREDICTIONS — the engine records one only when a market has enough stored history.</p>
        ) : (
          <Table head={["ASSET", "DIRECTION", "CONFIDENCE", "HORIZON", "REGIME", "REFERENCE PRICE", "PREDICTED", "RESOLVES IN", "STRATEGY"]}>
            {s.openPredictions.map((p, i) => (
              <tr key={`${p.asset}-${p.strategy}-${i}`}>
                <Td className="num">{p.asset}</Td>
                <Td><StatePill label={p.direction} tone={toneFor(p.direction)} /></Td>
                <Td className="num">{p.probability === null ? "UNSTATED" : `${Math.round(p.probability * 100)}%`}</Td>
                <Td className="num">{p.horizon}m</Td>
                <Td className="num">{p.regime}</Td>
                <Td className="num">{p.referencePrice === null ? "UNAVAILABLE" : usd(p.referencePrice, 6)}</Td>
                <Td className="num">{secondsSince(p.predictedAt)}</Td>
                <Td className="num">{p.resolveAt > Date.now() ? `${Math.max(0, Math.round((p.resolveAt - Date.now()) / 60000))}m` : "DUE"}</Td>
                <Td className="num">{p.strategy} {p.version}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="RESOLVED OUTCOMES" right={<Tag kind="STORED" />}>
        {!s?.resolvedPredictions.length ? (
          <p className="text-xs text-unknown">NO RESOLVED OUTCOMES YET — predictions resolve only after their horizon has genuinely passed.</p>
        ) : (
          <Table head={["ASSET", "PREDICTED", "CONFIDENCE", "ACTUAL RETURN", "OUTCOME", "ERROR", "RESOLVED", "STRATEGY"]}>
            {s.resolvedPredictions.map((r, i) => (
              <tr key={`${r.asset}-${i}`}>
                <Td className="num">{r.asset}</Td>
                <Td className="num">{r.direction}</Td>
                <Td className="num">{r.probability === null ? "UNSTATED" : `${Math.round(r.probability * 100)}%`}</Td>
                <Td className="num">{r.actualReturn === null ? "UNAVAILABLE" : `${r.actualReturn.toFixed(3)}%`}</Td>
                <Td><StatePill label={r.outcome ?? "UNKNOWN"} tone={toneFor(r.outcome ?? "")} /></Td>
                <Td className="num">{r.error === null ? "—" : r.error.toFixed(3)}</Td>
                <Td className="num">{secondsSince(r.resolvedAt)}</Td>
                <Td className="num">{r.strategy}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="CALIBRATION BREAKDOWN" right={<Tag kind="CALCULATED" />}>
          {!s?.calibration.length ? (
            <p className="text-xs text-unknown">INSUFFICIENT DATA — no resolved outcomes recorded yet.</p>
          ) : (
            <Table head={["SCOPE", "BUCKET", "RESOLVED", "CORRECT", "ACCURACY", "BRIER"]}>
              {s.calibration.map((c) => (
                <tr key={`${c.scope}-${c.bucket}`}>
                  <Td className="num">{c.scope}</Td>
                  <Td className="num">{c.bucket}</Td>
                  <Td className="num">{c.resolved}</Td>
                  <Td className="num">{c.correct}</Td>
                  <Td className="num">{c.accuracyPct === null ? "INSUFFICIENT DATA" : `${c.accuracyPct}%`}</Td>
                  <Td className="num">{c.brier === null ? "—" : c.brier.toFixed(4)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="MARKET REGIME READINGS" right={<Tag kind="CALCULATED" />}>
          {!s?.regimes.length ? (
            <p className="text-xs text-unknown">NO REGIME READINGS YET — a market needs at least 12 stored observations.</p>
          ) : (
            <Table head={["ASSET", "REGIME", "BASIS", "AT"]}>
              {s.regimes.map((r, i) => (
                <tr key={`${r.asset}-${i}`}>
                  <Td className="num">{r.asset}</Td>
                  <Td><StatePill label={r.regime} tone={toneFor(r.regime)} /></Td>
                  <Td className="max-w-[18rem] truncate text-muted-foreground">{r.basis ?? "—"}</Td>
                  <Td className="num">{secondsSince(r.determinedAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>

      <Panel title="SIGNALS (WITH INDEPENDENT RISK VERDICT)" right={<Tag kind="STORED" />}>
        {!s?.signals.length ? (
          <p className="text-xs text-unknown">NO SIGNAL — nothing is generated without sufficient data.</p>
        ) : (
          <Table head={["ASSET", "DIRECTION", "CONFIDENCE", "REGIME", "RISK", "REASON", "STRATEGY", "CREATED"]}>
            {s.signals.map((sig, i) => (
              <tr key={`${sig.asset}-${i}`}>
                <Td className="num">{sig.asset}</Td>
                <Td><StatePill label={sig.direction} tone={toneFor(sig.direction)} /></Td>
                <Td className="num">{sig.confidence === null ? "UNSTATED" : `${Math.round(sig.confidence * 100)}%`}</Td>
                <Td className="num">{sig.regime ?? "UNKNOWN"}</Td>
                <Td><StatePill label={sig.riskVerdict ?? "UNKNOWN"} tone={sig.riskVerdict === "ACCEPTED" ? "ok" : "bad"} /></Td>
                <Td className="max-w-[20rem] truncate text-muted-foreground">{sig.riskReason ?? "—"}</Td>
                <Td className="num">{sig.strategy} {sig.version}</Td>
                <Td className="num">{secondsSince(sig.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="PAPER TRADING (SIMULATION ONLY)" right={<Tag kind="CALCULATED" />}>
          <KV label="OPEN POSITIONS" value={s ? String(s.paper.open.length) : "UNAVAILABLE"} />
          <KV label="CLOSED POSITIONS" value={s ? String(s.paper.closedCount) : "UNAVAILABLE"} />
          <KV label="REALIZED P&L" value={s?.paper.realizedPnl === null || !s ? "NO CLOSED POSITIONS YET" : usd(s.paper.realizedPnl, 2)} />
          <KV label="SIMULATED EQUITY" value={s?.paper.equity == null ? "UNAVAILABLE" : usd(s.paper.equity, 2)} />
          <KV label="EXPOSURE" value={s?.paper.exposure == null ? "UNAVAILABLE" : usd(s.paper.exposure, 2)} />
          <KV label="DRAWDOWN" value={s?.paper.drawdownPct == null ? "UNAVAILABLE" : `${s.paper.drawdownPct}%`} />
          <p className="mt-2 text-[11px] leading-relaxed text-unknown">
            Entries and exits are simulated over stored prices with explicit fee (0.10% per side) and slippage (0.15%)
            assumptions. No exchange account is connected and no real funds can be affected.
          </p>
        </Panel>

        <Panel title="RISK LIMITS (INDEPENDENT OF STRATEGIES)" right={<Tag kind="STORED" />}>
          {!s?.risk ? (
            <p className="text-xs text-unknown">UNAVAILABLE — apply migration 0006 to create the risk limits record.</p>
          ) : (
            <>
              <KV label="MAX POSITION" value={usd(Number(s.risk["maxPositionUsd"]), 0)} />
              <KV label="MAX PORTFOLIO EXPOSURE" value={usd(Number(s.risk["maxPortfolioExposure"]), 0)} />
              <KV label="MAX ASSET EXPOSURE" value={usd(Number(s.risk["maxAssetExposure"]), 0)} />
              <KV label="MAX DAILY LOSS" value={usd(Number(s.risk["maxDailyLoss"]), 0)} />
              <KV label="MAX DRAWDOWN" value={`${Number(s.risk["maxDrawdownPct"])}%`} />
              <KV label="MAX OPEN POSITIONS" value={String(Number(s.risk["maxOpenPositions"]))} />
              <KV label="VOLATILITY LIMIT" value={`${Number(s.risk["maxVolatilityPct"])}% per observation step`} />
              <KV label="MINIMUM LIQUIDITY" value={usd(Number(s.risk["minLiquidityUsd"]), 0)} />
            </>
          )}
        </Panel>
      </div>

      <Panel title="STRATEGY VERSIONS" right={<Tag kind="STORED" />}>
        {!s?.strategies.length ? (
          <p className="text-xs text-unknown">UNAVAILABLE — strategies are registered on the first research cycle.</p>
        ) : (
          <Table head={["NAME", "VERSION", "STATUS", "TIMEFRAME", "DESCRIPTION"]}>
            {s.strategies.map((st) => (
              <tr key={`${st.name}-${st.version}`}>
                <Td className="num">{st.name}</Td>
                <Td className="num">{st.version}</Td>
                <Td><StatePill label={st.status} tone={toneFor(st.status)} /></Td>
                <Td className="num">{st.timeframe ?? "—"}</Td>
                <Td className="max-w-[24rem] text-muted-foreground">{st.description ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-unknown">
          A rule change creates a new version. A version with historical results attached is never modified in place.
        </p>
      </Panel>
    </TerminalShell>
  );
}
