import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { abacateRequest } from "./abacatepay/client";
import { providerPayable } from "./provider-payable";
import type { AbacateCheckout } from "./abacatepay/types";
import { db, schema } from "@/lib/db";

const { aiCreditCheckouts, aiCreditLedger, aiCreditProducts, aiCreditWallets, userInbox } = schema;

type StoredAiCheckout = {
  id: string;
  user_id: string;
  external_id: string;
  status: string;
  amount_cents: number;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Entrega idempotente de créditos (equivale ao RPC `apply_ai_credit_purchase`):
 * o lançamento na ledger tem `reference` única (`ai-credit:<checkout_id>`), e a
 * carteira só é incrementada quando o lançamento é inédito — entregas repetidas
 * do webhook não creditam duas vezes. `FOR UPDATE` do checkout serializa
 * concorrência.
 */
async function applyAiCreditPurchaseTx(tx: Tx, checkoutId: string, providerEventId: string): Promise<void> {
  const [checkout] = await tx
    .select({
      userId: aiCreditCheckouts.userId,
      creditTotal: sql<number>`(${aiCreditProducts.credits} + ${aiCreditProducts.bonusCredits})::int`,
    })
    .from(aiCreditCheckouts)
    .innerJoin(aiCreditProducts, eq(aiCreditProducts.id, aiCreditCheckouts.productId))
    .where(eq(aiCreditCheckouts.id, checkoutId))
    .for("update", { of: aiCreditCheckouts })
    .limit(1);
  if (!checkout) throw new Error("credit checkout not found");

  const granted = await tx
    .insert(aiCreditLedger)
    .values({
      userId: checkout.userId,
      amount: checkout.creditTotal,
      reason: "purchase",
      reference: providerEventId,
      metadata: { checkoutId },
    })
    .onConflictDoNothing({ target: aiCreditLedger.reference })
    .returning({ id: aiCreditLedger.id });
  if (granted.length === 0) return; // entrega repetida: idempotente

  await tx
    .insert(aiCreditWallets)
    .values({ userId: checkout.userId, balance: checkout.creditTotal, lifetimePurchased: checkout.creditTotal })
    .onConflictDoUpdate({
      target: aiCreditWallets.userId,
      set: {
        balance: sql`${aiCreditWallets.balance} + excluded.balance`,
        lifetimePurchased: sql`${aiCreditWallets.lifetimePurchased} + excluded.lifetime_purchased`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Estorno de compra de créditos Prisma IA (equivale ao RPC
 * `revoke_ai_credit_purchase`), idempotente e conservador:
 *  * só age quando o checkout está 'paid' E existe o lançamento de compra na
 *    ledger (referência `ai-credit:<checkout_id>`);
 *  * converte o lançamento de compra num estorno usando a MESMA referência
 *    (UNIQUE da ledger), então entregas repetidas do webhook são idempotentes;
 *  * decrementa o saldo da carteira com piso 0 (nunca negativo);
 *  * marca o checkout como 'refunded'.
 */
async function revokeAiCreditPurchaseTx(tx: Tx, checkoutId: string): Promise<void> {
  const [checkout] = await tx
    .select({ userId: aiCreditCheckouts.userId, status: aiCreditCheckouts.status })
    .from(aiCreditCheckouts)
    .where(eq(aiCreditCheckouts.id, checkoutId))
    .for("update")
    .limit(1);
  if (!checkout) throw new Error("credit checkout not found");

  // Estorno só desfaz uma entrega que existiu de fato.
  if (checkout.status !== "paid") return;

  const referenceKey = `ai-credit:${checkoutId}`;
  // O valor creditado na compra vem do próprio lançamento (fonte da verdade).
  const [purchase] = await tx
    .select({ amount: aiCreditLedger.amount })
    .from(aiCreditLedger)
    .where(and(eq(aiCreditLedger.reference, referenceKey), eq(aiCreditLedger.reason, "purchase")))
    .limit(1);
  if (!purchase) return; // checkout pago sem lançamento: nada a estornar

  // Reversão na MESMA referência da compra (UNIQUE) para idempotência.
  await tx
    .insert(aiCreditLedger)
    .values({
      userId: checkout.userId,
      amount: -purchase.amount,
      reason: "refund",
      reference: referenceKey,
      metadata: { checkoutId, revoked: true },
    })
    .onConflictDoUpdate({
      target: aiCreditLedger.reference,
      set: { amount: sql`excluded.amount`, reason: sql`excluded.reason`, metadata: sql`excluded.metadata` },
    });

  await tx
    .update(aiCreditWallets)
    .set({ balance: sql`greatest(0, ${aiCreditWallets.balance} - ${purchase.amount})`, updatedAt: sql`now()` })
    .where(eq(aiCreditWallets.userId, checkout.userId));

  await tx
    .update(aiCreditCheckouts)
    .set({ status: "refunded", updatedAt: sql`now()` })
    .where(eq(aiCreditCheckouts.id, checkoutId));
}

export async function revokeAiCreditPurchase(checkoutId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await revokeAiCreditPurchaseTx(tx, checkoutId);
  });
}

export async function activatePaidAiCreditCheckout(checkout: StoredAiCheckout, provider: Pick<AbacateCheckout, "id">): Promise<void> {
  const now = new Date();
  // Crédito na carteira, confirmação do checkout e aviso no inbox dependem
  // entre si: uma única transação garante tudo-ou-nada.
  await db.transaction(async (tx) => {
    await applyAiCreditPurchaseTx(tx, checkout.id, `ai-credit:${checkout.id}`);

    await tx
      .update(aiCreditCheckouts)
      .set({
        status: "paid",
        paidAt: now,
        providerCheckoutId: provider.id,
        updatedAt: now,
      })
      .where(and(eq(aiCreditCheckouts.id, checkout.id), eq(aiCreditCheckouts.userId, checkout.user_id)));

    await tx.insert(userInbox).values({
      userId: checkout.user_id,
      kind: "billing",
      title: "Créditos Prisma IA adicionados",
      message: "Pagamento confirmado. Seus créditos já estão disponíveis para análises.",
    });
  });
}

/**
 * Fail-closed: o gate providerPayable (amount/currency/devMode) vive em
 * ./provider-payable e e compartilhado com a reconciliacao de assinaturas.
 */
export async function reconcileAiCreditCheckout(checkout: StoredAiCheckout) {
  if (!checkout.external_id || !["creating", "pending"].includes(checkout.status)) return false;
  const params = new URLSearchParams({ externalId: checkout.external_id, limit: "10" });
  const matches = await abacateRequest<AbacateCheckout[]>(`/checkouts/list?${params.toString()}`);
  const provider = matches.find((item) => item.externalId === checkout.external_id);
  if (!provider) return false;

  if (provider.devMode === true) {
    console.warn("AI credit checkout reconciliation rejected: provider checkout in devMode", { checkoutId: checkout.id });
    return false;
  }

  const status = provider.status.toUpperCase();
  if (status === "PAID") {
    if (!providerPayable(provider, checkout)) {
      console.warn("AI credit checkout reconciliation rejected: provider PAID amount/currency/devMode mismatch", {
        checkoutId: checkout.id,
        providerAmount: provider.amount,
        storedAmountCents: checkout.amount_cents,
        providerCurrency: provider.currency,
      });
      return false;
    }
    await activatePaidAiCreditCheckout(checkout, provider);
    return true;
  }
  if (["EXPIRED", "CANCELLED", "REFUNDED"].includes(status)) {
    const localStatus = status === "REFUNDED" ? "refunded" : status.toLowerCase();
    if (status === "REFUNDED") {
      // Reverte credito de IA quando o provedor estornou a compra. So age se o
      // checkout estiver 'paid' e existir lancamento de compra; se nunca foi
      // pago e um no-op idempotente.
      await revokeAiCreditPurchase(checkout.id);
    }
    await db.update(aiCreditCheckouts).set({
      status: localStatus,
      updatedAt: new Date(),
    }).where(and(eq(aiCreditCheckouts.id, checkout.id), eq(aiCreditCheckouts.userId, checkout.user_id)));
  }
  return false;
}

export async function reconcilePendingAiCreditCheckouts(userId: string) {
  const pending = await db
    .select({
      id: aiCreditCheckouts.id,
      userId: aiCreditCheckouts.userId,
      externalId: aiCreditCheckouts.externalId,
      status: aiCreditCheckouts.status,
      amountCents: aiCreditCheckouts.amountCents,
    })
    .from(aiCreditCheckouts)
    .where(and(eq(aiCreditCheckouts.userId, userId), inArray(aiCreditCheckouts.status, ["creating", "pending"])))
    .orderBy(desc(aiCreditCheckouts.createdAt))
    .limit(5);

  let reconciled = 0;
  for (const checkout of pending) {
    try {
      const stored: StoredAiCheckout = {
        id: checkout.id,
        user_id: checkout.userId,
        external_id: checkout.externalId,
        status: checkout.status,
        amount_cents: checkout.amountCents,
      };
      if (await reconcileAiCreditCheckout(stored)) reconciled += 1;
    } catch (error) {
      console.error("AI credit checkout reconciliation failed", {
        checkoutId: checkout.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }
  return reconciled;
}
