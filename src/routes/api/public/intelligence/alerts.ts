/**
 * GET /api/public/intelligence/alerts?limit=100
 *
 * Alerts raised by the collection cycle from real stored changes. Bearer
 * authenticated. Each alert carries why it exists, what would change the
 * assessment, its source and its timestamps. No alert is ever synthesised.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/intelligence/alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizeAgent, jsonNoStore } = await import("@/lib/agents/api-auth.server");
        const auth = authorizeAgent(request);
        if (!auth.ok) return auth.response;

        const url = new URL(request.url);
        const limit = Math.min(300, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));

        const { db, memeSchemaReady } = await import("@/lib/stellaris/store.server");
        const client = db();
        if (!client) return jsonNoStore({ ok: false, state: "NOT CONFIGURED", detail: "Supabase is not configured.", alerts: [] }, 503);
        const schema = await memeSchemaReady(client);
        if (!schema.ready) return jsonNoStore({ ok: false, state: "SCHEMA MISSING", detail: schema.error, alerts: [] }, 503);

        const res = await client
          .from("stellaris_alerts")
          .select("id, token_id, category, severity, title, why, what_would_change_it, acknowledged, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (res.error) return jsonNoStore({ ok: false, state: "READ FAILED", detail: res.error.message, alerts: [] }, 502);

        return jsonNoStore({
          ok: true,
          count: (res.data ?? []).length,
          alerts: (res.data ?? []).map((a) => ({
            id: a.id,
            tokenId: a.token_id ?? null,
            category: a.category,
            severity: a.severity,
            title: a.title,
            why: a.why ?? [],
            whatWouldChangeTheAssessment: a.what_would_change_it ?? [],
            acknowledged: a.acknowledged === true,
            createdAt: a.created_at,
            source: "Stellaris collection cycle over stored observations",
          })),
        });
      },
    },
  },
});
