/**
 * STELLARIS READ HOOK
 *
 * One subscription point for the six surfaces. Investigations are derived from
 * the live market snapshot plus locally recorded state; nothing is generated on
 * a timer and nothing is simulated.
 */

import { useEffect, useMemo, useState } from "react";

import { useMarketIntelligence } from "./useMarket";
import { buildInvestigation, prioritise, sourceRegister, type Investigation } from "@/lib/stellaris";
import { subscribeStore } from "@/lib/local-store";
import { subscribeJobs } from "@/lib/jobs";

export function useStellaris() {
  const { assessments, pairs, peers, envelope, query } = useMarketIntelligence();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    const bump = () => queueMicrotask(() => mounted && setTick((t) => t + 1));
    const offStore = subscribeStore(bump);
    const offJobs = subscribeJobs(bump);
    return () => {
      mounted = false;
      offStore();
      offJobs();
    };
  }, []);

  const sourceOk = Boolean(envelope?.ok);
  const stale = Boolean(envelope?.stale);

  const investigations: Investigation[] = useMemo(
    () => prioritise(assessments.map((a) => buildInvestigation(a, { peerCount: peers.count, sourceOk, stale }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.dataUpdatedAt, assessments.length, tick, sourceOk, stale],
  );

  const watched = investigations.filter((i) => i.watched);
  const active = investigations.filter((i) => i.state === "INVESTIGATING" || i.state === "TRIAGING");
  const changes = investigations.filter((i) => i.changed);
  const conflicting = investigations.filter((i) => i.conflicting.length);
  const degraded = investigations.filter((i) => i.dataDegraded).length;

  const sources = sourceRegister(
    Object.keys(investigations).length ? investigations.reduce((s, i) => s + i.historyPoints, 0) : 0,
    peers.count,
    sourceOk,
    stale,
  );

  return { query, envelope, pairs, peers, investigations, watched, active, changes, conflicting, degraded, sources };
}

/** Plain-English description of what the application is actually doing now. */
export function stellarisActivity(s: ReturnType<typeof useStellaris>): { line: string; state: string }[] {
  const out: { line: string; state: string }[] = [];
  if (s.query.isFetching) out.push({ line: "Stellaris is discovering and collecting newly appearing markets", state: "RUNNING" });
  if (s.active.length) out.push({ line: `Stellaris is investigating ${s.active.length} market(s) in the research queue`, state: "RUNNING" });
  if (s.changes.length) out.push({ line: `Stellaris detected ${s.changes.length} meaningful change(s) between recorded observations`, state: "RECORDED" });
  if (s.conflicting.length) out.push({ line: `Stellaris is checking ${s.conflicting.length} market(s) where its own readings disagree`, state: "RUNNING" });
  if (s.watched.length) out.push({ line: `Stellaris is monitoring ${s.watched.length} watchlist market(s)`, state: "MONITORING" });
  if (s.degraded) out.push({ line: `${s.degraded} observation(s) are older than the freshness window`, state: "DEGRADED" });
  if (!s.investigations.length) out.push({ line: "Stellaris is waiting for the first market observation of this session", state: "WAITING" });
  out.push({
    line: "Continuous research runs while this terminal is open; no background worker is deployed",
    state: "NOT CONFIGURED",
  });
  return out;
}
