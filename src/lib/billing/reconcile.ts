import "server-only";

import { and, eq } from "drizzle-orm";

import { abacateRequest } from "./abacatepay/client";
import type { AbacateCheckout } from "./abacatepay/types";
import { providerPayable } from "./provider-payable";
import { activateSubscription, cancelPreviousProviderSubscription } from "./shared-activation";
import { db, schema } from "@/lib/db";

const { billingCheckouts } = schema;

export type StoredCheckout = {
  id: string;
  user_id: string;
  plan_id: string;
  checkout_type: "pix" | "card_subscription";
  external_id: string;
  status: string;
  amount_cents: number;
  previous_provider_subscription_id?: string | null;
};

async function activatePaidCheckout(checkout: StoredCheckout, provider: AbacateCheckout) {
  const now = new Date();

  // A referência da assinatura anterior só é apagada DEPOIS do cancelamento no
  // provedor: se o cancelamento falhar, a próxima tentativa ainda sabe o que
  // cancelar. Falhar antes perderia a referência e deixaria cobrança dupla.
  await cancelPreviousProviderSubscription(
    checkout.previous_provider_subscription_id,
    provider.id,
  );

  await db.update(billingCheckouts).set({
    status: "paid",
    paidAt: now,
    providerCheckoutId: provider.id,
    receiptUrl: provider.receiptUrl ?? null,
    previousProviderSubscriptionId: null,
    updatedAt: now,
  }).where(and(eq(billingCheckouts.id, checkout.id), eq(billingCheckouts.userId, checkout.user_id)));

  await activateSubscription(checkout, provider.id);
}

export async function reconcileBillingCheckout(checkout: StoredCheckout) {
  if (checkout.status !== "pending" && checkout.status !== "creating") return false;
  const path = checkout.checkout_type === "pix" ? "/checkouts/list" : "/subscriptions/list";
  const params = new URLSearchParams({ externalId: checkout.external_id, limit: "1" });
  const matches = await abacateRequest<AbacateCheckout[]>(`${path}?${params.toString()}`);
  const provider = matches.find((item) => item.externalId === checkout.external_id);
  if (!provider) return false;

  if (provider.devMode === true) {
    console.warn("Billing checkout reconciliation rejected: provider checkout in devMode", { checkoutId: checkout.id });
    return false;
  }

  const status = provider.status.toUpperCase();
  if (status === "PAID") {
    if (!providerPayable(provider, checkout)) {
      console.warn("Billing checkout reconciliation rejected: provider PAID amount/currency/devMode mismatch", {
        checkoutId: checkout.id,
        providerAmount: provider.amount,
        storedAmountCents: checkout.amount_cents,
        providerCurrency: provider.currency,
      });
      return false;
    }
    await activatePaidCheckout(checkout, provider);
    return true;
  }
  if (["EXPIRED", "CANCELLED", "REFUNDED"].includes(status)) {
    const localStatus = status === "REFUNDED" ? "refunded" : status.toLowerCase();
    await db.update(billingCheckouts).set({
      status: localStatus,
      updatedAt: new Date(),
    }).where(and(eq(billingCheckouts.id, checkout.id), eq(billingCheckouts.userId, checkout.user_id)));
  }
  return false;
}
