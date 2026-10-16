import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { shouldRequireHmac, verifyWebhookSecret, verifyWebhookSignature } from "@/lib/billing/abacatepay/webhook";
import type { AbacateWebhook } from "@/lib/billing/abacatepay/types";
import { rateLimit } from "@/lib/security/rate-limit";
import { activatePaidAiCreditCheckout, revokeAiCreditPurchase } from "@/lib/billing/ai-credit-reconcile";
import { providerWebhookPayable } from "@/lib/billing/provider-payable";
import { activateSubscription, cancelPreviousProviderSubscription } from "@/lib/billing/shared-activation";
import { getPostHogClient } from "@/lib/posthog-server";
import { db, schema } from "@/lib/db";

const { aiCreditCheckouts, billingCheckouts, paymentWebhookEvents, subscriptions } = schema;

export const runtime = "nodejs";

const supportedEvents = new Set([
  "checkout.completed",
  "checkout.refunded",
  "checkout.disputed",
  "checkout.lost",
  "subscription.completed",
  "subscription.renewed",
  "subscription.cancelled",
]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function firstString(objects: Array<Record<string, unknown> | null>, key: string): string | null {
  for (const object of objects) {
    const value = stringValue(object?.[key]);
    if (value) return value;
  }
  return null;
}

export async function POST(request: Request) {
  // Billing pode custar caro em erro repetido, entao o rate limit fecha a porta
  // (failClosed) quando o contador ficar indisponivel.
  const limited = await rateLimit(request, "webhook:abacatepay", { max: 60, windowMs: 60_000, failClosed: true });
  if (limited) {
    console.warn("AbacatePay webhook rate limited");
    return limited;
  }

  const url = new URL(request.url);
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature")
    || request.headers.get("x-abacate-signature")
    || request.headers.get("x-signature");
  const validSecret = verifyWebhookSecret(url.searchParams.get("webhookSecret"));
  const validSignature = verifyWebhookSignature(rawBody, signature);
  // Ambos os mecanismos provam conhecimento do mesmo secret cadastrado, entao
  // historicamente qualquer um basta. Com ABACATEPAY_REQUIRE_HMAC=true a
  // assinatura HMAC no header passa a ser exigida e o secret da URL nao basta.
  if (shouldRequireHmac() ? !validSignature : !validSecret && !validSignature) {
    console.warn("AbacatePay webhook authentication failed", { validSecret, validSignature, hasSignature: Boolean(signature) });
    return NextResponse.json({ error: "invalid_webhook_signature" }, { status: 401 });
  }

  let event: AbacateWebhook;
  try {
    event = JSON.parse(rawBody) as AbacateWebhook;
  } catch {
    return NextResponse.json({ error: "invalid_webhook_json" }, { status: 400 });
  }
  if (!event?.event || !event.data) return NextResponse.json({ error: "invalid_webhook" }, { status: 400 });
  if (!supportedEvents.has(event.event)) return NextResponse.json({ ok: true, ignored: true });
  if (event.devMode) {
    console.warn("AbacatePay webhook received in devMode; ignoring", { event: event.event });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const providerEventId = stringValue(event.id) || createHash("sha256").update(rawBody).digest("hex");
  const dataObject = objectValue(event.data);
  const subscriptionObject = objectValue(dataObject?.subscription);
  const checkoutObject = objectValue(dataObject?.checkout) || objectValue(dataObject?.payment) || subscriptionObject || dataObject || {};
  const metadataObject = objectValue(checkoutObject?.metadata) || objectValue(dataObject?.metadata);
  const candidates = [checkoutObject, dataObject, subscriptionObject];
  const externalId = firstString(candidates, "externalId") || firstString(candidates, "external_id");
  const providerObjectId = firstString(candidates, "id");
  const creditCheckoutId = firstString([metadataObject], "prismaCreditCheckoutId");

  // Garante que a linha do evento exista. Em caso de concorrência (duas
  // entregas simultâneas do mesmo evento), o ON CONFLICT DO NOTHING não eleva
  // erro. O insert é best-effort: o claim atômico abaixo é quem decide.
  try {
    await db.insert(paymentWebhookEvents)
      .values({ providerEventId, eventName: event.event, providerObjectId, payload: event })
      .onConflictDoNothing({ target: paymentWebhookEvents.providerEventId });
  } catch {
  }

  // Claim atômico: so avança quem conseguir mudar de received/pending/failed ->
  // processing. Qualquer estado terminal (processed/ignored/processing de outra
  // instancia) faz esta requisicao responder como duplicada sem processar nada
  // de novo. 'received' entrou no conjunto por decisão do Lead: a linha nasce
  // com status 'received' (default da tabela), e um filtro sem ele nunca a
  // pegaria — o evento fresco não seria processado
  // inline e a ativação dependia da reconciliação posterior. A idempotência
  // continua garantida pelo unique provider_event_id + claim atômico.
  let claimedId: number | null = null;
  try {
    const claimed = await db.update(paymentWebhookEvents)
      .set({ status: "processing", processingError: null })
      .where(and(
        eq(paymentWebhookEvents.providerEventId, providerEventId),
        inArray(paymentWebhookEvents.status, ["received", "pending", "failed"]),
      ))
      .returning({ id: paymentWebhookEvents.id });
    claimedId = claimed[0]?.id ?? null;
  } catch {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (claimedId === null) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const isCreditCheckout = Boolean(creditCheckoutId || externalId?.startsWith("prisma_ai_"));
    if (isCreditCheckout) {
      const [creditCheckout] = await db
        .select({
          id: aiCreditCheckouts.id,
          userId: aiCreditCheckouts.userId,
          externalId: aiCreditCheckouts.externalId,
          status: aiCreditCheckouts.status,
          amountCents: aiCreditCheckouts.amountCents,
        })
        .from(aiCreditCheckouts)
        .where(creditCheckoutId ? eq(aiCreditCheckouts.id, creditCheckoutId) : eq(aiCreditCheckouts.externalId, externalId!))
        .limit(1);
      if (!creditCheckout) throw new Error("credit_checkout_not_found");
      const now = new Date();
      if (event.event === "checkout.completed") {
        // Fail-closed (RH-01): o handler confia no webhook autenticado para os
        // dados de STATUS, mas o valor pago é conferido contra o registro local
        // (devMode/amount/currency presentes e divergentes bloqueiam). A
        // reconciliacao reconfere contra a API antes de qualquer reprocesso.
        if (!providerWebhookPayable(checkoutObject, creditCheckout.amountCents)) {
          console.warn("AI credit webhook activation rejected: provider payload amount/currency/devMode mismatch", {
            checkoutId: creditCheckout.id,
            providerAmount: checkoutObject?.amount,
            storedAmountCents: creditCheckout.amountCents,
            providerCurrency: checkoutObject?.currency,
            providerDevMode: checkoutObject?.devMode,
          });
          await db.update(paymentWebhookEvents).set({ status: "ignored", processedAt: now, processingError: "provider_payload_mismatch" }).where(eq(paymentWebhookEvents.providerEventId, providerEventId));
          return NextResponse.json({ ok: true, ignored: true });
        }
        await activatePaidAiCreditCheckout({
          id: creditCheckout.id,
          user_id: creditCheckout.userId,
          external_id: creditCheckout.externalId,
          status: creditCheckout.status,
          amount_cents: creditCheckout.amountCents,
        }, { id: providerObjectId ?? `webhook:${providerEventId}` });
      } else if (["checkout.refunded", "checkout.disputed", "checkout.lost"].includes(event.event)) {
        // Estorno real de creditos: so reverte a entrega quando o checkout esta
        // 'paid' e existe lancamento de compra; se nunca foi pago, e um no-op
        // idempotente. Reverte tambem em disputed (o usuario perde o direito
        // enquanto a disputa existir).
        await revokeAiCreditPurchase(creditCheckout.id);
        // Mantem o registro local refletindo o evento (o estorno ja marca
        // 'refunded' para compras pagas; checkouts nunca pagos precisam deste
        // update).
        await db.update(aiCreditCheckouts).set({ status: event.event === "checkout.refunded" ? "refunded" : "disputed", updatedAt: now }).where(eq(aiCreditCheckouts.id, creditCheckout.id));
      } else {
        await db.update(paymentWebhookEvents).set({ status: "ignored", processedAt: now }).where(eq(paymentWebhookEvents.providerEventId, providerEventId));
        return NextResponse.json({ ok: true, ignored: true });
      }
      await db.update(paymentWebhookEvents).set({ status: "processed", processedAt: now }).where(eq(paymentWebhookEvents.providerEventId, providerEventId));
      return NextResponse.json({ ok: true });
    }
    if (!externalId) throw new Error("missing_external_id");
    const [checkout] = await db
      .select({
        id: billingCheckouts.id,
        userId: billingCheckouts.userId,
        planId: billingCheckouts.planId,
        checkoutType: billingCheckouts.checkoutType,
        previousProviderSubscriptionId: billingCheckouts.previousProviderSubscriptionId,
        amountCents: billingCheckouts.amountCents,
      })
      .from(billingCheckouts)
      .where(eq(billingCheckouts.externalId, externalId))
      .limit(1);
    if (!checkout) throw new Error("checkout_not_found");
    const now = new Date();

    if (event.event === "checkout.completed" || event.event === "subscription.completed" || event.event === "subscription.renewed") {
      // Mesmo gate fail-closed da ativação de créditos (RH-01): valor/currency/
      // devMode divergentes do payload do provedor não ativam assinatura.
      if (!providerWebhookPayable(checkoutObject, checkout.amountCents)) {
        console.warn("Subscription webhook activation rejected: provider payload amount/currency/devMode mismatch", {
          checkoutId: checkout.id,
          providerAmount: checkoutObject?.amount,
          storedAmountCents: checkout.amountCents,
          providerCurrency: checkoutObject?.currency,
          providerDevMode: checkoutObject?.devMode,
        });
        await db.update(paymentWebhookEvents).set({ status: "ignored", processedAt: now, processingError: "provider_payload_mismatch" }).where(eq(paymentWebhookEvents.providerEventId, providerEventId));
        return NextResponse.json({ ok: true, ignored: true });
      }
      const newProviderSubscriptionId = checkout.checkoutType === "card_subscription" ? stringValue(subscriptionObject?.id) : null;
      await cancelPreviousProviderSubscription(checkout.previousProviderSubscriptionId, newProviderSubscriptionId);
      await db.update(billingCheckouts).set({
        status: "paid",
        paidAt: now,
        providerCheckoutId: providerObjectId,
        receiptUrl: stringValue(checkoutObject?.receiptUrl),
        previousProviderSubscriptionId: null,
        updatedAt: now,
      }).where(eq(billingCheckouts.id, checkout.id));
      await activateSubscription({
        id: checkout.id,
        user_id: checkout.userId,
        plan_id: checkout.planId,
        checkout_type: checkout.checkoutType === "pix" ? "pix" : "card_subscription",
      }, newProviderSubscriptionId);
      const billingMethod = checkout.checkoutType === "pix" ? "pix" : "card";
      const phClient = getPostHogClient();
      const phEventName = event.event === "subscription.renewed" ? "subscription_renewed" : "subscription_activated";
      phClient.capture({
        distinctId: checkout.userId,
        event: phEventName,
        properties: { plan_id: checkout.planId, billing_method: billingMethod, webhook_event: event.event },
      });
      await phClient.flush();
    } else if (["checkout.refunded", "checkout.disputed", "checkout.lost"].includes(event.event)) {
      const status = event.event === "checkout.refunded" ? "refunded" : "disputed";
      await db.update(billingCheckouts).set({ status, updatedAt: now }).where(eq(billingCheckouts.id, checkout.id));
      await db.update(subscriptions).set({ status: "suspended", updatedAt: now }).where(eq(subscriptions.sourceCheckoutId, checkout.id));
    } else if (event.event === "subscription.cancelled") {
      await db.update(billingCheckouts).set({ status: "cancelled", updatedAt: now }).where(eq(billingCheckouts.id, checkout.id));
      const cancelledProviderId = stringValue(subscriptionObject?.id);
      if (cancelledProviderId) {
        await db.update(subscriptions).set({
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        }).where(and(eq(subscriptions.userId, checkout.userId), eq(subscriptions.providerSubscriptionId, cancelledProviderId)));
      }
      const phClient = getPostHogClient();
      phClient.capture({
        distinctId: checkout.userId,
        event: "subscription_cancelled_server",
        properties: { plan_id: checkout.planId, webhook_event: event.event },
      });
      await phClient.flush();
    } else {
      await db.update(paymentWebhookEvents).set({ status: "ignored", processedAt: now }).where(eq(paymentWebhookEvents.providerEventId, providerEventId));
      return NextResponse.json({ ok: true, ignored: true });
    }

    await db.update(paymentWebhookEvents).set({ status: "processed", processedAt: now }).where(eq(paymentWebhookEvents.providerEventId, providerEventId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await db.update(paymentWebhookEvents).set({ status: "failed", processingError: message.slice(0, 500) }).where(eq(paymentWebhookEvents.providerEventId, providerEventId));
    console.error("AbacatePay webhook failed", message);
    return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
  }
}
