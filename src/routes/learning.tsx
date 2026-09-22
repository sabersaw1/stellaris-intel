/**
 * LEARNING — recorded predictions and how they resolved.
 * Calibration only ever counts predictions that were written before the
 * outcome was knowable and resolved from later real observations.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { StatePill } from "@/components/kit2";
import { Empty, NeedsPanel, RowCard, Stack, StatStrip, SurfaceHead, when } from "@/components/surface";
import { learningIntel } from "@/lib/surfaces.functions";

export const Route = createFileRoute("/learning")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Learning — Stellaris Meme Intelligence" },
      { name: "description", content: "Recorded meme-coin research predictions, their resolved outcomes and honest calibration over time." },
      { property: "og:title", content: "Learning — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Only predictions resolved from later real observations count towards calibration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LearningPage,
});

function LearningPage() {
  const q = useQuery({ queryKey: ["learning"], queryFn: () => learningIntel(), refetchInterval: 30_000 });
  const d = q.data;
  const rows = d?.predictions ?? [];

  return (
    <TerminalShell>
      <SurfaceHead
        eyebrow="HISTORICAL MEMORY"
        title="LEARNING"
        blurb="Every automated research observation is recorded before its outcome is knowable, then resolved from later market data. Accuracy is reported only once enough resolved outcomes exist."
        right={<StatePill label={q.isFetching ? "SYNCING" : "STORED DATA"} tone={q.isFetching ? "info" : "ok"} />}
      />

      <StatStrip
        items={[
          { label: "PREDICTIONS RECORDED", value: String(rows.length) },
          { label: "RESOLVED", value: String(d?.resolved ?? 0), tone: "ok" },
          { label: "AWAITING HORIZON", value: String(d?.open ?? 0), tone: "info" },
          { label: "STRATEGY VERSIONS", value: d?.strategies === null || d?.strategies === undefined ? "UNKNOWN" : String(d.strategies) },
        ]}
      />

      <Stack>
        {d?.error ? <Empty title="DATABASE ERROR" hint={d.error} /> : null}
        {!d?.error && rows.length === 0 ? (
          <Empty
            title="NOTHING TO LEARN FROM YET"
            hint="Calibration needs recorded predictions whose horizon has already passed. The background research cycle writes these as it observes the market; nothing is back-filled."
          />
        ) : null}

        {rows.map((r) => (
          <RowCard
            key={r.id}
            title={r.subject ?? r.kind}
            subtitle={r.horizon ? `HORIZON ${r.horizon}` : null}
            pills={<StatePill label={r.resolvedAt ? (r.outcome ?? "RESOLVED") : "AWAITING HORIZON"} tone={r.resolvedAt ? "ok" : "info"} />}
            facts={[
              { label: "DIRECTION", value: r.kind },
              { label: "RECORDED", value: when(r.createdAt) },
              { label: "RESOLVED", value: when(r.resolvedAt) },
              { label: "OUTCOME", value: r.outcome ?? "NOT RESOLVED" },
            ]}
          />
        ))}

        {d ? <NeedsPanel persistence={d.availability.persistence} needs={d.availability.needs} note={d.availability.note} /> : null}
      </Stack>
    </TerminalShell>
  );
}
