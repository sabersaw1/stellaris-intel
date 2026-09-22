/**
 * WALLETS — wallet intelligence from stored observations.
 * Reported activity is never presented as confirmed on-chain activity.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { StatePill } from "@/components/kit2";
import { Empty, NeedsPanel, RowCard, Stack, StatStrip, SurfaceHead, when } from "@/components/surface";
import { walletIntel } from "@/lib/surfaces.functions";

export const Route = createFileRoute("/wallets")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Wallets — Stellaris Meme Intelligence" },
      { name: "description", content: "Wallet intelligence for meme coins: monitored addresses, attribution evidence and observed wallet events." },
      { property: "og:title", content: "Wallets — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Attribution is explicit; reported activity is never shown as confirmed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletsPage,
});

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-5)}` : a);

function WalletsPage() {
  const q = useQuery({ queryKey: ["wallets"], queryFn: () => walletIntel(), refetchInterval: 15_000 });
  const d = q.data;
  const rows = d?.wallets ?? [];

  return (
    <TerminalShell>
      <SurfaceHead
        eyebrow="WALLET INTELLIGENCE"
        title="WALLETS"
        blurb="Addresses observed acting on meme tokens. Attribution to a trader stays POSSIBLE or UNKNOWN until on-chain evidence confirms it."
        right={<StatePill label={q.isFetching ? "SYNCING" : "STORED DATA"} tone={q.isFetching ? "info" : "ok"} />}
      />

      <StatStrip
        items={[
          { label: "WALLETS STORED", value: String(rows.length) },
          { label: "MONITORED", value: String(rows.filter((r) => r.monitored).length), tone: "info" },
          { label: "OBSERVED EVENTS", value: String(rows.reduce((n, r) => n + r.events, 0)) },
          { label: "UNATTRIBUTED", value: String(rows.filter((r) => r.attribution === "UNKNOWN").length), tone: "muted" },
        ]}
      />

      <Stack>
        {d?.error ? <Empty title="DATABASE ERROR" hint={d.error} /> : null}
        {!d?.error && rows.length === 0 ? (
          <Empty
            title="NO WALLET ACTIVITY STORED YET"
            hint="Wallet records require an on-chain source. Configure a Solana RPC endpoint for transfers, holders and mint authority, or FOMO for reported (unverified) wallet activity."
          />
        ) : null}

        {rows.map((r) => (
          <RowCard
            key={r.id}
            title={r.label ?? short(r.address)}
            subtitle={`${r.chainId.toUpperCase()} · ${short(r.address)}`}
            pills={
              <>
                <StatePill label={r.attribution} tone={r.attribution === "VERIFIED" ? "ok" : r.attribution === "UNKNOWN" ? "muted" : "warn"} />
                {r.monitored ? <StatePill label="MONITORED" tone="info" /> : null}
              </>
            }
            facts={[
              { label: "OBSERVED EVENTS", value: String(r.events) },
              { label: "CHAIN", value: r.chainId },
              { label: "LAST SEEN", value: when(r.lastSeenAt) },
              { label: "ATTRIBUTION", value: r.attribution },
            ]}
          />
        ))}

        {d ? <NeedsPanel persistence={d.availability.persistence} needs={d.availability.needs} note={d.availability.note} /> : null}
      </Stack>
    </TerminalShell>
  );
}
