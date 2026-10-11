import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { abacateRequest } from "./abacatepay/client";
import type { AbacateCheckout, AbacateProduct } from "./abacatepay/types";
import type { BillingPlan } from "./catalog";

type CheckoutType = "pix" | "card_subscription";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function listProducts() {
  const result = await abacateRequest<AbacateProduct[] | { data?: AbacateProduct[] }>("/products/list?limit=100");
  return Array.isArray(result) ? result : result.data ?? [];
}

async function ensureProduct(plan: BillingPlan, type: CheckoutType) {
  const admin = createAdminClient();
  const column = type === "pix" ? "provider_pix_product_id" : "provider_card_product_id";
  if (plan[column]) return plan[column] as string;

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
  const saved = await admin.from("billing_plans").update({ [column]: product.id, updated_at: new Date().toISOString() }).eq("id", plan.id);
  if (saved.error) throw new Error("billing_product_save_failed");
  return product.id;
}

export async function createBillingCheckout(userId: string, plan: BillingPlan, type: CheckoutType) {
  const admin = createAdminClient();
  const { data: currentSubscription } = await admin.from("subscriptions")
    .select("plan_id,status,provider_subscription_id")
    .eq("user_id", userId).eq("status", "active").maybeSingle();
  if (currentSubscription?.plan_id === plan.id) throw new Error("plan_already_active");
  const productId = await ensureProduct(plan, type);
  const checkoutId = crypto.randomUUID();
  const externalId = `prisma_${checkoutId}`;
  const inserted = await admin.from("billing_checkouts").insert({
    id: checkoutId,
    user_id: userId,
    plan_id: plan.id,
    checkout_type: type,
    external_id: externalId,
    amount_cents: plan.amount_cents,
    previous_provider_subscription_id: currentSubscription?.provider_subscription_id ?? null,
  });
  if (inserted.error) throw new Error("billing_checkout_create_failed");

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
    const updated = await admin.from("billing_checkouts").update({ provider_checkout_id: checkout.id, checkout_url: checkout.url, status: "pending", updated_at: new Date().toISOString() }).eq("id", checkoutId);
    if (updated.error) throw new Error("billing_checkout_update_failed");
    return { id: checkoutId, url: checkout.url };
  } catch (error) {
    await admin.from("billing_checkouts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", checkoutId);
    throw error;
  }
}
