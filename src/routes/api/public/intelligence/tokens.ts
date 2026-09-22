/**
 * GET /api/public/intelligence/tokens?limit=120
 *
 * Stored meme tokens with their latest observation. Bearer authenticated.
 * Nothing is inferred: a field that was not observed is returned as null.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/intelligence/tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizeAgent, jsonNoStore } = await import("@/lib/agents/api-auth.server");
        const auth = authorizeAgent(request);
        if (!auth.ok) return auth.response;

        const url = new URL(request.url);
        const limit = Math.min(300, Math.max(1, Number(url.searchParams.get("limit") ?? 120) || 120));

        const { db, memeSchemaReady } = await import("@/lib/stellaris/store.server");
        const client = db();
        if (!client) return jsonNoStore({ ok: false, state: "NOT CONFIGURED", detail: "Supabase is not configured.", tokens: [] }, 503);
        const schema = await memeSchemaReady(client);
        if (!schema.ready) return jsonNoStore({ ok: false, state: "SCHEMA MISSING", detail: schema.error, tokens: [] }, 503);

        const tokens = await client
          .from("tokens")
          .select("id, chain_id, address, symbol, name, origin, meme_verdict, lifecycle_stage, last_seen_at")
          .in("meme_verdict", ["MEME", "UNKNOWN"])
          .order("last_seen_at", { ascending: false })
          .limit(limit);
        if (tokens.error) return jsonNoStore({ ok: false, state: "READ FAILED", detail: tokens.error.message, tokens: [] }, 502);

        const ids = (tokens.data ?? []).map((t) => t.id as string);
        const snaps = ids.length
          ? await client
              .from("token_snapshots")
              .select("token_id, price_usd, liquidity_usd, volume_24h_usd, market_cap_usd, observed_at")
              .in("token_id", ids)
              .order("observed_at", { ascending: false })
              .limit(ids.length * 4)
          : { data: [], error: null };

        const latest = new Map<string, Record<string, unknown>>();
        for (const s of (snaps.data ?? []) as Record<string, unknown>[]) {
          const k = s["token_id"] as string;
          if (!latest.has(k)) latest.set(k, s);
        }

        return jsonNoStore({
          ok: true,
          count: (tokens.data ?? []).length,
          tokens: (tokens.data ?? []).map((t) => {
            const s = latest.get(t.id as string) ?? null;
            return {
              id: t.id,
              chainId: t.chain_id,
              address: t.address,
              symbol: t.symbol ?? null,
              name: t.name ?? null,
              origin: t.origin,
              memeVerdict: t.meme_verdict,
              lifecycle: t.lifecycle_stage ?? null,
              lastSeenAt: t.last_seen_at ?? null,
              latestObservation: s
                ? {
                    priceUsd: s["price_usd"] ?? null,
                    liquidityUsd: s["liquidity_usd"] ?? null,
                    volume24hUsd: s["volume_24h_usd"] ?? null,
                    marketCapUsd: s["market_cap_usd"] ?? null,
                    observedAt: s["observed_at"] ?? null,
                  }
                : null,
            };
          }),
        });
      },
    },
  },
});
