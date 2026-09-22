/**
 * HELP — the explain directory. Every metric the terminal shows, in plain
 * English: what it means, how it is worked out, where it comes from, how fresh
 * it can be, what its limits are, and what it does not mean.
 */

import { createFileRoute } from "@tanstack/react-router";

import { TerminalShell } from "@/components/TerminalShell";
import { Panel, SectionTitle } from "@/components/kit";
import { EXPLANATIONS } from "@/lib/explain";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & definitions — Stellaris Intel" },
      {
        name: "description",
        content:
          "Plain-English definitions for every Stellaris metric: meaning, calculation, source, freshness, limitations and what each number does not mean.",
      },
      { property: "og:title", content: "Help & definitions — Stellaris Intel" },
      { property: "og:description", content: "What every Stellaris number means, how it is calculated, and what it does not mean." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <TerminalShell>
      <SectionTitle sub="If a number is on screen, it is defined here. Anything that cannot be measured is reported as unknown, never as zero.">
        HELP &amp; DEFINITIONS
      </SectionTitle>

      <div className="grid gap-3 md:grid-cols-2">
        {EXPLANATIONS.map((e) => (
          <Panel key={e.key} title={e.title.toUpperCase()}>
            <dl className="space-y-2 text-xs">
              <Row term="What it means" desc={e.meaning} />
              {e.observedFact ? <Row term="Observed fact" desc={e.observedFact} /> : null}
              {e.interpretation ? <Row term="Interpretation (not a fact)" desc={e.interpretation} /> : null}
              <Row term="How it is calculated" desc={e.calculation} />
              <Row term="Where it comes from" desc={e.source} />
              <Row term="How fresh it is" desc={e.freshness} />
              <Row term="Limitations" desc={e.limitations} />
              <Row term="What it does NOT mean" desc={e.doesNotMean} emphasis />

            </dl>
          </Panel>
        ))}
      </div>
    </TerminalShell>
  );
}

function Row({ term, desc, emphasis }: { term: string; desc: string; emphasis?: boolean }) {
  return (
    <div>
      <dt className="label-xs">{term}</dt>
      <dd className={emphasis ? "text-signal-mid" : "text-muted-foreground"}>{desc}</dd>
    </div>
  );
}
