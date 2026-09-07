/**
 * Signed scheduled-processing endpoint for STELLARIS INTEL.
 *
 * Called by Supabase pg_cron + pg_net in the operator's own project. Runs one
 * ingestion cycle and stores the result. There is no always-on worker in this
 * environment: processing genuinely happens once per scheduled call, and the
 * interface reports it that way.
 *
 * Authentication: HMAC-SHA256 of the raw request body using STELLARIS_CRON_SECRET
 * in the `x-stellaris-signature` header, or `authorization: Bearer <secret>`.
 * Constant-time comparison; no secret is ever echoed in a response.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env["STELLARIS_CRON_SECRET"];
  if (!secret) {
    return Response.json(
      { ok: false, state: "NOT CONFIGURED", detail: "Worker secret has not been provided" },
      { status: 503 },
    );
  }

  const body = await request.text();
  const signature = request.headers.get("x-stellaris-signature");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const authorised = (signature && safeEqual(signature, expected)) || (bearer && safeEqual(bearer, secret));
  if (!authorised) return new Response("Unauthorized", { status: 401 });

  const started = Date.now();
  try {
    const { runIntelligenceTick } = await import("@/lib/backend.functions");
    const result = await runIntelligenceTick();
    return Response.json({ ok: result.errors.length === 0, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const { recordSystemJob } = await import("@/lib/supabase/ingest.server");
    const message = e instanceof Error ? e.message : "tick failed";
    await recordSystemJob({ job: "intelligence.tick", state: "FAILED", startedAt: started, error: message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
