import { after, NextResponse } from "next/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyNeonAuthWebhook } from "@/lib/security/neon-webhook";
import { ensureAccountBootstrap } from "@/lib/access/bootstrap";

export const runtime = "nodejs";

/**
 * Webhook do Neon Auth (Managed Better Auth) — evento `user.created`.
 *
 * Spec: https://neon.com/docs/auth/guides/webhooks.md — evento non-blocking:
 * "Return 200 immediately and process the event asynchronously". A resposta
 * é sempre minúscula (<10KB) com `no-store`.
 *
 * Assinatura Ed25519 (JWS detached) verificada contra o JWKS do
 * NEON_AUTH_BASE_URL em src/lib/security/neon-webhook.ts. Inválido → 401
 * (4xx não gera retry na Neon). Reentrega do mesmo event id → 200 no-op:
 * a spec da Neon pede a MESMA resposta para duplicados, e o LRU de event
 * ids garante que o bootstrap não rode duas vezes (idempotente por cima,
 * como rede de segurança).
 *
 * Provisionamento instantâneo: `ensureAccountBootstrap` (profiles, access/
 * trial, wallet, inbox, equipe) — o mesmo bootstrap do signup, idempotente.
 */
export async function POST(request: Request) {
  // CRÍTICO: raw body ANTES de qualquer parse — a assinatura é sobre os bytes.
  const raw = await request.text();

  const limited = await rateLimit(request, "neon-webhook", { max: 120, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const event = await verifyNeonAuthWebhook(raw, request.headers);
  if (!event) {
    return NextResponse.json({ error: "invalid_webhook" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  if (event.eventType === "user.created" && event.user.id && !event.duplicate) {
    const { id, email, name } = event.user;
    after(async () => {
      await ensureAccountBootstrap({ id, email, name }).catch((reason) => {
        console.error("neon_webhook_bootstrap_failed", {
          userId: id,
          reason: reason instanceof Error ? reason.message : "unknown",
        });
      });
    });
  }
  // Outros eventTypes e reentregas (duplicate=true): 200 no-op — a resposta
  // dos duplicados é a mesma do primeiro aceito (spec Neon).
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
