/**
 * GET /api/public/intelligence/status
 *
 * Machine-readable system state for an external agent: provider health,
 * capability coverage, schema readiness and the execution switch. Bearer
 * authenticated; never returns a secret value.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/intelligence/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizeAgent, jsonNoStore } = await import("@/lib/agents/api-auth.server");
        const auth = authorizeAgent(request);
        if (!auth.ok) return auth.response;

        const { providerHealthReport, capabilityCoverage } = await import("@/lib/providers/registry.server");
        const { db, memeSchemaReady } = await import("@/lib/stellaris/store.server");
        const { REAL_EXECUTION_HARD_DISABLED } = await import("@/lib/agents/permissions");

        const client = db();
        const schema = client ? await memeSchemaReady(client) : { ready: false, error: "Supabase is not configured." };
        const health = await providerHealthReport(false);

        return jsonNoStore({
          ok: true,
          checkedAt: Date.now(),
          persistence: { configured: Boolean(client), schemaReady: schema.ready, note: schema.error },
          execution: { realExecutionEnabled: false, hardDisabled: REAL_EXECUTION_HARD_DISABLED },
          providers: health.map((h) => ({
            id: h.id,
            status: h.status,
            configured: h.configured,
            credential: h.credential,
            blockedReason: h.blockedReason,
            lastOkAt: h.lastOkAt,
            lastError: h.lastError,
            capabilities: h.capabilities,
          })),
          coverage: capabilityCoverage(),
        });
      },
    },
  },
});
