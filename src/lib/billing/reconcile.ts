import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { abacateRequest } from "./abacatepay/client";
import type { AbacateCheckout } from "./abacatepay/types";
import { providerPayable } from "./provider-payable";
import { activateSubscription, cancelPreviousProviderSubscription } from "./shared-activation";

type StoredCheckout = {
  id: string;
  user_id: string;
  plan_id: string;
  checkout_type: "pix" | "card_subscription";
  external_id: string;
  status: string;
  amount_cents: number;
  previous_provider_subscription_id?: string | null;
};

export async function activatePaidCheckout(checkout: StoredCheckout, provider: AbacateCheckout) {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error: checkoutError } = await admin.from("billing_checkouts").update({
    status: "paid",
    paid_at: now,
    provider_checkout_id: provider.id,
    receipt_url: provider.receiptUrl ?? null,
    updated_at: now,
  }).eq("id", checkout.id).eq("user_id", checkout.user_id);
  if (checkoutError) throw new Error("billing_checkout_payment_save_failed");

  await cancelPreviousProviderSubscription(
    checkout.previous_provider_subscription_id,
    provider.id,
  );
  if (checkout.previous_provider_subscription_id && checkout.previous_provider_subscription_id !== provider.id) {
    await admin.from("billing_checkouts").update({ previous_provider_subscription_id: null, updated_at: now }).eq("id", checkout.id);
  }

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
    const admin = createAdminClient();
    await admin.from("billing_checkouts").update({ status: localStatus, updated_at: new Date().toISOString() }).eq("id", checkout.id).eq("user_id", checkout.user_id);
  }
  return false;
}