/**
 * GET /api/public/intelligence/events?limit=100
 *
 * Normalised, deduplicated, timestamped events with their source. Bearer
 * authenticated. Returns an explicit note when the schema is not applied
 * instead of pretending the feed is empty by choice.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/intelligence/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizeAgent, jsonNoStore } = await import("@/lib/agents/api-auth.server");
        const auth = authorizeAgent(request);
        if (!auth.ok) return auth.response;

        const url = new URL(request.url);
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));

        const { db, memeSchemaReady, recentEvents } = await import("@/lib/stellaris/store.server");
        const client = db();
        if (!client) return jsonNoStore({ ok: false, state: "NOT CONFIGURED", detail: "Supabase is not configured.", events: [] }, 503);
        const schema = await memeSchemaReady(client);
        if (!schema.ready) return jsonNoStore({ ok: false, state: "SCHEMA MISSING", detail: schema.error, events: [] }, 503);

        const rows = await recentEvents(client, limit);
        return jsonNoStore({ ok: true, count: rows.length, events: rows });
      },
    },
  },
});
