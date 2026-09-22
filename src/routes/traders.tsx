/**
 * TRADERS — trader intelligence built from stored, attributed records only.
 * A trader appears here only when a source reported them; attribution
 * confidence is always shown and never upgraded without evidence.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { StatePill } from "@/components/kit2";
import { Empty, NeedsPanel, RowCard, Stack, StatStrip, SurfaceHead, when } from "@/components/surface";
import { traderIntel } from "@/lib/surfaces.functions";

export const Route = createFileRoute("/traders")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Traders — Stellaris Meme Intelligence" },
      { name: "description", content: "Meme-coin trader intelligence: monitored traders, linked accounts and wallets, with explicit attribution confidence." },
      { property: "og:title", content: "Traders — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Every trader record states its origin and how confidently it is attributed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TradersPage,
});

function TradersPage() {
  const q = useQuery({ queryKey: ["traders"], queryFn: () => traderIntel(), refetchInterval: 15_000 });
  const d = q.data;
  const rows = d?.traders ?? [];

  return (
    <TerminalShell>
      <SurfaceHead
        eyebrow="TRADER INTELLIGENCE"
        title="TRADERS"
        blurb="Traders observed by a configured source. Attribution confidence is stated on every record — POSSIBLE is never shown as VERIFIED."
        right={<StatePill label={q.isFetching ? "SYNCING" : "STORED DATA"} tone={q.isFetching ? "info" : "ok"} />}
      />

      <StatStrip
        items={[
          { label: "TRADERS STORED", value: String(rows.length) },
          { label: "MONITORED", value: String(rows.filter((r) => r.monitored).length), tone: "info" },
          { label: "VERIFIED", value: String(rows.filter((r) => r.confidence === "VERIFIED").length), tone: "ok" },
          { label: "UNKNOWN ATTRIBUTION", value: String(rows.filter((r) => r.confidence === "UNKNOWN").length), tone: "muted" },
        ]}
      />

      <Stack>
        {d?.error ? <Empty title="DATABASE ERROR" hint={d.error} /> : null}
        {!d?.error && rows.length === 0 ? (
          <Empty
            title="NO TRADERS STORED YET"
            hint="Trader records are created only from a configured source. Connect FOMO for reported trader activity, or a Solana RPC to confirm wallet behaviour on-chain."
          />
        ) : null}

        {rows.map((r) => (
          <RowCard
            key={r.id}
            title={r.name}
            subtitle={`ORIGIN ${r.origin}`}
            pills={
              <>
                <StatePill label={r.confidence} tone={r.confidence === "VERIFIED" ? "ok" : r.confidence === "UNKNOWN" ? "muted" : "warn"} />
                {r.monitored ? <StatePill label="MONITORED" tone="info" /> : null}
              </>
            }
            facts={[
              { label: "LINKED ACCOUNTS", value: String(r.accounts) },
              { label: "LINKED WALLETS", value: String(r.wallets) },
              { label: "LAST UPDATED", value: when(r.updatedAt) },
              { label: "SOURCE", value: r.origin },
            ]}
          />
        ))}

        {d ? <NeedsPanel persistence={d.availability.persistence} needs={d.availability.needs} note={d.availability.note} /> : null}
      </Stack>
    </TerminalShell>
  );
}
