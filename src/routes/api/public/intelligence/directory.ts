/**
 * GET /api/public/intelligence/directory
 *
 * Machine-readable directory of the agent API. Bearer authenticated. It states
 * every available endpoint and, explicitly, that no endpoint can move real
 * money — a trade proposal is recorded for human review and never executed.
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/intelligence/directory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizeAgent, jsonNoStore } = await import("@/lib/agents/api-auth.server");
        const auth = authorizeAgent(request);
        if (!auth.ok) return auth.response;

        return jsonNoStore({
          ok: true,
          level: auth.level,
          execution: { realMoney: "HARD DISABLED", proposalsOnly: true },
          endpoints: [
            { method: "GET", path: "/api/public/intelligence/directory", returns: "this directory" },
            { method: "GET", path: "/api/public/intelligence/status", returns: "provider health, capability coverage, schema readiness" },
            { method: "GET", path: "/api/public/intelligence/events", returns: "deduplicated change events with source and timestamps" },
            { method: "GET", path: "/api/public/intelligence/tokens", returns: "stored meme tokens with their latest observation" },
            { method: "GET", path: "/api/public/intelligence/alerts", returns: "alerts raised from real stored events, with why and what would change it" },
            { method: "GET", path: "/api/public/intelligence/providers", returns: "per-provider state, credential requirement and limitations" },
            { method: "POST", path: "/api/public/research/analyze", returns: "one research pass over stored evidence; disagreement and unknowns preserved" },
            { method: "POST", path: "/api/public/trade/propose", returns: "records a proposal for human review; never executed" },
          ],
          auth: "Bearer STELLARIS_AGENT_TOKEN",
          contract: [
            "Missing evidence is returned as null or UNKNOWN and is never inferred.",
            "One real-world change is one event; every observing provider is kept as provenance.",
            "Independent verification is only claimed when more than one independent source observed it.",
          ],
        });
      },
    },
  },
});
