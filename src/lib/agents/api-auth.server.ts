/**
 * Agent API authentication (server-only).
 *
 * The machine-readable intelligence API is for a future local LLM/Jarvis. It is
 * bearer-authenticated with STELLARIS_AGENT_TOKEN. Without that secret the API
 * is closed — it never falls back to open access.
 */

import { timingSafeEqual } from "crypto";

export type AgentAuth =
  | { ok: true; level: string }
  | { ok: false; response: Response };

const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export function authorizeAgent(request: Request): AgentAuth {
  const token = process.env["STELLARIS_AGENT_TOKEN"];
  if (!token || !token.trim())
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          state: "NOT CONFIGURED",
          detail: "The agent API is closed until STELLARIS_AGENT_TOKEN is set.",
        },
        { status: 503 },
      ),
    };

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!bearer || !safeEqual(bearer, token.trim()))
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };

  /* Level is advisory metadata for the caller; real execution is hard-disabled
     regardless of the level requested. */
  const requested = request.headers.get("x-stellaris-agent-level") ?? "RESEARCHER";
  return { ok: true, level: requested };
}

export const jsonNoStore = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
