/**
 * NARRATIVES — themes grouping several meme tokens, detected from stored
 * social and market observations. A narrative needs real grouped evidence;
 * nothing is themed speculatively.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { StatePill } from "@/components/kit2";
import { Empty, NeedsPanel, RowCard, Stack, StatStrip, SurfaceHead, when } from "@/components/surface";
import { narrativeIntel } from "@/lib/surfaces.functions";

export const Route = createFileRoute("/narratives")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Narratives — Stellaris Meme Intelligence" },
      { name: "description", content: "Meme-coin narrative tracking: emerging themes, the tokens inside them and the observations that formed them." },
      { property: "og:title", content: "Narratives — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Themes are formed from grouped observations, never assumed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NarrativesPage,
});

function NarrativesPage() {
  const q = useQuery({ queryKey: ["narratives"], queryFn: () => narrativeIntel(), refetchInterval: 20_000 });
  const d = q.data;
  const rows = d?.narratives ?? [];

  return (
    <TerminalShell>
      <SurfaceHead
        eyebrow="NARRATIVE ENGINE"
        title="NARRATIVES"
        blurb="Themes that several meme tokens share. A theme is only recorded once enough tokens and observations support it, and acceleration requires two social windows."
        right={<StatePill label={q.isFetching ? "SYNCING" : "STORED DATA"} tone={q.isFetching ? "info" : "ok"} />}
      />

      <StatStrip
        items={[
          { label: "NARRATIVES", value: String(rows.length) },
          { label: "EMERGING", value: String(rows.filter((r) => r.state === "EMERGING").length), tone: "info" },
          { label: "SOCIAL POSTS STORED", value: d?.posts === null || d?.posts === undefined ? "UNKNOWN" : String(d.posts) },
          { label: "THEME EVENTS", value: String(rows.reduce((n, r) => n + r.events, 0)) },
        ]}
      />

      <Stack>
        {d?.error ? <Empty title="DATABASE ERROR" hint={d.error} /> : null}
        {!d?.error && rows.length === 0 ? (
          <Empty
            title="NO NARRATIVES DETECTED YET"
            hint="Narrative detection needs social observations. Connect an X credential so mentions can be collected, grouped and compared across consecutive windows."
          />
        ) : null}

        {rows.map((r) => (
          <RowCard
            key={r.id}
            title={r.label}
            subtitle={r.description}
            pills={<StatePill label={r.state} tone={r.state === "EMERGING" ? "info" : "muted"} />}
            facts={[
              { label: "OBSERVATIONS", value: String(r.events) },
              { label: "FIRST SEEN", value: when(r.firstSeenAt) },
              { label: "LAST SEEN", value: when(r.lastSeenAt) },
              { label: "STATE", value: r.state },
            ]}
          />
        ))}

        {d ? <NeedsPanel persistence={d.availability.persistence} needs={d.availability.needs} note={d.availability.note} /> : null}
      </Stack>
    </TerminalShell>
  );
}
