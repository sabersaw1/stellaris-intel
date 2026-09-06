import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  latestBoosts,
  latestProfiles,
  marketSnapshot,
  pairIntelligence,
  recentProfileUpdates,
  communityTakeovers,
  searchPairs,
  systemHealth,
  trendingMetas,
  topBoosts,
  latestAds,
  tokenPairs,
} from "@/lib/dex.functions";
import { assessPair, buildPeerSet } from "@/lib/analysis";
import type { Assessment, PairObservation } from "@/lib/dex-types";
import {
  emitAlert,
  getHistory,
  historyCounts,
  recordObservation,
  subscribeStore,
} from "@/lib/local-store";

/* ------------------------------- queries ------------------------------ */

export const marketQuery = queryOptions({
  queryKey: ["market", "snapshot"],
  queryFn: () => marketSnapshot(),
  refetchInterval: 60_000,
  staleTime: 45_000,
});

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["market", "search", q],
    queryFn: () => searchPairs({ data: { q } }),
    enabled: q.trim().length > 1,
    staleTime: 30_000,
  });

export const pairQuery = (chainId: string, pairId: string, historyPoints: number) =>
  queryOptions({
    queryKey: ["pair", chainId, pairId],
    queryFn: () => pairIntelligence({ data: { chainId, pairId, historyPoints } }),
    refetchInterval: 45_000,
    staleTime: 20_000,
  });

export const tokenPairsQuery = (chainId: string, tokenAddress: string) =>
  queryOptions({
    queryKey: ["token-pairs", chainId, tokenAddress],
    queryFn: () => tokenPairs({ data: { chainId, tokenAddress } }),
    staleTime: 45_000,
  });

export const profilesQuery = queryOptions({
  queryKey: ["profiles", "latest"],
  queryFn: () => latestProfiles(),
  refetchInterval: 180_000,
});

export const profileUpdatesQuery = queryOptions({
  queryKey: ["profiles", "updates"],
  queryFn: () => recentProfileUpdates(),
  refetchInterval: 180_000,
});

export const takeoversQuery = queryOptions({
  queryKey: ["takeovers"],
  queryFn: () => communityTakeovers(),
  refetchInterval: 300_000,
});

export const boostsQuery = queryOptions({
  queryKey: ["boosts", "latest"],
  queryFn: () => latestBoosts(),
  refetchInterval: 180_000,
});

export const topBoostsQuery = queryOptions({
  queryKey: ["boosts", "top"],
  queryFn: () => topBoosts(),
  refetchInterval: 300_000,
});

export const adsQuery = queryOptions({
  queryKey: ["ads", "latest"],
  queryFn: () => latestAds(),
  refetchInterval: 600_000,
});

export const metasQuery = queryOptions({
  queryKey: ["metas", "trending"],
  queryFn: () => trendingMetas(),
  refetchInterval: 180_000,
});

export const healthQuery = queryOptions({
  queryKey: ["system", "health"],
  queryFn: () => systemHealth(),
  refetchInterval: 60_000,
});

/* --------------------------- derived helpers -------------------------- */

/** Assess every pair in the snapshot against the batch as peer baseline. */
export function useMarketIntelligence() {
  const q = useQuery(marketQuery);
  const pairs: PairObservation[] = q.data?.data ?? [];
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => subscribeStore(() => setCounts(historyCounts())), []);
  useEffect(() => setCounts(historyCounts()), [q.dataUpdatedAt]);

  const peers = buildPeerSet(pairs);
  const assessments: Assessment[] = pairs.map((p) => assessPair(p, peers, counts[p.key] ?? 0));

  // HISTORICAL ENGINE: persist each real observation once per fetch cycle.
  useEffect(() => {
    if (!pairs.length) return;
    for (const a of assessments.slice(0, 80)) {
      recordObservation(a.pair, {
        riskScore: a.risk.score,
        confidence: a.confidence.score,
        anomalies: a.anomalies,
      });
      // ALERT ENGINE: deduplicated + cooldown-gated emission on real signals
      for (const an of a.anomalies) {
        if (an.severity === "UNUSUAL" || an.severity === "SEVERE") {
          emitAlert({
            key: a.pair.key,
            symbol: a.pair.baseSymbol,
            chainId: a.pair.chainId,
            dexId: a.pair.dexId,
            kind: an.metric,
            severity: an.severity,
            message: `${an.what} — ${an.observedValue} vs ${an.baseline}`,
            confidence: an.confidence,
          });
        }
      }
      if (a.risk.score !== null && a.risk.score >= 70) {
        emitAlert({
          key: a.pair.key,
          symbol: a.pair.baseSymbol,
          chainId: a.pair.chainId,
          dexId: a.pair.dexId,
          kind: "RISK CLASSIFICATION",
          severity: a.risk.score >= 80 ? "SEVERE" : "UNUSUAL",
          message: `${a.risk.band} (${a.risk.score}/100) at ${a.confidence.band} confidence`,
          confidence: a.confidence.score,
        });
      }
      if (a.confidence.freshnessSeconds > 300) {
        emitAlert({
          key: a.pair.key,
          symbol: a.pair.baseSymbol,
          chainId: a.pair.chainId,
          dexId: a.pair.dexId,
          kind: "DATA STALE",
          severity: "NOTABLE",
          message: "Observation older than 5 minutes; metrics may not reflect current market state",
          confidence: a.confidence.score,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.dataUpdatedAt]);

  return {
    query: q,
    pairs,
    peers,
    assessments,
    historyCounts: counts,
    envelope: q.data ?? null,
  };
}

export function useHistory(key: string) {
  const [points, setPoints] = useState(() => getHistory(key));
  useEffect(() => {
    setPoints(getHistory(key));
    return subscribeStore(() => setPoints(getHistory(key)));
  }, [key]);
  return points;
}
