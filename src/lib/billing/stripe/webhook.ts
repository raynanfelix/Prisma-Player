import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { CATALOG_CREDIT_PACKAGES, CATALOG_PLANS } from "@/lib/billing/catalog";
import { getStripe } from "@/lib/billing/stripe/client";
import { db, schema } from "@/lib/db";
import { safeLog } from "@/lib/utils/log";

const { aiCreditLedger, aiCreditWallets, billingPlans, profiles, subscriptions } = schema;

/**
 * Fulfillment dos webhooks do Stripe (Opção A). A ROTA valida a assinatura e
 * cuida da idempotência (payment_webhook_events); este módulo só DECIDE e
 * GRAVA. Regras da spec/skills:
 *
 * - Fulfillment de `checkout.session.completed`/`async_payment_succeeded`
 *   SOMENTE com `payment_status !== "unpaid"` — nunca na página de sucesso.
 * - OwnerId via `client_reference_id` (campo oficial); metadata é fallback.
 * - Objeto `plan` (deprecated) nunca: plano vem do lookup_key do Price.
 * - `invoice.payment_failed` → past_due (dunning é do Stripe, não cancela).
 * - Risk-side (dispute/refund/fraud): fase 1 = log estruturado + evento na
 *   payment_webhook_events — NÃO suspende automaticamente (decisão da spec).
 *
 * Object graph da API 2026-09-30.endive: o período vive no SubscriptionItem
 * (items.data[0].current_period_*), o Invoice referencia a subscription via
 * parent.subscription_details e o Charge referencia o Customer (que é o
 * nosso vínculo local: profiles.stripe_customer_id).
 */

export type StripeEventOutcome = "processed" | "ignored";

/** Localiza o código 23505 (unique_violation) na cadeia de causes do pg/Drizzle. */
function isUniqueViolation(error: unknown): boolean {
  let cause: unknown = error;
  for (let depth = 0; cause && depth < 5; depth += 1) {
    if (typeof cause === "object" && cause !== null && "code" in cause && (cause as { code?: unknown }).code === "23505") return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

function unixToDate(unix: number | null | undefined): Date | null {
  return typeof unix === "number" ? new Date(unix * 1000) : null;
}

/** Período vigente: na API endive vive no primeiro item da subscription. */
function subscriptionPeriodOf(subscription: Stripe.Subscription): { start: Date | null; end: Date | null } {
  const item = subscription.items.data[0];
  return {
    start: item ? unixToDate(item.current_period_start) : null,
    end: item ? unixToDate(item.current_period_end) : null,
  };
}

/** Subscription de um Invoice (endive): parent.subscription_details.subscription. */
function subscriptionIdOfInvoice(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription ?? null;
  const id = typeof subscription === "string" ? subscription : subscription?.id ?? null;
  return id || null;
}

/** OwnerId da session: client_reference_id (oficial) → metadata como fallback. */
function sessionOwnerId(session: Stripe.Checkout.Session): string | null {
  const fromMetadata = session.metadata?.accountOwnerId;
  const owner = session.client_reference_id ?? (typeof fromMetadata === "string" ? fromMetadata : null);
  const clean = owner?.trim().slice(0, 128);
  return clean || null;
}

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (typeof customer === "string") return customer;
  return customer && "id" in customer ? customer.id : null;
}

/** Dispatcher principal — chamado pela rota após assinatura + idempotência. */
export async function processStripeEvent(event: Stripe.Event): Promise<StripeEventOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "unpaid") return "ignored";
      return fulfillCheckoutSession(session);
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      safeLog("stripe_checkout_async_payment_failed", { sessionId: session.id, mode: session.mode });
      return "ignored";
    }
    case "customer.subscription.updated":
      return applySubscriptionState(event.data.object as Stripe.Subscription);
    case "customer.subscription.deleted":
      return markSubscriptionEnded(event.data.object as Stripe.Subscription);
    case "invoice.paid":
      return applyRenewalPaid(event.data.object as Stripe.Invoice);
    case "invoice.payment_failed":
      return markSubscriptionPastDue(event.data.object as Stripe.Invoice);
    case "charge.dispute.created":
    case "charge.refunded":
    case "radar.early_fraud_warning.created":
      return handleRiskEvent(event);
    default:
      return "ignored";
  }
}

/** Session paga: ativa o plano (subscription) ou credita a carteira (payment). */
async function fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<StripeEventOutcome> {
  const ownerId = sessionOwnerId(session);
  if (!ownerId) {
    // Session sem vínculo com conta (não deveria existir no fluxo do app):
    // rastro alto para o dono resolver manualmente — retry não resolve.
    safeLog("stripe_checkout_orphan_session", { sessionId: session.id, mode: session.mode });
    return "ignored";
  }
  if (session.mode === "subscription") return fulfillPlanSession(session, ownerId);
  if (session.mode === "payment") return fulfillCreditsSession(session, ownerId);
  return "ignored";
}

