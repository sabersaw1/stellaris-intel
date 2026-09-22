/**
 * SETTINGS — backend truth: which Supabase project is in use, which migrations
 * are actually applied, stored configuration and execution policy.
 * No secret value is ever sent to the browser.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { TerminalShell } from "@/components/TerminalShell";
import { StatePill } from "@/components/kit2";
import { Empty, Stack, StatStrip, SurfaceHead } from "@/components/surface";
import { settingsReport } from "@/lib/surfaces.functions";

export const Route = createFileRoute("/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Settings — Stellaris Meme Intelligence" },
      { name: "description", content: "Backend status for Stellaris: Supabase project, applied migrations, stored configuration and execution policy." },
      { property: "og:title", content: "Settings — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Truthful backend state. Secrets stay on the server." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const q = useQuery({ queryKey: ["settings-report"], queryFn: () => settingsReport(), refetchInterval: 60_000 });
  const d = q.data;
  const missing = (d?.schema ?? []).filter((s) => !s.present);

  return (
    <TerminalShell>
      <SurfaceHead
        eyebrow="SYSTEM"
        title="SETTINGS"
        blurb="Stellaris stores everything in your own Supabase project. This screen reports exactly what the server can reach right now."
        right={<StatePill label={d?.supabase.configured ? "SUPABASE CONNECTED" : "SUPABASE NOT CONFIGURED"} tone={d?.supabase.configured ? "ok" : "bad"} />}
      />

      <StatStrip
        items={[
          { label: "BACKEND", value: "SUPABASE (YOUR PROJECT)", tone: "ok" },
          { label: "PROJECT HOST", value: d?.supabase.projectHost ?? "UNKNOWN" },
          { label: "TABLES MISSING", value: String(missing.length), tone: missing.length ? "warn" : "ok" },
          { label: "LIVE TRADING", value: "DISABLED", tone: "bad" },
        ]}
      />

      <Stack>
        <div className="panel min-w-0 p-3">
          <p className="label-xs mb-2">DATABASE TABLES</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {(d?.schema ?? []).map((s) => (
              <li key={s.table} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <span className="num truncate text-[11px] text-foreground/90">
                  {s.table} <span className="text-unknown">· {s.migration}</span>
                </span>
                <StatePill label={s.present ? "PRESENT" : "MISSING"} tone={s.present ? "ok" : "bad"} />
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-signal-mid">
              Apply the matching migration files from <span className="num">db/migrations/</span> in your Supabase SQL editor to create the missing tables.
            </p>
          )}
        </div>

        <div className="panel min-w-0 p-3">
          <p className="label-xs mb-2">STORED CONFIGURATION</p>
          {(d?.settings ?? []).length === 0 ? (
            <Empty title="NO STORED SETTINGS" hint="Configuration rows are written by the collection pipeline as it runs." />
          ) : (
            <ul className="space-y-1.5">
              {(d?.settings ?? []).map((s) => (
                <li key={s.key} className="min-w-0">
                  <p className="label-xs truncate">{s.key}</p>
                  <p className="num break-words text-[11px] text-foreground/90">{s.value}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel min-w-0 p-3">
          <p className="label-xs mb-2">ACCESS</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span className="min-w-0 text-xs text-muted-foreground">Local agent / Jarvis API</span>
            <StatePill label={d?.agentApiConfigured ? "ENABLED" : "NOT CONFIGURED"} tone={d?.agentApiConfigured ? "ok" : "muted"} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Provider credentials are managed on{" "}
            <Link to="/connections" className="text-cyan">
              CONNECTIONS
            </Link>
            . Secrets live on the server only — they are never sent to this page, stored in the browser or written into links.
          </p>
        </div>
      </Stack>
    </TerminalShell>
  );
}
