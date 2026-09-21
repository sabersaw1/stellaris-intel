/**
 * POST /api/public/research/analyze  { tokenId }
 *
 * Runs the multi-agent research pass over stored evidence and returns decision
 * support: supporting evidence, contradicting evidence, unknowns, per-role
 * findings and what would change the assessment. Never a buy/sell instruction.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ tokenId: z.string().min(1), persist: z.boolean().optional() });

export const Route = createFileRoute("/api/public/research/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeAgent, jsonNoStore } = await import("@/lib/agents/api-auth.server");
        const auth = authorizeAgent(request);
        if (!auth.ok) return auth.response;

        const { can } = await import("@/lib/agents/permissions");
        const level = auth.level as Parameters<typeof can>[0];
        const decision = can(level, "RESEARCH");
        if (!decision.allowed) return jsonNoStore({ ok: false, state: "FORBIDDEN", detail: decision.reason }, 403);

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonNoStore({ ok: false, state: "INVALID INPUT", detail: parsed.error.message }, 400);

        const { analyzeTokenForAgent } = await import("@/lib/agents/analyze.server");
        const result = await analyzeTokenForAgent(parsed.data.tokenId, parsed.data.persist === true);
        if (!result.ok) return jsonNoStore(result, 503);
        return jsonNoStore(result);
      },
    },
  },
});
