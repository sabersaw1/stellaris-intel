import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * INBOUND n8n WEBHOOK
 *
 * Requires N8N_WEBHOOK_SECRET server-side. Signature verification happens
 * before anything in the payload is read.
 */
export const Route = createFileRoute("/api/public/webhooks/n8n")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["N8N_WEBHOOK_SECRET"];
        if (!secret) {
          return Response.json({ status: "NOT CONFIGURED", detail: "N8N_WEBHOOK_SECRET is not set on the server" }, { status: 503 });
        }
        const body = await request.text();
        const provided = request.headers.get("x-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }
        let payload: unknown;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        return Response.json({ status: "RECEIVED", verified: true, storage: "WAITING FOR SUPABASE", receivedAt: Date.now(), keys: Object.keys(payload as object) });
      },
      GET: async () => {
        const configured = Boolean(process.env["N8N_WEBHOOK_SECRET"]);
        return Response.json({
          endpoint: "/api/public/webhooks/n8n",
          state: configured ? "CONFIGURED" : "NOT CONFIGURED",
          validation: "HMAC SHA-256 of the raw body in the x-signature header, compared in constant time",
        });
      },
    },
  },
});
