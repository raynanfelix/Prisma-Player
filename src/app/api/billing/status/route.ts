import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileBillingCheckout } from "@/lib/billing/reconcile";
import { csrfGuard } from "@/lib/security/csrf";

export async function GET(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const checkoutId = new URL(request.url).searchParams.get("checkout");
  if (!checkoutId) return NextResponse.json({ error: "checkout_required" }, { status: 400 });

  const admin = createAdminClient();
  let [{ data: checkout }, { data: subscription }] = await Promise.all([
    admin.from("billing_checkouts").select("id,user_id,plan_id,external_id,status,checkout_type,paid_at,receipt_url,amount_cents,previous_provider_subscription_id,plan:billing_plans(name,slug)").eq("id", checkoutId).eq("user_id", userId).maybeSingle(),
    admin.from("subscriptions").select("status,billing_method,current_period_end,plan:billing_plans(name,slug)").eq("user_id", userId).maybeSingle(),
  ]);
  if (!checkout) return NextResponse.json({ error: "checkout_not_found" }, { status: 404 });
  if (["pending", "creating"].includes(checkout.status)) {
    try {
      const activated = await reconcileBillingCheckout(checkout);
      if (activated) {
        const refreshed = await Promise.all([
          admin.from("billing_checkouts").select("id,user_id,plan_id,external_id,status,checkout_type,paid_at,receipt_url,amount_cents,previous_provider_subscription_id,plan:billing_plans(name,slug)").eq("id", checkoutId).eq("user_id", userId).single(),
          admin.from("subscriptions").select("status,billing_method,current_period_end,plan:billing_plans(name,slug)").eq("user_id", userId).maybeSingle(),
        ]);
        checkout = refreshed[0].data;
        subscription = refreshed[1].data;
      }
    } catch (error) {
      console.error("Billing checkout reconciliation failed", error instanceof Error ? error.message : "unknown_error");
    }
  }
  return NextResponse.json({ checkout, subscription }, { headers: { "cache-control": "no-store" } });
}
