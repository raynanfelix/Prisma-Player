import "server-only";

import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AbacateWebhook } from "@/lib/billing/abacatepay/types";
import { activatePaidAiCreditCheckout, revokeAiCreditPurchase } from "@/lib/billing/ai-credit-reconcile";
import { providerWebhookPayable } from "@/lib/billing/provider-payable";
import { activateSubscription, cancelPreviousProviderSubscription } from "@/lib/billing/shared-activation";
import { getPostHogClient } from "@/lib/posthog-server";

const { aiCreditCheckouts, billingCheckouts, paymentWebhookEvents, subscriptions } = schema;

const supportedEvents = new Set([
  "checkout.completed",
  "checkout.refunded",
  "checkout.disputed",
  "checkout.lost",
  "subscription.completed",
  "subscription.renewed",
  "subscription.cancelled",
]);

export type AbacateWebhookOutcome =
  | { status: "duplicate" }
  | { status: "ignored" }
  | { status: "processed" }
  | { status: "failed"; message: string };

type WebhookTargets = {
  providerEventId: string;
  subscriptionObject: Record<string, unknown> | null;
  checkoutObject: Record<string, unknown>;
  externalId: string | null;
  providerObjectId: string | null;
  creditCheckoutId: string | null;
};

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

/**
 * Fluxo completo do webhook AbacatePay já autenticado: registra o evento,
 * faz o claim atômico (idempotência) e processa créditos de IA ou assinatura.
 * A verificação HMAC permanece em lib/billing/abacatepay/webhook.ts.
 */
export async function processAbacateWebhook(event: AbacateWebhook, rawBody: string): Promise<AbacateWebhookOutcome> {
  if (!supportedEvents.has(event.event)) return { status: "ignored" };
  if (event.devMode) {
    console.warn("AbacatePay webhook received in devMode; ignoring", { event: event.event });
    return { status: "ignored" };
  }
  const targets = deriveWebhookTargets(event, rawBody);
  await recordWebhookEvent(event, targets);
  const claimedId = await claimWebhookEvent(targets.providerEventId);
  if (claimedId === null) return { status: "duplicate" };
  return runClaimedWebhookFlow(event, targets);
}

function deriveWebhookTargets(event: AbacateWebhook, rawBody: string): WebhookTargets {
  const providerEventId = stringValue(event.id) || createHash("sha256").update(rawBody).digest("hex");
  const dataObject = objectValue(event.data);
  const subscriptionObject = objectValue(dataObject?.subscription);
  const checkoutObject = objectValue(dataObject?.checkout) || objectValue(dataObject?.payment) || subscriptionObject || dataObject || {};
  const metadataObject = objectValue(checkoutObject?.metadata) || objectValue(dataObject?.metadata);
  const candidates = [checkoutObject, dataObject, subscriptionObject];
  return {
    providerEventId,
    subscriptionObject,
    checkoutObject,
    externalId: firstString(candidates, "externalId") || firstString(candidates, "external_id"),
    providerObjectId: firstString(candidates, "id"),
    creditCheckoutId: firstString([metadataObject], "prismaCreditCheckoutId"),
  };
}

/**
 * Garante que a linha do evento exista. Em caso de concorrência (duas
 * entregas simultâneas do mesmo evento), o ON CONFLICT DO NOTHING não eleva
 * erro. O insert é best-effort: o claim atômico abaixo é quem decide.
 */
async function recordWebhookEvent(event: AbacateWebhook, targets: WebhookTargets): Promise<void> {
  try {
    await db.insert(paymentWebhookEvents)
      .values({ providerEventId: targets.providerEventId, eventName: event.event, providerObjectId: targets.providerObjectId, payload: event })
      .onConflictDoNothing({ target: paymentWebhookEvents.providerEventId });
  } catch {
  }
}

/**
 * Claim atômico: so avança quem conseguir mudar de received/pending/failed ->
 * processing. Qualquer estado terminal (processed/ignored/processing de outra
 * instancia) faz esta requisicao responder como duplicada sem processar nada
 * de novo. 'received' entrou no conjunto por decisão do Lead: a linha nasce
 * com status 'received' (default da tabela), e um filtro sem ele nunca a
 * pegaria — o evento fresco não seria processado
 * inline e a ativação dependia da reconciliação posterior. A idempotência
 * continua garantida pelo unique provider_event_id + claim atômico.
 */
