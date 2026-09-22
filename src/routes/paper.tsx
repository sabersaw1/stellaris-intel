/**
 * PAPER TRADING — simulation and the user's own journal.
 * Real-money execution is hard-disabled system-wide and cannot be toggled here.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { StatePill } from "@/components/kit2";
import { Empty, NeedsPanel, RowCard, Stack, StatStrip, SurfaceHead, when } from "@/components/surface";
import { paperIntel } from "@/lib/surfaces.functions";

export const Route = createFileRoute("/paper")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Paper Trading — Stellaris Meme Intelligence" },
      { name: "description", content: "Simulated meme-coin positions and the personal trade journal. Real-money execution is permanently disabled." },
      { property: "og:title", content: "Paper Trading — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Simulation only: no orders are ever sent to any venue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaperPage,
});

const money = (v: number | null) => (v === null || !Number.isFinite(v) ? "UNKNOWN" : `$${Number(v).toLocaleString()}`);

function PaperPage() {
  const q = useQuery({ queryKey: ["paper"], queryFn: () => paperIntel(), refetchInterval: 15_000 });
  const d = q.data;
  const positions = d?.positions ?? [];
  const journal = d?.journal ?? [];

  return (
    <TerminalShell>
      <SurfaceHead
        eyebrow="SIMULATION"
        title="PAPER TRADING"
        blurb="Positions are simulated against observed prices, and your journal records the decisions you actually made. Stellaris never places an order."
        right={<StatePill label="LIVE TRADING DISABLED" tone="bad" />}
      />

      <StatStrip
        items={[
          { label: "OPEN SIMULATED", value: String(positions.filter((p) => !p.closedAt).length), tone: "info" },
          { label: "CLOSED SIMULATED", value: String(positions.filter((p) => p.closedAt).length) },
          { label: "JOURNAL ENTRIES", value: String(journal.length) },
          { label: "AGENT PROPOSALS", value: d?.proposals === null || d?.proposals === undefined ? "UNKNOWN" : String(d.proposals), tone: "muted" },
        ]}
      />

      <Stack>
        {d?.error ? <Empty title="DATABASE ERROR" hint={d.error} /> : null}

        <div className="panel min-w-0 p-3">
          <p className="label-xs">EXECUTION POLICY</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Real-money execution is hard-disabled in code. Agent proposals are stored as advisory records with executed = false and are never acted on. The
            trading decision is always yours.
          </p>
        </div>

        {positions.length === 0 ? (
          <Empty
            title="NO SIMULATED POSITIONS YET"
            hint="Simulated positions are opened by the research engine only when a strategy version produces a signal from stored observations."
          />
        ) : (
          positions.map((p) => (
            <RowCard
              key={p.id}
              title={p.symbol ?? "SIMULATED POSITION"}
              subtitle={p.side ?? null}
              pills={<StatePill label={p.closedAt ? "CLOSED" : "OPEN"} tone={p.closedAt ? "muted" : "info"} />}
              facts={[
                { label: "SIZE", value: money(p.sizeUsd) },
                { label: "ENTRY", value: money(p.entryPrice) },
                { label: "EXIT", value: money(p.exitPrice) },
                { label: "OPENED", value: when(p.openedAt) },
              ]}
            />
          ))
        )}

        <div className="mt-2">
          <p className="label-xs mb-2">YOUR JOURNAL</p>
          {journal.length === 0 ? (
            <Empty title="JOURNAL EMPTY" hint="Your own trades are recorded here so outcomes can later be compared with what the research said at the time." />
          ) : (
            <Stack>
              {journal.map((j) => (
                <RowCard
                  key={j.id}
                  title={j.side ?? "TRADE"}
                  subtitle={when(j.openedAt)}
                  facts={[
                    { label: "SIZE", value: money(j.sizeUsd) },
                    { label: "ENTRY", value: money(j.entryPrice) },
                    { label: "EXIT", value: money(j.exitPrice) },
                    { label: "REALIZED", value: money(j.pnl) },
                  ]}
                />
              ))}
            </Stack>
          )}
        </div>

        {d ? <NeedsPanel persistence={d.availability.persistence} needs={d.availability.needs} note={d.availability.note} /> : null}
      </Stack>
    </TerminalShell>
  );
}