/**
 * Plano: resolve a Subscription (object graph oficial — não metadata) para
 * pegar o período (item) e o lookup_key do Price (`plano_<slug>_<mensal|anual>`),
 * garante a row do plano em billing_plans (catálogo local) e ativa.
 */
async function fulfillPlanSession(session: Stripe.Checkout.Session, ownerId: string): Promise<StripeEventOutcome> {
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (!subscriptionId) throw new Error("checkout_sem_subscription");

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const lookupKey = subscription.items.data[0]?.price?.lookup_key ?? null;
  const planSlug = /^plano_([a-z0-9-]+)_(mensal|anual)$/.exec(lookupKey ?? "")?.[1] ?? null;
  if (!planSlug) throw new Error(`subscription_sem_lookup_key:${subscriptionId}`);

  const planId = await ensureBillingPlanRow(planSlug);
  const period = subscriptionPeriodOf(subscription);
  const periodStart = period.start ?? new Date();
  const periodEnd = period.end;

  await db
    .insert(subscriptions)
    .values({
      userId: ownerId,
      planId,
      provider: "stripe",
      billingMethod: "card",
      providerSubscriptionId: subscriptionId,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planId,
        provider: "stripe",
        billingMethod: "card",
        providerSubscriptionId: subscriptionId,
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelledAt: null,
        updatedAt: new Date(),
      },
    });

  await saveStripeCustomerId(ownerId, session.customer);
  return "processed";
}

/** Row do plano por slug; se o banco ainda não tem (catálogo local no ar), cria. */
async function ensureBillingPlanRow(planSlug: string): Promise<string> {
  const existing = await db
    .select({ id: billingPlans.id })
    .from(billingPlans)
    .where(eq(billingPlans.slug, planSlug))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const catalog = CATALOG_PLANS.find((plan) => plan.slug === planSlug);
  if (!catalog) throw new Error(`plano_desconhecido:${planSlug}`);
  await db
    .insert(billingPlans)
    .values({
      slug: catalog.slug,
      name: catalog.name,
      description: catalog.description,
      amountCents: catalog.amount_cents,
      currency: "BRL",
      interval: "monthly",
      includedPlays: catalog.included_plays,
      storageGb: catalog.storage_gb ?? 0,
      prismaAiAnalyses: catalog.prisma_ai_analyses,
      teamSeats: catalog.team_seats,
      playOverageMillicents: catalog.play_overage_millicents,
      isFeatured: catalog.is_featured,
    })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: billingPlans.id })
    .from(billingPlans)
    .where(eq(billingPlans.slug, planSlug))
    .limit(1);
  if (!row) throw new Error(`plano_nao_criado:${planSlug}`);
  return row.id;
}

