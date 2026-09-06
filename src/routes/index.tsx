import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { CosmicBackground } from "@/components/cosmos/CosmicBackground";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DEX Market Intelligence — Observatory Entry" },
      {
        name: "description",
        content:
          "Real-time decentralized market intelligence, risk analysis, and anomaly detection over live DEX Screener observations.",
      },
      { property: "og:title", content: "DEX Market Intelligence — Observatory Entry" },
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
        MARKET OBSERVATION SYSTEM
      </span>

      <h1 className="display text-4xl leading-tight tracking-[0.12em] text-foreground sm:text-6xl lg:text-7xl">
        DEX MARKET
        <br />
        <span className="text-cyan glow-cyan">INTELLIGENCE</span>
      </h1>

      <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Real-time decentralized market intelligence, risk analysis, and anomaly detection.
      </p>

      <Link
        to="/command"
        className="num mt-10 inline-flex items-center gap-2 rounded-sm border border-cyan/50 bg-cyan/10 px-5 py-3 text-[11px] tracking-[0.2em] text-cyan transition-colors hover:bg-cyan/20"
      >
        ENTER COMMAND CENTER <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      <p className="num mt-10 max-w-lg text-[10px] leading-relaxed tracking-[0.14em] text-unknown">
        RESEARCH TOOL ONLY · NO TRADING FUNCTIONALITY · ALL MARKET VALUES ARE OBSERVATIONS RETRIEVED FROM DEX SCREENER AND ARE LABELLED BY
        PROVENANCE
      </p>
    </main>
  );
}
