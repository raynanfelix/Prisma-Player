import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getStripe } from "@/lib/billing/stripe/client";
import { processStripeEvent } from "@/lib/billing/stripe/webhook";
import { rateLimit } from "@/lib/security/rate-limit";
import { alertOperations } from "@/lib/security/alert-webhook";
import { db, schema } from "@/lib/db";
import { safeLog } from "@/lib/utils/log";

const { paymentWebhookEvents } = schema;

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * POST /api/webhooks/stripe - porta única de fulfillment (Opção A).
 *
 * Rigor do neon-webhook (mesmo padrão do repo):
 * - raw body ANTES de qualquer parse (a assinatura é sobre os bytes);
 * - assinatura SEMPRE verificada com `constructEvent` - inválida → 400
 *   sem logar segredo nem detalhe do erro;
 * - idempotência ATÔMICA na tabela `payment_webhook_events` (a mesma que o
 *   admin/UptimeCard lê): INSERT ... ON CONFLICT (provider_event_id) DO
 *   NOTHING - reentrega de evento processed/ignored → 200 no-op;
 *   reentrega de evento FAILED reprocessa (recuperação com reentrega do Stripe);
 * - fulfillment SÓ aqui - nunca na página de sucesso;
 * - falha de processamento → status failed + 500: o Stripe reentrega e a
 *   tentativa nova reprocessa (o insert conflita com a linha failed).
 */
export async function POST(request: Request) {
  // CRÍTICO: raw body ANTES de qualquer parse - a assinatura é sobre os bytes.
  const raw = await request.text();

  const limited = await rateLimit(request, "stripe-webhook", { max: 120, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400, headers: NO_STORE });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    // Sem detalhe no log: a mensagem de erro não é nossa para vazar.
    safeLog("stripe_webhook_invalid_signature", {});
    return NextResponse.json({ error: "invalid_signature" }, { status: 400, headers: NO_STORE });
  }

  const objectId = typeof (event.data.object as { id?: unknown } | null)?.id === "string" ? (event.data.object as { id: string }).id : null;

  let inserted: Array<{ id: number }>;
  try {
    inserted = await db
      .insert(paymentWebhookEvents)
      .values({
        provider: "stripe",
        providerEventId: event.id,
        eventName: event.type,
        providerObjectId: objectId,
        payload: event as unknown as Record<string, unknown>,
        status: "received",
      })
      .onConflictDoNothing()
      .returning({ id: paymentWebhookEvents.id });
  } catch (error) {
    safeLog("stripe_webhook_store_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "processing_failed" }, { status: 500, headers: NO_STORE });
  }

  if (inserted.length === 0) {
    const [existing] = await db
      .select({ status: paymentWebhookEvents.status })
      .from(paymentWebhookEvents)
      .where(eq(paymentWebhookEvents.providerEventId, event.id))
      .limit(1);
    if (existing?.status !== "failed") {
      // Reentrega de evento já concluído → mesma 200, sem reprocessar.
      return NextResponse.json({ received: true, duplicate: true }, { headers: NO_STORE });
    }
    // Evento failed chegando de novo (reentrega do Stripe): reprocessa.
    await db
      .update(paymentWebhookEvents)
      .set({ status: "processing", processingError: null })
      .where(eq(paymentWebhookEvents.providerEventId, event.id));
  }

  try {
    const outcome = await processStripeEvent(event);
    await db
      .update(paymentWebhookEvents)
      .set({ status: outcome, processedAt: new Date(), processingError: null })
      .where(eq(paymentWebhookEvents.providerEventId, event.id));
    return NextResponse.json({ received: true }, { headers: NO_STORE });
  } catch (error) {
    const message = (error instanceof Error ? error.message : "unknown").slice(0, 500);
    safeLog("stripe_webhook_processing_failed", { eventId: event.id, type: event.type, reason: message });
    try {
      await db
        .update(paymentWebhookEvents)
        .set({ status: "failed", processingError: message })
        .where(eq(paymentWebhookEvents.providerEventId, event.id));
    } catch {
      // O 500 abaixo já faz o Stripe reentregar; o status fica stale só até lá.
    }
    // Alerta operacional (hardening item 5): evento failed não pode ser
    // silencioso - o dono precisa saber que um pagamento pode estar pendente.
    await alertOperations({
      title: "Webhook do Stripe falhou",
      detail: `Evento ${event.type} (${event.id}) marcado failed - o Stripe reentrega. Motivo: ${message}`,
      kind: "stripe_webhook_failed",
    });
    return NextResponse.json({ error: "processing_failed" }, { status: 500, headers: NO_STORE });
  }
}
