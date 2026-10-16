import "server-only";

import { and, eq } from "drizzle-orm";

import { abacateRequest } from "./abacatepay/client";
import type { AbacateCheckout, AbacateProduct } from "./abacatepay/types";
import type { BillingPlan } from "./catalog";
import { db, schema } from "@/lib/db";

const { billingCheckouts, billingPlans, subscriptions } = schema;

type CheckoutType = "pix" | "card_subscription";

/**
 * Adapta a linha Drizzle de `billing_plans` para o contrato snake_case de
 * `BillingPlan` (consumido pelo checkout, pela reconciliação e pelas telas).
 */
export function toBillingPlan(row: typeof billingPlans.$inferSelect): BillingPlan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    amount_cents: row.amountCents,
    currency: "BRL", // CHECK da tabela garante BRL
    included_plays: row.includedPlays,
    storage_gb: row.storageGb,
    prisma_ai_analyses: row.prismaAiAnalyses,
    team_seats: row.teamSeats,
    play_overage_millicents: row.playOverageMillicents,
    storage_overage_cents_per_gb: row.storageOverageCentsPerGb,
    provider_pix_product_id: row.providerPixProductId,
    provider_card_product_id: row.providerCardProductId,
    is_featured: row.isFeatured,
    automatic_reports: row.automaticReports,
    audience_sync: row.audienceSync,
    outgoing_webhooks: row.outgoingWebhooks,
    private_benchmark: row.privateBenchmark,
    portfolio_comparison: row.portfolioComparison,
    conversion_drop_alerts: row.conversionDropAlerts,
  };
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function listProducts() {
  const result = await abacateRequest<AbacateProduct[] | { data?: AbacateProduct[] }>("/products/list?limit=100");
  return Array.isArray(result) ? result : result.data ?? [];
}

async function ensureProduct(plan: BillingPlan, type: CheckoutType) {
  if (type === "pix") {
    if (plan.provider_pix_product_id) return plan.provider_pix_product_id;
  } else if (plan.provider_card_product_id) {
    return plan.provider_card_product_id;
  }

  const externalId = `${plan.slug}-${type === "pix" ? "pix-month" : "card-monthly"}`;
  const products = await listProducts();
  let product = products.find((item) => item.externalId === externalId);
  if (!product) {
    product = await abacateRequest<AbacateProduct>("/products/create", {
      method: "POST",
      body: JSON.stringify({
        externalId,
        name: `${plan.name} - ${type === "pix" ? "30 dias via PIX" : "Cartao mensal"}`,
        description: plan.description,
        price: plan.amount_cents,
        currency: "BRL",
        ...(type === "card_subscription" ? { cycle: "MONTHLY" } : {}),
      }),
    });
  }
  const updatedAt = new Date();
  const patch = type === "pix"
    ? { providerPixProductId: product.id, updatedAt }
    : { providerCardProductId: product.id, updatedAt };
  await db.update(billingPlans).set(patch).where(eq(billingPlans.id, plan.id));
  return product.id;
}

export async function createBillingCheckout(userId: string, plan: BillingPlan, type: CheckoutType) {
  const [currentSubscription] = await db
    .select({
      planId: subscriptions.planId,
      status: subscriptions.status,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);
  if (currentSubscription?.planId === plan.id) throw new Error("plan_already_active");
  const productId = await ensureProduct(plan, type);
  const checkoutId = crypto.randomUUID();
  const externalId = `prisma_${checkoutId}`;
  await db.insert(billingCheckouts).values({
    id: checkoutId,
    userId,
    planId: plan.id,
    checkoutType: type,
    externalId,
    amountCents: plan.amount_cents,
    previousProviderSubscriptionId: currentSubscription?.providerSubscriptionId ?? null,
  });

  const path = type === "pix" ? "/checkouts/create" : "/subscriptions/create";
  try {
    const checkout = await abacateRequest<AbacateCheckout>(path, {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: productId, quantity: 1 }],
        externalId,
        methods: [type === "pix" ? "PIX" : "CARD"],
        returnUrl: `${siteUrl()}/dashboard/billing`,
        completionUrl: `${siteUrl()}/checkout/result?checkout=${checkoutId}`,
        metadata: { prismaUserId: userId, prismaPlan: plan.slug, prismaCheckoutId: checkoutId },
        ...(type === "card_subscription" ? { retryPolicy: { maxRetry: 3, retryEvery: 2 } } : {}),
      }),
    });
    await db.update(billingCheckouts).set({
      providerCheckoutId: checkout.id,
      checkoutUrl: checkout.url,
      status: "pending",
      updatedAt: new Date(),
    }).where(eq(billingCheckouts.id, checkoutId));
    return { id: checkoutId, url: checkout.url };
  } catch (error) {
    await db.update(billingCheckouts).set({ status: "failed", updatedAt: new Date() }).where(eq(billingCheckouts.id, checkoutId));
    throw error;
  }
}
