/**
 * MORE — the mobile hub. Every surface stays reachable on a phone from here,
 * grouped by what it does, with large touch targets.
 */

import { createFileRoute, Link } from "@tanstack/react-router";

import { TerminalShell } from "@/components/TerminalShell";
import { SurfaceHead } from "@/components/surface";

export const Route = createFileRoute("/more")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "More — Stellaris Meme Intelligence" },
      { name: "description", content: "All Stellaris surfaces: intelligence, research, evidence, simulation, learning, connections and help." },
      { property: "og:title", content: "More — Stellaris Meme Intelligence" },
      { property: "og:description", content: "Every screen of the meme-coin intelligence terminal, one tap away." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MorePage,
});

const GROUPS: { title: string; items: { to: string; label: string; blurb: string }[] }[] = [
  {
    title: "INTELLIGENCE",
    items: [
      { to: "/command", label: "HOME", blurb: "Command centre: what changed and what needs attention" },
      { to: "/radar", label: "RADAR", blurb: "New, accelerating, deteriorating and high-risk meme tokens" },
      { to: "/meme", label: "TOKEN DOSSIERS", blurb: "Per-token evidence, contradictions and unknowns" },
      { to: "/narratives", label: "NARRATIVES", blurb: "Themes shared across several meme tokens" },
      { to: "/stream", label: "STREAM", blurb: "Raw detected-change feed" },
    ],
  },
  {
    title: "EVIDENCE",
    items: [
      { to: "/traders", label: "TRADERS", blurb: "Trader records and attribution confidence" },
      { to: "/wallets", label: "WALLETS", blurb: "Monitored addresses and observed events" },
      { to: "/watchlist", label: "WATCHLIST", blurb: "What you asked Stellaris to keep watching" },
      { to: "/alerts", label: "ALERTS", blurb: "Threshold breaches with the reason attached" },
      { to: "/contradictions", label: "CONTRADICTIONS", blurb: "Where sources disagree" },
    ],
  },
  {
    title: "RESEARCH & DECISIONS",
    items: [
      { to: "/investigations", label: "INVESTIGATIONS", blurb: "Open research threads" },
      { to: "/research", label: "RESEARCH QUEUE", blurb: "What is queued and why" },
      { to: "/paper", label: "PAPER TRADING", blurb: "Simulated positions and your journal" },
      { to: "/risk", label: "RISK", blurb: "Independent risk signals" },
      { to: "/engine", label: "RESEARCH ENGINE", blurb: "Strategy versions, regimes and backtests" },
    ],
  },
  {
    title: "MEMORY & LEARNING",
    items: [
      { to: "/learning", label: "LEARNING", blurb: "Predictions and how they actually resolved" },
      { to: "/memory", label: "MEMORY", blurb: "Historical similarity and stored history" },
      { to: "/calibration", label: "CALIBRATION", blurb: "Accuracy from resolved outcomes only" },
      { to: "/timemachine", label: "TIME MACHINE", blurb: "Replay a past market state" },
      { to: "/postmortems", label: "POST-MORTEMS", blurb: "What was missed and why" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { to: "/connections", label: "CONNECTIONS", blurb: "Data sources, credentials and live tests" },
      { to: "/settings", label: "SETTINGS", blurb: "Supabase project, migrations and policy" },
      { to: "/system", label: "SYSTEM HEALTH", blurb: "Freshness, failures and background cycle" },
      { to: "/audit", label: "AUDIT LOG", blurb: "Every action the system took" },
      { to: "/help", label: "HELP & DEFINITIONS", blurb: "What each metric means" },
    ],
  },
];

function MorePage() {
  return (
    <TerminalShell>
      <SurfaceHead eyebrow="NAVIGATION" title="MORE" blurb="Every Stellaris surface, grouped by what it does. Live trading is permanently disabled." />

      <div className="grid min-w-0 gap-4">
        {GROUPS.map((g) => (
          <section key={g.title} className="min-w-0">
            <p className="label-xs mb-2">{g.title}</p>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              {g.items.map((i) => (
                <Link
                  key={i.to}
                  to={i.to}
                  className="panel anim-in min-w-0 px-3 py-3 transition-colors hover:border-cyan/40"
                >
                  <p className="num truncate text-xs tracking-[0.12em] text-foreground">{i.label}</p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{i.blurb}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </TerminalShell>
  );
}
