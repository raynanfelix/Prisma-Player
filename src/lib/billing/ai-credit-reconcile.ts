import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { abacateRequest } from "./abacatepay/client";
import { providerPayable } from "./provider-payable";
import type { AbacateCheckout } from "./abacatepay/types";

type StoredAiCheckout = {
  id: string;
  user_id: string;
  external_id: string;
  status: string;
  amount_cents: number;
};

export async function activatePaidAiCreditCheckout(checkout: StoredAiCheckout, provider: Pick<AbacateCheckout, "id">) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const applied = await admin.rpc("apply_ai_credit_purchase", {
    p_checkout_id: checkout.id,
    p_provider_event_id: `ai-credit:${checkout.id}`,
  });
  if (applied.error) throw new Error(`credit_wallet_update_failed:${applied.error.code ?? "unknown"}`);

  const saved = await admin.from("ai_credit_checkouts").update({
    status: "paid",
    paid_at: now,
    provider_checkout_id: provider.id,
    updated_at: now,
  }).eq("id", checkout.id).eq("user_id", checkout.user_id);
  if (saved.error) throw new Error("credit_checkout_payment_save_failed");

  await admin.from("user_inbox").insert({
    user_id: checkout.user_id,
    kind: "billing",
    title: "Créditos Prisma IA adicionados",
    message: "Pagamento confirmado. Seus créditos já estão disponíveis para análises.",
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
    const admin = createAdminClient();
    if (status === "REFUNDED") {
      // Reverte credito de IA quando o provedor estornou a compra. O RPC so age
      // se o checkout estiver 'paid' e existir lancamento de compra; se nunca
      // foi pago e um no-op idempotente.
      const revoked = await admin.rpc("revoke_ai_credit_purchase", { p_checkout_id: checkout.id });
      if (revoked.error) throw new Error(`credit_revoke_failed:${revoked.error.code ?? "unknown"}`);
    }
    await admin.from("ai_credit_checkouts").update({
      status: localStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", checkout.id).eq("user_id", checkout.user_id);
  }
  return false;
}

export async function reconcilePendingAiCreditCheckouts(userId: string) {
  const admin = createAdminClient();
  const pending = await admin.from("ai_credit_checkouts")
    .select("id,user_id,external_id,status,amount_cents")
    .eq("user_id", userId)
    .in("status", ["creating", "pending"])
    .order("created_at", { ascending: false })
    .limit(5);
  if (pending.error) throw new Error("pending_credit_checkouts_lookup_failed");

  let reconciled = 0;
  for (const checkout of pending.data ?? []) {
    try {
      if (await reconcileAiCreditCheckout(checkout)) reconciled += 1;
    } catch (error) {
      console.error("AI credit checkout reconciliation failed", {
        checkoutId: checkout.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }
  return reconciled;
}