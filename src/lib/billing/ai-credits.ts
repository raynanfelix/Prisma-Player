import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { abacateRequest } from "./abacatepay/client";
import type { AbacateCheckout, AbacateProduct } from "./abacatepay/types";

type CreditProduct = { id: string; slug: string; name: string; credits: number; bonus_credits: number; amount_cents: number; provider_product_id: string | null };
function siteUrl() { return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""); }

async function ensureProviderProduct(product: CreditProduct) {
  if (product.provider_product_id) return product.provider_product_id;
  const externalId = `prisma-${product.slug}`;
  const listed = await abacateRequest<AbacateProduct[]>("/products/list?limit=100");
  let provider = listed.find((item) => item.externalId === externalId);
  if (!provider) provider = await abacateRequest<AbacateProduct>("/products/create", { method: "POST", body: JSON.stringify({ externalId, name: `${product.name} - Creditos Prisma IA`, description: `${product.credits + product.bonus_credits} creditos para analises e recomendacoes`, price: product.amount_cents, currency: "BRL" }) });
  const { error } = await createAdminClient().from("ai_credit_products").update({ provider_product_id: provider.id, updated_at: new Date().toISOString() }).eq("id", product.id);
  if (error) throw new Error("ai_product_save_failed");
  return provider.id;
}

export async function createAiCreditCheckout(userId: string, product: CreditProduct) {
  const admin = createAdminClient(); const providerProductId = await ensureProviderProduct(product); const id = crypto.randomUUID(); const externalId = `prisma_ai_${id}`;
  const { error: insertError } = await admin.from("ai_credit_checkouts").insert({ id, user_id: userId, product_id: product.id, external_id: externalId, amount_cents: product.amount_cents });
  if (insertError) throw new Error("ai_checkout_create_failed");
  try {
    const checkout = await abacateRequest<AbacateCheckout>("/checkouts/create", { method: "POST", body: JSON.stringify({ items: [{ id: providerProductId, quantity: 1 }], externalId, methods: ["PIX", "CARD"], returnUrl: `${siteUrl()}/dashboard/billing`, completionUrl: `${siteUrl()}/dashboard/billing?creditCheckout=${id}`, metadata: { prismaUserId: userId, prismaAiProduct: product.slug, prismaCreditCheckoutId: id } }) });
    await admin.from("ai_credit_checkouts").update({ provider_checkout_id: checkout.id, checkout_url: checkout.url, status: "pending", updated_at: new Date().toISOString() }).eq("id", id);
    return { id, url: checkout.url };
  } catch (error) { await admin.from("ai_credit_checkouts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", id); throw error; }
}
