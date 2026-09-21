/**
 * PROVIDERS — what each data provider is for, exactly which credential is
 * missing, where to get it, whether it costs money, and its live state.
 * Nothing here requires reading source code.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle, Tag } from "@/components/kit";
import { KV, StatePill, toneFor } from "@/components/kit2";
import { providerStatus } from "@/lib/research-engine.functions";
import { secondsSince } from "@/lib/format";

export const Route = createFileRoute("/providers")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Data Providers — Stellaris Intel" },
      {
        name: "description",
        content: "Every data provider Stellaris can use: purpose, required credential, where to obtain it, cost, connection status and last successful request.",
      },
      { property: "og:title", content: "Data Providers — Stellaris Intel" },
      { property: "og:description", content: "Optional providers stay NOT CONFIGURED and contribute nothing until you supply a credential." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProvidersPage,
});

function ProvidersPage() {
  const q = useQuery({ queryKey: ["providers"], queryFn: () => providerStatus(), refetchInterval: 30_000, staleTime: 15_000 });
  const items = q.data ?? [];

  return (
    <TerminalShell>
      <SectionTitle
        title="DATA PROVIDERS"
        sub="Each provider below states its purpose, the exact credential it needs, where that credential comes from, whether it costs money, and whether it is currently connected. Optional providers contribute no data and incur no cost while they read NOT CONFIGURED."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((p) => (
          <Panel
            key={p.id}
            title={p.name}
            right={<StatePill label={p.status} tone={toneFor(p.status)} />}
          >
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{p.purpose}</p>
            <div className="grid gap-1">
              <KV k="REQUIRED" v={p.required ? "YES — the system cannot work without it" : "OPTIONAL"} />
              <KV k="CREDENTIAL" v={p.credential} />
              <KV k="WHERE TO OBTAIN" v={p.whereToGet} />
              <KV k="COST" v={p.pricing} />
              <KV k="LAST SUCCESSFUL REQUEST" v={p.lastOkAt ? secondsSince(p.lastOkAt) : "NO SUCCESSFUL REQUEST RECORDED"} />
              <KV k="ERROR" v={p.error ?? "NONE RECORDED"} />
            </div>
            <p className="mt-3 border-t border-border/50 pt-2 text-[11px] leading-relaxed text-unknown">{p.detail}</p>
          </Panel>
        ))}
      </div>

      <Panel title="HOW TO SUPPLY A CREDENTIAL" right={<Tag kind="STORED" />}>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Credentials are stored as server-side secrets and are never placed in the interface, the browser bundle or the
          repository. Ask for the secure form in chat and paste the value there; the matching adapter switches from NOT
          CONFIGURED to AVAILABLE on the next cycle, with no code change.
        </p>
      </Panel>
    </TerminalShell>
  );
}
