import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { abacateRequest } from "./abacatepay/client";
import type { AbacateCheckout, AbacateProduct } from "./abacatepay/types";
import { db, schema } from "@/lib/db";

const { aiCreditCheckouts, aiCreditLedger, aiCreditProducts, aiCreditWallets } = schema;

/** Localiza o código 23505 (unique_violation) na cadeia de causes do pg/Drizzle. */
function isUniqueViolationError(error: unknown): boolean {
  let cause: unknown = error;
  for (let depth = 0; cause && depth < 5; depth += 1) {
    if (typeof cause === "object" && cause !== null && "code" in cause && (cause as { code?: unknown }).code === "23505") return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

export type ConsumeAiCreditResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: "insufficient_credits" | "credit_already_consumed" };

/**
 * Débito atômico de 1 crédito (equivale ao RPC `consume_ai_credit`): debita a
 * carteira só se `balance >= 1`, registra o uso no ledger com `reference`
 * única (idempotência por job) e devolve o saldo restante. Tudo numa única
 * transação — falha no ledger reverte o débito.
 */
export async function consumeAiCredit(userId: string, reference: string, metadata: Record<string, unknown>): Promise<ConsumeAiCreditResult> {
  try {
    return await db.transaction(async (tx) => {
      const [wallet] = await tx
        .update(aiCreditWallets)
        .set({
          balance: sql`${aiCreditWallets.balance} - 1`,
          lifetimeUsed: sql`${aiCreditWallets.lifetimeUsed} + 1`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(aiCreditWallets.userId, userId), gte(aiCreditWallets.balance, 1)))
        .returning({ balance: aiCreditWallets.balance });
      if (!wallet) return { ok: false as const, reason: "insufficient_credits" as const };

      await tx.insert(aiCreditLedger).values({ userId, amount: -1, reason: "usage", reference, metadata });
      return { ok: true as const, remaining: wallet.balance };
    });
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, reason: "credit_already_consumed" };
    throw error;
  }
}

export type RefundAiCreditResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "usage_not_found" };

/**
 * Estorno de 1 crédito (equivale ao RPC `refund_ai_credit`): só devolve se o
 * consumo correspondente existe; o lançamento de estorno usa a referência
 * derivada (`<reference>:refund`) para a UNIQUE do ledger tornar o estorno
 * idempotente — segunda chamada devolve o saldo sem creditar de novo.
 */
export async function refundAiCredit(userId: string, reference: string): Promise<RefundAiCreditResult> {
  return db.transaction(async (tx) => {
    const [usage] = await tx.select({ id: aiCreditLedger.id })
      .from(aiCreditLedger)
      .where(and(eq(aiCreditLedger.userId, userId), eq(aiCreditLedger.reference, reference), eq(aiCreditLedger.reason, "usage")))
      .limit(1);
    if (!usage) return { ok: false as const, reason: "usage_not_found" as const };

    try {
      await tx.insert(aiCreditLedger).values({
        userId,
        amount: 1,
        reason: "refund",
        reference: `${reference}:refund`,
        metadata: { refund_of: reference },
      });
    } catch (error) {
      if (isUniqueViolationError(error)) {
        // Estorno já registrado: devolve o saldo atual sem creditar de novo.
        const [wallet] = await tx.select({ balance: aiCreditWallets.balance }).from(aiCreditWallets).where(eq(aiCreditWallets.userId, userId)).limit(1);
        return { ok: true as const, balance: wallet?.balance ?? 0 };
      }
      throw error;
    }

    const [wallet] = await tx
      .update(aiCreditWallets)
      .set({
        balance: sql`${aiCreditWallets.balance} + 1`,
        lifetimeUsed: sql`greatest(0, ${aiCreditWallets.lifetimeUsed} - 1)`,
        updatedAt: sql`now()`,
      })
      .where(eq(aiCreditWallets.userId, userId))
      .returning({ balance: aiCreditWallets.balance });
    return { ok: true as const, balance: wallet?.balance ?? 0 };
  });
}

type CreditProduct = { id: string; slug: string; name: string; credits: number; bonus_credits: number; amount_cents: number; provider_product_id: string | null };
function siteUrl() { return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""); }

async function ensureProviderProduct(product: CreditProduct) {
  if (product.provider_product_id) return product.provider_product_id;
  const externalId = `prisma-${product.slug}`;
  const listed = await abacateRequest<AbacateProduct[]>("/products/list?limit=100");
  let provider = listed.find((item) => item.externalId === externalId);
  if (!provider) provider = await abacateRequest<AbacateProduct>("/products/create", { method: "POST", body: JSON.stringify({ externalId, name: `${product.name} - Creditos Prisma IA`, description: `${product.credits + product.bonus_credits} creditos para analises e recomendacoes`, price: product.amount_cents, currency: "BRL" }) });
  await db.update(aiCreditProducts).set({ providerProductId: provider.id, updatedAt: new Date() }).where(eq(aiCreditProducts.id, product.id));
  return provider.id;
}

export async function createAiCreditCheckout(userId: string, product: CreditProduct) {
  const providerProductId = await ensureProviderProduct(product);
  const id = crypto.randomUUID();
  const externalId = `prisma_ai_${id}`;
  await db.insert(aiCreditCheckouts).values({ id, userId, productId: product.id, externalId, amountCents: product.amount_cents });
  try {
    const checkout = await abacateRequest<AbacateCheckout>("/checkouts/create", { method: "POST", body: JSON.stringify({ items: [{ id: providerProductId, quantity: 1 }], externalId, methods: ["PIX", "CARD"], returnUrl: `${siteUrl()}/dashboard/billing`, completionUrl: `${siteUrl()}/dashboard/billing?creditCheckout=${id}`, metadata: { prismaUserId: userId, prismaAiProduct: product.slug, prismaCreditCheckoutId: id } }) });
    await db.update(aiCreditCheckouts).set({ providerCheckoutId: checkout.id, checkoutUrl: checkout.url, status: "pending", updatedAt: new Date() }).where(eq(aiCreditCheckouts.id, id));
    return { id, url: checkout.url };
  } catch (error) {
    await db.update(aiCreditCheckouts).set({ status: "failed", updatedAt: new Date() }).where(eq(aiCreditCheckouts.id, id));
    throw error;
  }
}
