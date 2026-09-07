/**
 * Panels that read straight from the operator's Supabase project.
 *
 * These exist so every persistent surface can show what is actually stored in
 * the database, distinct from what the live snapshot derived a moment ago.
 */

import { Link } from "@tanstack/react-router";

import { Panel, Tag } from "@/components/kit";
import { Table, Td } from "@/components/kit2";
import { clockOf } from "@/lib/format";
import { useCalibrationMemory, useMemorySearch, useStoredChanges, useStoredInvestigations } from "@/hooks/useMemory";

function NotConfigured({ what }: { what: string }) {
  return (
    <p className="text-[11px] leading-snug text-unknown">
      MEMORY UNAVAILABLE — {what} cannot be read because this project's Supabase credentials or schema are missing. Open SYSTEM for
      the exact status.
    </p>
  );
}

export function StoredInvestigationsPanel() {
  const q = useStoredInvestigations();
  const d = q.data;
  return (
    <Panel
      title="PERSISTED INVESTIGATIONS · YOUR SUPABASE PROJECT"
      right={<Tag kind="STORED" label={d?.configured ? String(d.items.length) : "—"} />}
    >
      {!d ? (
        <p className="text-[11px] text-unknown">READING FROM DATABASE…</p>
      ) : !d.configured ? (
        <NotConfigured what="investigation records" />
      ) : !d.items.length ? (
        <p className="text-[11px] leading-snug text-unknown">
          NO INVESTIGATION RECORDS YET — records are written by each processing cycle. Run one from SYSTEM or wait for the schedule.
        </p>
      ) : (
        <Table head={["MARKET", "STATE", "PRIORITY", "RISK", "AGREEMENT", "UNKNOWNS", "CONFLICTS", "UPDATED"]}>
          {d.items.slice(0, 40).map((i) => (
            <tr key={i.id}>
              <Td className="num">
                <Link to="/pair/$chainId/$pairId" params={{ chainId: i.chainId, pairId: i.pairAddress }} className="hover:text-cyan">
                  {i.symbol}
                </Link>
              </Td>
              <Td className="num">{i.state}</Td>
              <Td className="num">{Math.round(i.priority)}</Td>
              <Td className="num">{i.riskSignal === null ? "—" : Math.round(i.riskSignal)}</Td>
              <Td className="num">{i.sourceAgreement ?? "—"}</Td>
              <Td className="num">{i.unknowns}</Td>
              <Td className="num">{i.conflicts}</Td>
              <Td className="num text-unknown">{clockOf(i.updatedAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

export function StoredMemoryPanel({ q }: { q: string }) {
  const query = useMemorySearch(q);
  const d = query.data;
  return (
    <Panel
      title="LONG-TERM MEMORY · YOUR SUPABASE PROJECT"
      right={<Tag kind="STORED" label={d?.configured ? String(d.items.length) : "—"} />}
    >
      {!d ? (
        <p className="text-[11px] text-unknown">READING FROM DATABASE…</p>
      ) : !d.configured ? (
        <NotConfigured what="stored market memory" />
      ) : !d.items.length ? (
        <p className="text-[11px] text-unknown">NO STORED MARKETS MATCH THIS SEARCH</p>
      ) : (
        <Table head={["MARKET", "CHAIN", "OBSERVATIONS", "CHANGES", "WATCHED", "FIRST SEEN", "LAST SEEN"]}>
          {d.items.map((m) => (
            <tr key={m.key}>
              <Td className="num">
                <Link to="/pair/$chainId/$pairId" params={{ chainId: m.chainId, pairId: m.pairAddress }} className="hover:text-cyan">
                  {m.symbol}
                </Link>
              </Td>
              <Td className="num text-unknown">{m.chainId}</Td>
              <Td className="num">{m.observations}</Td>
              <Td className="num">{m.changes}</Td>
              <Td className="num">{m.watched ? "YES" : "—"}</Td>
              <Td className="num text-unknown">{clockOf(m.firstSeenAt)}</Td>
              <Td className="num text-unknown">{clockOf(m.lastSeenAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

export function StoredChangesPanel() {
  const q = useStoredChanges();
  const d = q.data;
  return (
    <Panel title="RECORDED CHANGE EVENTS · YOUR SUPABASE PROJECT" right={<Tag kind="STORED" label={d?.configured ? String(d.items.length) : "—"} />}>
      {!d ? (
        <p className="text-[11px] text-unknown">READING FROM DATABASE…</p>
      ) : !d.configured ? (
        <NotConfigured what="change events" />
      ) : !d.items.length ? (
        <p className="text-[11px] leading-snug text-unknown">
          NO CHANGE EVENTS RECORDED YET — a change is only written when a stored observation differs materially from the previous one
          for the same market, so at least two cycles are needed.
        </p>
      ) : (
        <Table head={["MARKET", "FIELD", "BEFORE", "AFTER", "MAGNITUDE", "DETECTED"]}>
          {d.items.map((c, idx) => (
            <tr key={`${c.pairAddress}-${c.field}-${idx}`}>
              <Td className="num">{c.symbol}</Td>
              <Td className="num">{c.field}</Td>
              <Td className="num text-unknown">{c.before ?? "—"}</Td>
              <Td className="num">{c.after ?? "—"}</Td>
              <Td className="num">{c.magnitude === null ? "—" : `${Math.round(c.magnitude * 100)}%`}</Td>
              <Td className="num text-unknown">{clockOf(c.detectedAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

export function StoredCalibrationPanel() {
  const q = useCalibrationMemory();
  const d = q.data;
  return (
    <Panel title="RECORDED OUTCOMES AND CALIBRATION · YOUR SUPABASE PROJECT" right={<Tag kind="STORED" />}>
      {!d ? (
        <p className="text-[11px] text-unknown">READING FROM DATABASE…</p>
      ) : !d.configured ? (
        <NotConfigured what="outcome and calibration records" />
      ) : !d.outcomes ? (
        <p className="text-[11px] leading-snug text-unknown">
          INSUFFICIENT DATA — no research outcome has been recorded yet, so no accuracy figure can be stated. Calibration is computed
          from recorded outcomes only.
        </p>
      ) : (
        <Table head={["MODEL VERSION", "ASSESSED STATE", "CASES", "CONFIRMED", "UPDATED"]}>
          {d.buckets.map((b) => (
            <tr key={`${b.modelVersion}-${b.bucket}`}>
              <Td className="num max-w-[14rem] truncate">{b.modelVersion}</Td>
              <Td className="num">{b.bucket}</Td>
              <Td className="num">{b.cases}</Td>
              <Td className="num">{b.correct}</Td>
              <Td className="num text-unknown">{clockOf(b.updatedAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}
