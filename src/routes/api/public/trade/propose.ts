/**
 * POST /api/public/trade/propose  { tokenId, direction, sizeUsd?, strategy?, reason? }
 *
 * Records a PROPOSAL for human review. It never places an order: real-money
 * execution is hard-disabled and this endpoint has no execution path at all.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  tokenId: z.string().min(1),
  direction: z.enum(["LONG", "EXIT"]),
  sizeUsd: z.number().positive().optional(),
  strategy: z.string().max(120).optional(),
  reason: z.string().max(2000).optional(),
  agentLabel: z.string().max(120).optional(),
});

export const Route = createFileRoute("/api/public/trade/propose")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeAgent, jsonNoStore } = await import("@/lib/agents/api-auth.server");
        const auth = authorizeAgent(request);
        if (!auth.ok) return auth.response;

        const { can, proposalOnly } = await import("@/lib/agents/permissions");
        const level = auth.level as Parameters<typeof can>[0];
        const allowed = can(level, "PROPOSE");
        if (!allowed.allowed) return jsonNoStore({ ok: false, state: "FORBIDDEN", detail: allowed.reason }, 403);

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonNoStore({ ok: false, state: "INVALID INPUT", detail: parsed.error.message }, 400);

        const { db, memeSchemaReady, audit } = await import("@/lib/stellaris/store.server");
        const { analyzeTokenForAgent } = await import("@/lib/agents/analyze.server");

        const client = db();
        if (!client) return jsonNoStore({ ok: false, state: "NOT CONFIGURED", detail: "Supabase is not configured." }, 503);
        const schema = await memeSchemaReady(client);
        if (!schema.ready) return jsonNoStore({ ok: false, state: "SCHEMA MISSING", detail: schema.error }, 503);

        /* A proposal must carry the evidence it rests on, including what
           contradicts it and what is unknown. */
        const analysis = await analyzeTokenForAgent(parsed.data.tokenId, false);

        const insert = await client
          .from("trade_proposals")
          .insert({
            token_id: parsed.data.tokenId,
            agent_label: parsed.data.agentLabel ?? `agent:${level}`,
            direction: parsed.data.direction,
            size_usd: parsed.data.sizeUsd ?? null,
            strategy: parsed.data.strategy ?? null,
            reason: parsed.data.reason ?? null,
            risk_verdict: analysis.ok ? analysis.dossier.state : null,
            risk_reason: analysis.ok ? analysis.dossier.contradicting.join(" | ") || null : null,
            state: "PROPOSED",
            executed: false,
          })
          .select("id")
          .maybeSingle();

        if (insert.error) return jsonNoStore({ ok: false, state: "ERROR", detail: insert.error.message }, 500);

        await audit({
          actor: "AGENT",
          action: "TRADE_PROPOSED",
          component: "agent-api",
          detail: `${parsed.data.direction} ${parsed.data.tokenId}`,
          reason: parsed.data.reason ?? null,
          payload: { level, sizeUsd: parsed.data.sizeUsd ?? null },
        });

        return jsonNoStore(
          proposalOnly({
            ok: true,
            proposalId: (insert.data?.id as string | undefined) ?? null,
            state: "PROPOSED",
            evidence: analysis.ok ? analysis.dossier : null,
          }),
        );
      },
    },
  },
});
