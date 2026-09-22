/**
 * GET /api/public/intelligence/providers
 *
 * Per-provider state for an external agent: capability, credential
 * requirement, whether the provider is optional, last success, last error and
 * limitations. Bearer authenticated. No credential value is ever returned.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/intelligence/providers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizeAgent, jsonNoStore } = await import("@/lib/agents/api-auth.server");
        const auth = authorizeAgent(request);
        if (!auth.ok) return auth.response;

        const { providerHealthReport, capabilityCoverage } = await import("@/lib/providers/registry.server");
        const { CATALOG } = await import("@/lib/providers/catalog");

        const health = await providerHealthReport(false);
        const byProvider = new Map(health.map((h) => [h.id as string, h]));

        return jsonNoStore({
          ok: true,
          checkedAt: Date.now(),
          providers: CATALOG.map((entry) => {
            const h = entry.providerId ? byProvider.get(entry.providerId as string) : undefined;
            return {
              id: entry.id,
              name: entry.name,
              optional: entry.requirement !== "REQUIRED NOW",
              requirement: entry.requirement,
              credential: entry.credentialType,
              requiredEnvVars: entry.envVars,
              configured: h ? h.configured : entry.envVars.length === 0,
              status: h?.status ?? (entry.envVars.length === 0 ? "CONNECTED — PUBLIC ACCESS" : "NOT CONNECTED"),
              lastOkAt: h?.lastOkAt ?? null,
              lastErrorAt: h?.lastErrorAt ?? null,
              lastError: h?.lastError ?? null,
              limitations: h?.rateLimitNote ?? null,
              blockedReason: h?.blockedReason ?? null,
              unlocks: entry.unlocks,
              doesNotUnlock: entry.doesNotUnlock,
              capabilities: h?.capabilities ?? [],
            };
          }),
          coverage: capabilityCoverage(),
        });
      },
    },
  },
});