/** Créditos: soma a carteira + linha no ledger (ref = session.id, unique). */
async function fulfillCreditsSession(session: Stripe.Checkout.Session, ownerId: string): Promise<StripeEventOutcome> {
  const detailed = await getStripe().checkout.sessions.retrieve(session.id, { expand: ["line_items.data.price"] });
  const price = detailed.line_items?.data[0]?.price;
  const lookupKey = price && typeof price !== "string" ? price.lookup_key : null;
  const suffix = /^creditos_ia_([a-z0-9-]+)$/.exec(lookupKey ?? "")?.[1] ?? null;
  const pack = CATALOG_CREDIT_PACKAGES.find((item) => item.slug === `credits-${suffix}`);
  if (!pack) throw new Error(`pacote_desconhecido:${lookupKey ?? "sem_lookup"}`);
  const total = pack.credits + pack.bonus_credits;

  try {
    // Tudo numa transação: falha no ledger (session já creditada por outro
    // evento) reverte o saldo — a UNIQUE do reference é a segunda idempotência.
    await db.transaction(async (tx) => {
      await tx
        .insert(aiCreditWallets)
        .values({ userId: ownerId, balance: total, lifetimePurchased: total })
        .onConflictDoUpdate({
          target: aiCreditWallets.userId,
          set: {
            balance: sql`${aiCreditWallets.balance} + ${total}`,
            lifetimePurchased: sql`${aiCreditWallets.lifetimePurchased} + ${total}`,
            updatedAt: new Date(),
          },
        });
      await tx.insert(aiCreditLedger).values({
        userId: ownerId,
        amount: total,
        reason: "stripe_checkout",
        reference: session.id,
        metadata: { provider: "stripe", sessionId: session.id, packageSlug: pack.slug },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "processed";
    throw error;
  }
  return "processed";
}

/** Grava o customer do Stripe no profile (alimenta o Portal e o risk-side). */
async function saveStripeCustomerId(ownerId: string, customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<void> {
  const customerId = customerIdOf(customer);
  if (!customerId) return;
  await db
    .update(profiles)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(profiles.id, ownerId));
}

/** Status local a partir do status do Stripe — fail-closed: desconhecido vira past_due (sem acesso). */
function localStatusOf(stripeStatus: string): string {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "cancelled";
  if (stripeStatus === "paused") return "suspended";
  return "past_due";
}

/** Sincroniza status + período da Subscription local (update/updated, renovação). */
async function applySubscriptionState(subscription: Stripe.Subscription): Promise<StripeEventOutcome> {
  const rows = await db
    .update(subscriptions)
    .set({
      status: localStatusOf(subscription.status),
      currentPeriodEnd: subscriptionPeriodOf(subscription).end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.providerSubscriptionId, subscription.id))
    .returning({ id: subscriptions.id });
  if (rows.length === 0) safeLog("stripe_subscription_desconhecida", { subscriptionId: subscription.id, status: subscription.status });
  return "processed";
}

/** subscription.deleted → cancelled (nunca apaga o histórico local). */
async function markSubscriptionEnded(subscription: Stripe.Subscription): Promise<StripeEventOutcome> {
  const rows = await db
    .update(subscriptions)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      currentPeriodEnd: subscriptionPeriodOf(subscription).end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.providerSubscriptionId, subscription.id))
    .returning({ id: subscriptions.id });
  if (rows.length === 0) safeLog("stripe_subscription_desconhecida", { subscriptionId: subscription.id, status: subscription.status });
  return "processed";
}

/** invoice.paid de renovação → garante active com o período novo. */
async function applyRenewalPaid(invoice: Stripe.Invoice): Promise<StripeEventOutcome> {
  const subscriptionId = subscriptionIdOfInvoice(invoice);
  if (!subscriptionId) {
    safeLog("stripe_invoice_sem_subscription", { invoiceId: invoice.id ?? "" });
    return "ignored";
  }
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  return applySubscriptionState(subscription);
}

/** invoice.payment_failed → past_due (dunning/retry é do Stripe, não cancela). */
async function markSubscriptionPastDue(invoice: Stripe.Invoice): Promise<StripeEventOutcome> {
  const subscriptionId = subscriptionIdOfInvoice(invoice);
  if (!subscriptionId) {
    safeLog("stripe_invoice_sem_subscription", { invoiceId: invoice.id ?? "" });
    return "ignored";
  }
  const rows = await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.providerSubscriptionId, subscriptionId))
    .returning({ id: subscriptions.id });
  if (rows.length === 0) safeLog("stripe_subscription_desconhecida", { subscriptionId, status: "past_due" });
  return "processed";
}

/**
 * Risk-side (dispute/refund/fraud warning): fase 1 = LOG ESTRUTURADO +
 * evento registrado na payment_webhook_events — sem suspensão automática
 * (decisão da spec; o dono age manualmente).
 * Resolução pelo ownership boundary real: charge → Customer →
 * profiles.stripe_customer_id → conta local (e a subscription stripe dela,
 * se existir). Sem customer no charge (raríssimo), o log segue com o que houver.
 */
async function handleRiskEvent(event: Stripe.Event): Promise<StripeEventOutcome> {
  const object = (event.data.object ?? {}) as unknown as Record<string, unknown>;
  const chargeRef = object["charge"];
  const chargeId =
    typeof chargeRef === "string"
      ? chargeRef
      : chargeRef && typeof chargeRef === "object" && typeof (chargeRef as { id?: unknown }).id === "string"
        ? (chargeRef as { id: string }).id
        : typeof object["id"] === "string"
          ? object["id"]
          : null;

  let ownerId: string | null = null;
  let subscriptionId: string | null = null;
  try {
    if (chargeId) {
      const charge = await getStripe().charges.retrieve(chargeId);
      const customerId = customerIdOf(charge.customer ?? null);
      if (customerId) {
        const [profile] = await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.stripeCustomerId, customerId))
          .limit(1);
        ownerId = profile?.id ?? null;
      }
      if (!ownerId) {
        // Fallback: session de créditos deixa o dono no metadata do PI.
        const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
        if (intentId) {
          const intent = await getStripe().paymentIntents.retrieve(intentId);
          const fromIntent = intent.metadata?.accountOwnerId;
          if (typeof fromIntent === "string") ownerId = fromIntent;
        }
      }
      if (ownerId) {
        const [row] = await db
          .select({ id: subscriptions.providerSubscriptionId })
          .from(subscriptions)
          .where(and(eq(subscriptions.userId, ownerId), eq(subscriptions.provider, "stripe")))
          .limit(1);
        subscriptionId = row?.id ?? null;
      }
    }
  } catch {
    // Best-effort: o log segue com o que foi resolvido até aqui.
  }

  safeLog("stripe_risk_event", { type: event.type, eventId: event.id, chargeId, subscriptionId, ownerId });
  return "processed";
}
