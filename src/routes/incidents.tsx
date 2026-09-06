import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, KV, StatePill, toneFor } from "@/components/kit2";
import { useGlobalBrain, useStoreTick } from "@/hooks/useBrain";
import { INCIDENT_VERSION, clearIncidents, getIncidents, resolveIncident, subscribeIncidents } from "@/lib/incidents";
import { clockOf } from "@/lib/format";

export const Route = createFileRoute("/incidents")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Incidents — Market Intelligence OS" },
      {
        name: "description",
        content: "Real failures recorded by the system: what failed, why, what is affected and what to do about it — with no silent degradation.",
      },
      { property: "og:title", content: "Incidents — Market Intelligence OS" },
      { property: "og:description", content: "An incident exists only when a genuine failure was observed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IncidentsPage,
});

function IncidentsPage() {
  const brain = useGlobalBrain();
  const tick = useStoreTick(subscribeIncidents);
  const incidents = useMemo(() => getIncidents(), [tick, brain.cycle]);
  const open = incidents.filter((i) => i.status === "OPEN");

  return (
    <TerminalShell>
      <SectionTitle sub="Failures are surfaced here instead of being hidden behind a spinner. Each entry states what failed, why, what it affects and the suggested action.">
        INCIDENTS
      </SectionTitle>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Panel title="OPEN INCIDENTS" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{open.length}</p>
        </Panel>
        <Panel title="TOTAL RECORDED" right={<Tag kind="CALCULATED" />}>
          <p className="num text-2xl">{incidents.length}</p>
        </Panel>
        <Panel title="ACTIONS" right={<Tag kind="VISUAL" />}>
          <Btn tone="danger" onClick={() => clearIncidents()}>CLEAR RESOLVED HISTORY</Btn>
        </Panel>
      </div>

      {!incidents.length ? (
        <EmptyState title="NO INCIDENTS RECORDED" hint="Nothing has failed since this store was created. Upstream errors, integration failures and workflow failures all appear here automatically." />
      ) : (
        <div className="space-y-3">
          {incidents.map((i) => (
            <Panel key={i.id} title={`${i.kind} · ${i.title}`} right={<StatePill label={i.status} tone={i.status === "OPEN" ? "bad" : "ok"} />}>
              <KV label="WHAT HAPPENED" value={i.what} />
              <KV label="WHY" value={i.why} />
              <KV label="AFFECTED" value={i.affected} />
              <KV label="SUGGESTED ACTION" value={i.action} />
              <KV label="SOURCE" value={i.source} />
              <KV label="OPENED" value={new Date(i.openedAt).toLocaleString()} />
              <KV label="LAST SEEN" value={clockOf(i.lastSeenAt)} />
              <KV label="OCCURRENCES" value={String(i.occurrences)} />
              {i.status === "OPEN" && (
                <div className="mt-3">
                  <Btn onClick={() => resolveIncident(i.id)}>MARK RESOLVED</Btn>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      <div className="mt-4">
        <SourceLine observedAt={brain.envelope?.observedAt ?? null} calculatedAt={brain.cycle?.ranAt ?? null} engineVersion={INCIDENT_VERSION} />
      </div>
    </TerminalShell>
  );
}