async function claimWebhookEvent(providerEventId: string): Promise<number | null> {
  try {
    const claimed = await db.update(paymentWebhookEvents)
      .set({ status: "processing", processingError: null })
      .where(and(
        eq(paymentWebhookEvents.providerEventId, providerEventId),
        inArray(paymentWebhookEvents.status, ["received", "pending", "failed"]),
      ))
      .returning({ id: paymentWebhookEvents.id });
    return claimed[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function runClaimedWebhookFlow(event: AbacateWebhook, targets: WebhookTargets): Promise<AbacateWebhookOutcome> {
  try {
    const isCreditCheckout = Boolean(targets.creditCheckoutId || targets.externalId?.startsWith("prisma_ai_"));
    if (isCreditCheckout) return await processCreditWebhook(event, targets);
    if (!targets.externalId) throw new Error("missing_external_id");
    return await processSubscriptionWebhook(event, targets, targets.externalId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await db.update(paymentWebhookEvents).set({ status: "failed", processingError: message.slice(0, 500) }).where(eq(paymentWebhookEvents.providerEventId, targets.providerEventId));
    console.error("AbacatePay webhook failed", message);
    return { status: "failed", message };
  }
}

async function markWebhookIgnored(providerEventId: string, now: Date, processingError?: string): Promise<void> {
  await db.update(paymentWebhookEvents)
    .set({ status: "ignored", processedAt: now, ...(processingError ? { processingError } : {}) })
    .where(eq(paymentWebhookEvents.providerEventId, providerEventId));
}

async function markWebhookProcessed(providerEventId: string, now: Date): Promise<void> {
  await db.update(paymentWebhookEvents).set({ status: "processed", processedAt: now }).where(eq(paymentWebhookEvents.providerEventId, providerEventId));
}

async function processCreditWebhook(event: AbacateWebhook, targets: WebhookTargets): Promise<AbacateWebhookOutcome> {
  const [creditCheckout] = await db
    .select({
      id: aiCreditCheckouts.id,
      userId: aiCreditCheckouts.userId,
      externalId: aiCreditCheckouts.externalId,
      status: aiCreditCheckouts.status,
      amountCents: aiCreditCheckouts.amountCents,
    })
    .from(aiCreditCheckouts)
    .where(targets.creditCheckoutId ? eq(aiCreditCheckouts.id, targets.creditCheckoutId) : eq(aiCreditCheckouts.externalId, targets.externalId!))
    .limit(1);
  if (!creditCheckout) throw new Error("credit_checkout_not_found");
  const now = new Date();
  if (event.event === "checkout.completed") return await activateCreditWebhook(targets, creditCheckout, now);
  if (["checkout.refunded", "checkout.disputed", "checkout.lost"].includes(event.event)) {
    return await revokeCreditWebhook(event, targets, creditCheckout, now);
  }
  await markWebhookIgnored(targets.providerEventId, now);
  return { status: "ignored" };
}

async function activateCreditWebhook(targets: WebhookTargets, creditCheckout: { id: string; userId: string; externalId: string; status: string; amountCents: number }, now: Date): Promise<AbacateWebhookOutcome> {
  // Fail-closed (RH-01): o handler confia no webhook autenticado para os
  // dados de STATUS, mas o valor pago é conferido contra o registro local
  // (devMode/amount/currency presentes e divergentes bloqueiam). A
  // reconciliacao reconfere contra a API antes de qualquer reprocesso.
  if (!providerWebhookPayable(targets.checkoutObject, creditCheckout.amountCents)) {
    console.warn("AI credit webhook activation rejected: provider payload amount/currency/devMode mismatch", {
      checkoutId: creditCheckout.id,
      providerAmount: targets.checkoutObject?.amount,
      storedAmountCents: creditCheckout.amountCents,
      providerCurrency: targets.checkoutObject?.currency,
      providerDevMode: targets.checkoutObject?.devMode,
    });
    await markWebhookIgnored(targets.providerEventId, now, "provider_payload_mismatch");
    return { status: "ignored" };
  }
  await activatePaidAiCreditCheckout({
    id: creditCheckout.id,
    user_id: creditCheckout.userId,
    external_id: creditCheckout.externalId,
    status: creditCheckout.status,
    amount_cents: creditCheckout.amountCents,
  }, { id: targets.providerObjectId ?? `webhook:${targets.providerEventId}` });
  await markWebhookProcessed(targets.providerEventId, now);
  return { status: "processed" };
}

async function revokeCreditWebhook(event: AbacateWebhook, targets: WebhookTargets, creditCheckout: { id: string }, now: Date): Promise<AbacateWebhookOutcome> {
  // Estorno real de creditos: so reverte a entrega quando o checkout esta
  // 'paid' e existe lancamento de compra; se nunca foi pago, e um no-op
  // idempotente. Reverte tambem em disputed (o usuario perde o direito
  // enquanto a disputa existir).
  await revokeAiCreditPurchase(creditCheckout.id);
  // Mantem o registro local refletindo o evento (o estorno ja marca
  // 'refunded' para compras pagas; checkouts nunca pagos precisam deste
  // update).
  await db.update(aiCreditCheckouts).set({ status: event.event === "checkout.refunded" ? "refunded" : "disputed", updatedAt: now }).where(eq(aiCreditCheckouts.id, creditCheckout.id));
  await markWebhookProcessed(targets.providerEventId, now);
  return { status: "processed" };
}

async function processSubscriptionWebhook(event: AbacateWebhook, targets: WebhookTargets, externalId: string): Promise<AbacateWebhookOutcome> {
  const checkout = await findBillingCheckout(externalId);
  if (!checkout) throw new Error("checkout_not_found");
  const now = new Date();
  if (event.event === "checkout.completed" || event.event === "subscription.completed" || event.event === "subscription.renewed") {
    return await activateSubscriptionWebhook(event, targets, checkout, now);
  }
  if (["checkout.refunded", "checkout.disputed", "checkout.lost"].includes(event.event)) {
    return await suspendSubscriptionWebhook(event, targets, checkout, now);
  }
  if (event.event === "subscription.cancelled") {
    return await cancelSubscriptionWebhook(event, targets, checkout, now);
  }
  await markWebhookIgnored(targets.providerEventId, now);
  return { status: "ignored" };
}

type BillingCheckoutRow = Awaited<ReturnType<typeof findBillingCheckout>>;

async function findBillingCheckout(externalId: string) {
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
  return checkout;
}

async function activateSubscriptionWebhook(event: AbacateWebhook, targets: WebhookTargets, checkout: BillingCheckoutRow, now: Date): Promise<AbacateWebhookOutcome> {
  // Mesmo gate fail-closed da ativação de créditos (RH-01): valor/currency/
  // devMode divergentes do payload do provedor não ativam assinatura.
  if (!providerWebhookPayable(targets.checkoutObject, checkout.amountCents)) {
    console.warn("Subscription webhook activation rejected: provider payload amount/currency/devMode mismatch", {
      checkoutId: checkout.id,
      providerAmount: targets.checkoutObject?.amount,
      storedAmountCents: checkout.amountCents,
      providerCurrency: targets.checkoutObject?.currency,
      providerDevMode: targets.checkoutObject?.devMode,
    });
    await markWebhookIgnored(targets.providerEventId, now, "provider_payload_mismatch");
    return { status: "ignored" };
  }
  const newProviderSubscriptionId = checkout.checkoutType === "card_subscription" ? stringValue(targets.subscriptionObject?.id) : null;
  await cancelPreviousProviderSubscription(checkout.previousProviderSubscriptionId, newProviderSubscriptionId);
  await markBillingCheckoutPaid(targets, checkout, now);
  await activateSubscription({
    id: checkout.id,
    user_id: checkout.userId,
    plan_id: checkout.planId,
    checkout_type: checkout.checkoutType === "pix" ? "pix" : "card_subscription",
  }, newProviderSubscriptionId);
  await captureSubscriptionActivated(event, checkout);
  await markWebhookProcessed(targets.providerEventId, now);
  return { status: "processed" };
}

async function markBillingCheckoutPaid(targets: WebhookTargets, checkout: BillingCheckoutRow, now: Date): Promise<void> {
  await db.update(billingCheckouts).set({
    status: "paid",
    paidAt: now,
    providerCheckoutId: targets.providerObjectId,
    receiptUrl: stringValue(targets.checkoutObject?.receiptUrl),
    previousProviderSubscriptionId: null,
    updatedAt: now,
  }).where(eq(billingCheckouts.id, checkout.id));
}

async function captureSubscriptionActivated(event: AbacateWebhook, checkout: BillingCheckoutRow): Promise<void> {
  const billingMethod = checkout.checkoutType === "pix" ? "pix" : "card";
  const phClient = getPostHogClient();
  const phEventName = event.event === "subscription.renewed" ? "subscription_renewed" : "subscription_activated";
  phClient.capture({
    distinctId: checkout.userId,
    event: phEventName,
    properties: { plan_id: checkout.planId, billing_method: billingMethod, webhook_event: event.event },
  });
  await phClient.flush();
}

async function suspendSubscriptionWebhook(event: AbacateWebhook, targets: WebhookTargets, checkout: BillingCheckoutRow, now: Date): Promise<AbacateWebhookOutcome> {
  const status = event.event === "checkout.refunded" ? "refunded" : "disputed";
  await db.update(billingCheckouts).set({ status, updatedAt: now }).where(eq(billingCheckouts.id, checkout.id));
  await db.update(subscriptions).set({ status: "suspended", updatedAt: now }).where(eq(subscriptions.sourceCheckoutId, checkout.id));
  await markWebhookProcessed(targets.providerEventId, now);
  return { status: "processed" };
}

async function cancelSubscriptionWebhook(event: AbacateWebhook, targets: WebhookTargets, checkout: BillingCheckoutRow, now: Date): Promise<AbacateWebhookOutcome> {
  await db.update(billingCheckouts).set({ status: "cancelled", updatedAt: now }).where(eq(billingCheckouts.id, checkout.id));
  const cancelledProviderId = stringValue(targets.subscriptionObject?.id);
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
  await markWebhookProcessed(targets.providerEventId, now);
  return { status: "processed" };
}
