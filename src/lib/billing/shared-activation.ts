import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { abacateRequest } from "@/lib/billing/abacatepay/client";

export function nextPeriodEnd(): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

export async function cancelPreviousProviderSubscription(
  previousId: string | null | undefined,
  currentProviderId: string | null | undefined,
): Promise<void> {
  if (previousId && previousId !== currentProviderId) {
    await abacateRequest("/subscriptions/cancel", {
      method: "POST",
      body: JSON.stringify({ id: previousId }),
    });
  }
}

export async function activateSubscription(checkout: {
  id: string;
  user_id: string;
  plan_id: string;
  checkout_type: "pix" | "card_subscription";
}, providerObjectId?: string | null): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const method = checkout.checkout_type === "pix" ? "pix" : "card";

  const subscriptionData: Record<string, unknown> = {
    user_id: checkout.user_id,
    plan_id: checkout.plan_id,
    source_checkout_id: checkout.id,
    billing_method: method,
    status: "active",
    current_period_start: now,
    current_period_end: nextPeriodEnd(),
    cancelled_at: null,
    updated_at: now,
  };
  if (method === "card" && providerObjectId) {
    subscriptionData.provider_subscription_id = providerObjectId;
  }

  const { error } = await admin.from("subscriptions").upsert(subscriptionData, { onConflict: "user_id" });
  if (error) throw new Error(error.message || "subscription_save_failed");
}
