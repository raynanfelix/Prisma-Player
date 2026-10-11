import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shouldRequireHmac, verifyWebhookSecret, verifyWebhookSignature } from "@/lib/billing/abacatepay/webhook";
import type { AbacateWebhook } from "@/lib/billing/abacatepay/types";
import { rateLimit } from "@/lib/security/rate-limit";
import { activatePaidAiCreditCheckout } from "@/lib/billing/ai-credit-reconcile";
import { providerWebhookPayable } from "@/lib/billing/provider-payable";
import { cancelPreviousProviderSubscription, nextPeriodEnd } from "@/lib/billing/shared-activation";
import { getPostHogClient } from "@/lib/posthog-server";

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
  const admin = createAdminClient();

  // Garante que a linha do evento exista como pendente. Em caso de concorrência
  // (duas entregas simultâneas do mesmo evento), o ON CONFLICT nao eleva erro.
  await admin.from("payment_webhook_events")
    .upsert({ provider_event_id: providerEventId, event_name: event.event, provider_object_id: providerObjectId, payload: event }, { onConflict: "provider_event_id", ignoreDuplicates: true });

  // Claim atômico: so avanca quem conseguir mudar de pending/failed -> processing.
  // Qualquer estado terminal (processed/ignored/processing de outra instancia) faz
  // esta requisicao responder como duplicada sem processar nada de novo.
  const claimed = await admin.from("payment_webhook_events")
    .update({ status: "processing", processing_error: null })
    .eq("provider_event_id", providerEventId)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle();
  if (claimed.error || !claimed.data) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const isCreditCheckout = Boolean(creditCheckoutId || externalId?.startsWith("prisma_ai_"));
    if (isCreditCheckout) {
      let creditQuery = admin.from("ai_credit_checkouts").select("id,user_id,external_id,status,amount_cents");
      creditQuery = creditCheckoutId ? creditQuery.eq("id", creditCheckoutId) : creditQuery.eq("external_id", externalId!);
      const creditResult = await creditQuery.single();
      if (creditResult.error || !creditResult.data) throw new Error("credit_checkout_not_found");
      const now = new Date().toISOString();
      if (event.event === "checkout.completed") {
        // Fail-closed (RH-01): o handler confia no webhook autenticado para os
        // dados de STATUS, mas o valor pago é conferido contra o registro local
        // (devMode/amount/currency presentes e divergentes bloqueiam). A
        // reconciliacao reconfere contra a API antes de qualquer reprocesso.
        if (!providerWebhookPayable(checkoutObject, creditResult.data.amount_cents)) {
          console.warn("AI credit webhook activation rejected: provider payload amount/currency/devMode mismatch", {
            checkoutId: creditResult.data.id,
            providerAmount: checkoutObject?.amount,
            storedAmountCents: creditResult.data.amount_cents,
            providerCurrency: checkoutObject?.currency,
            providerDevMode: checkoutObject?.devMode,
          });
          await admin.from("payment_webhook_events").update({ status: "ignored", processed_at: now, processing_error: "provider_payload_mismatch" }).eq("provider_event_id", providerEventId);
          return NextResponse.json({ ok: true, ignored: true });
        }
        await activatePaidAiCreditCheckout(creditResult.data, { id: providerObjectId ?? `webhook:${providerEventId}` });
      } else if (["checkout.refunded", "checkout.disputed", "checkout.lost"].includes(event.event)) {
        // Estorno real de creditos: o RPC so reverte a entrega quando o checkout
        // esta 'paid' e existe lancamento de compra; se nunca foi pago, e um
        // no-op idempotente. Reverte tambem em disputed (o usuario perde o
        // direito enquanto a disputa existir).
        const revoked = await admin.rpc("revoke_ai_credit_purchase", { p_checkout_id: creditResult.data.id });
        if (revoked.error) throw new Error(`credit_revoke_failed:${revoked.error.code ?? "unknown"}`);
        // Mantem o registro local refletindo o evento (o RPC ja marca 'refunded'
        // para compras pagas; checkouts nunca pagos precisam deste update).
        await admin.from("ai_credit_checkouts").update({ status: event.event === "checkout.refunded" ? "refunded" : "disputed", updated_at: now }).eq("id", creditResult.data.id);
      } else {
        await admin.from("payment_webhook_events").update({ status: "ignored", processed_at: now }).eq("provider_event_id", providerEventId);
        return NextResponse.json({ ok: true, ignored: true });
      }
      await admin.from("payment_webhook_events").update({ status: "processed", processed_at: now }).eq("provider_event_id", providerEventId);
      return NextResponse.json({ ok: true });
    }
    if (!externalId) throw new Error("missing_external_id");
    const checkoutResult = await admin.from("billing_checkouts").select("id,user_id,plan_id,checkout_type,previous_provider_subscription_id,amount_cents").eq("external_id", externalId).single();
    if (checkoutResult.error || !checkoutResult.data) throw new Error("checkout_not_found");
    const checkout = checkoutResult.data;
    const now = new Date().toISOString();

    if (event.event === "checkout.completed" || event.event === "subscription.completed" || event.event === "subscription.renewed") {
      // Mesmo gate fail-closed da ativação de créditos (RH-01): valor/currency/
      // devMode divergentes do payload do provedor não ativam assinatura.
      if (!providerWebhookPayable(checkoutObject, Number(checkout.amount_cents) || 0)) {
        console.warn("Subscription webhook activation rejected: provider payload amount/currency/devMode mismatch", {
          checkoutId: checkout.id,
          providerAmount: checkoutObject?.amount,
          storedAmountCents: checkout.amount_cents,
          providerCurrency: checkoutObject?.currency,
          providerDevMode: checkoutObject?.devMode,
        });
        await admin.from("payment_webhook_events").update({ status: "ignored", processed_at: now, processing_error: "provider_payload_mismatch" }).eq("provider_event_id", providerEventId);
        return NextResponse.json({ ok: true, ignored: true });
      }
      const newProviderSubscriptionId = checkout.checkout_type === "card_subscription" ? stringValue(subscriptionObject?.id) : null;
      await cancelPreviousProviderSubscription(checkout.previous_provider_subscription_id, newProviderSubscriptionId);
      await admin.from("billing_checkouts").update({ status: "paid", paid_at: now, provider_checkout_id: providerObjectId, receipt_url: stringValue(checkoutObject?.receiptUrl), previous_provider_subscription_id: null, updated_at: now }).eq("id", checkout.id);
      const subscriptionUpdate: Record<string, unknown> = {
        user_id: checkout.user_id,
        plan_id: checkout.plan_id,
        source_checkout_id: checkout.id,
        billing_method: checkout.checkout_type === "pix" ? "pix" : "card",
        status: "active",
        current_period_start: now,
        current_period_end: nextPeriodEnd(),
        cancelled_at: null,
        updated_at: now,
      };
      if (newProviderSubscriptionId) subscriptionUpdate.provider_subscription_id = newProviderSubscriptionId;
      const saved = await admin.from("subscriptions").upsert(subscriptionUpdate, { onConflict: "user_id" });
      if (saved.error) throw new Error("subscription_save_failed");
      const phClient = getPostHogClient();
      const phEventName = event.event === "subscription.renewed" ? "subscription_renewed" : "subscription_activated";
      phClient.capture({
        distinctId: checkout.user_id,
        event: phEventName,
        properties: { plan_id: checkout.plan_id, billing_method: subscriptionUpdate.billing_method, webhook_event: event.event },
      });
      await phClient.flush();
    } else if (["checkout.refunded", "checkout.disputed", "checkout.lost"].includes(event.event)) {
      const status = event.event === "checkout.refunded" ? "refunded" : "disputed";
      await admin.from("billing_checkouts").update({ status, updated_at: now }).eq("id", checkout.id);
      await admin.from("subscriptions").update({ status: "suspended", updated_at: now }).eq("source_checkout_id", checkout.id);
    } else if (event.event === "subscription.cancelled") {
      await admin.from("billing_checkouts").update({ status: "cancelled", updated_at: now }).eq("id", checkout.id);
      const cancelledProviderId = stringValue(subscriptionObject?.id);
      if (cancelledProviderId) await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("user_id", checkout.user_id).eq("provider_subscription_id", cancelledProviderId);
      const phClient = getPostHogClient();
      phClient.capture({
        distinctId: checkout.user_id,
        event: "subscription_cancelled_server",
        properties: { plan_id: checkout.plan_id, webhook_event: event.event },
      });
      await phClient.flush();
    } else {
      await admin.from("payment_webhook_events").update({ status: "ignored", processed_at: now }).eq("provider_event_id", providerEventId);
      return NextResponse.json({ ok: true, ignored: true });
    }

    await admin.from("payment_webhook_events").update({ status: "processed", processed_at: now }).eq("provider_event_id", providerEventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await admin.from("payment_webhook_events").update({ status: "failed", processing_error: message.slice(0, 500) }).eq("provider_event_id", providerEventId);
    console.error("AbacatePay webhook failed", message);
    return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
  }
}
