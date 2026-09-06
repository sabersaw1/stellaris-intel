import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TerminalShell } from "@/components/TerminalShell";
import { EmptyState, Panel, SectionTitle, SourceLine, Tag } from "@/components/kit";
import { Btn, StatePill, Table, Td } from "@/components/kit2";
import { useStoreTick } from "@/hooks/useBrain";
import { clearAudit, getAudit, subscribeAudit, type AuditEntry } from "@/lib/incidents";
import { clockOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/audit")({
  // Browser-local stores drive this page, so it renders on the client only.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Audit Log — Market Intelligence OS" },
      {
        name: "description",
        content: "Chronological record of configuration and integration actions taken in this terminal, with credential values redacted.",
      },
      { property: "og:title", content: "Audit Log — Market Intelligence OS" },
      { property: "og:description", content: "Secrets are never stored in the log; values that name a credential are redacted." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

const AREAS: (AuditEntry["area"] | "ALL")[] = ["ALL", "INTEGRATION", "ACCOUNT", "WORKFLOW", "PERMISSIONS", "SETTINGS", "ALERTS", "SYSTEM", "WORKSPACE"];

function AuditPage() {
  const tick = useStoreTick(subscribeAudit);
  const all = useMemo(() => getAudit(), [tick]);
  const [area, setArea] = useState<AuditEntry["area"] | "ALL">("ALL");
  const rows = area === "ALL" ? all : all.filter((a) => a.area === area);

  return (
    <TerminalShell>
      <SectionTitle sub="Every configuration change made in this terminal is recorded. Credential values are never written here.">AUDIT LOG</SectionTitle>

      <Panel className="mb-4" title="AREA" right={<Tag kind="CALCULATED" />}>
        <div className="flex flex-wrap items-center gap-2">
          {AREAS.map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={cn("num rounded-sm border px-2 py-1 text-[10px] tracking-[0.14em]", area === a ? "border-cyan/60 text-cyan" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {a} <span className="text-unknown">{a === "ALL" ? all.length : all.filter((x) => x.area === a).length}</span>
            </button>
          ))}
          <Btn tone="danger" onClick={() => clearAudit()}>CLEAR</Btn>
        </div>
      </Panel>

      {!rows.length ? (
        <EmptyState title="NO ACTIONS RECORDED" hint="Actions appear here as you add accounts, edit workflows, change settings or create alerts." />
      ) : (
        <Panel title={`ENTRIES · ${rows.length}`} right={<Tag kind="CALCULATED" />}>
          <Table head={["TIME", "AREA", "ACTION", "DETAIL", "ACTOR"]}>
            {rows.slice(0, 200).map((e) => (
              <tr key={e.id}>
                <Td className="num whitespace-nowrap text-unknown">{clockOf(e.t)}</Td>
                <Td><StatePill label={e.area} tone="info" /></Td>
                <Td className="num">{e.action}</Td>
                <Td className="max-w-[26rem] text-[11px] text-muted-foreground">{e.detail}</Td>
                <Td className="num text-unknown">{e.actor}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      <div className="mt-4">
        <SourceLine observedAt={null} calculatedAt={rows[0]?.t ?? null} engineVersion="audit-log v1.0" />
      </div>
    </TerminalShell>
  );
}
