import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { CosmicBackground } from "@/components/cosmos/CosmicBackground";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stellaris Intel — Market Intelligence Command Center" },
      {
        name: "description",
        content:
          "Real-time decentralized market intelligence, risk analysis, and anomaly detection over live DEX Screener observations.",
      },
      { property: "og:title", content: "Stellaris Intel — Market Intelligence Command Center" },
      {
        property: "og:description",
        content: "Enter the terminal: live pair observations, transparent risk scoring, multi-agent analysis, anomaly detection.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 text-center">
      <CosmicBackground intensity={1.2} />

      <span className="num mb-6 rounded-full border border-border px-3 py-1 text-[10px] tracking-[0.28em] text-muted-foreground">
        CONTINUOUS MARKET INTELLIGENCE SYSTEM
      </span>

      <h1 className="display text-4xl leading-tight tracking-[0.12em] text-foreground sm:text-6xl lg:text-7xl">
        STELLARIS
        <br />
        <span className="text-cyan glow-cyan">INTEL</span>
      </h1>

      <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Stellaris continuously discovers markets, triages what deserves attention, investigates what matters and remembers what it found — and says UNKNOWN when it cannot verify something.
      </p>

      <Link
        to="/command"
        className="num mt-10 inline-flex items-center gap-2 rounded-sm border border-cyan/50 bg-cyan/10 px-5 py-3 text-[11px] tracking-[0.2em] text-cyan transition-colors hover:bg-cyan/20"
      >
        ENTER COMMAND <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      <p className="num mt-10 max-w-lg text-[10px] leading-relaxed tracking-[0.14em] text-unknown">
        RESEARCH TOOL ONLY · NO TRADING FUNCTIONALITY · ALL MARKET VALUES ARE OBSERVATIONS RETRIEVED FROM DEX SCREENER AND ARE LABELLED BY
        PROVENANCE
      </p>
    </main>
  );
}
