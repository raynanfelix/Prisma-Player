import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth/server";
import { reconcileBillingCheckout } from "@/lib/billing/reconcile";
import type { StoredCheckout } from "@/lib/billing/reconcile";
import { csrfGuard } from "@/lib/security/csrf";
import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";

const { billingCheckouts, billingPlans, subscriptions } = schema;

const CHECKOUT_COLUMNS = {
  id: billingCheckouts.id,
  userId: billingCheckouts.userId,
  planId: billingCheckouts.planId,
  externalId: billingCheckouts.externalId,
  status: billingCheckouts.status,
  checkoutType: billingCheckouts.checkoutType,
  paidAt: billingCheckouts.paidAt,
  receiptUrl: billingCheckouts.receiptUrl,
  amountCents: billingCheckouts.amountCents,
  previousProviderSubscriptionId: billingCheckouts.previousProviderSubscriptionId,
  planName: billingPlans.name,
  planSlug: billingPlans.slug,
};

type CheckoutPlanView = { name: string; slug: string };

type CheckoutView = {
  id: string;
  user_id: string;
  plan_id: string;
  external_id: string;
  status: string;
  checkout_type: string;
  paid_at: string | null;
  receipt_url: string | null;
  amount_cents: number;
  previous_provider_subscription_id: string | null;
  plan: CheckoutPlanView;
};

type SubscriptionView = {
  status: string;
  billing_method: string;
  current_period_end: string | null;
  plan: CheckoutPlanView;
} | null;

async function fetchCheckoutView(checkoutId: string, userId: string): Promise<CheckoutView | null> {
  const [row] = await db
    .select(CHECKOUT_COLUMNS)
    .from(billingCheckouts)
    .innerJoin(billingPlans, eq(billingPlans.id, billingCheckouts.planId))
    .where(and(eq(billingCheckouts.id, checkoutId), eq(billingCheckouts.userId, userId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.userId,
    plan_id: row.planId,
    external_id: row.externalId,
    status: row.status,
    checkout_type: row.checkoutType,
    paid_at: isoOrNull(row.paidAt),
    receipt_url: row.receiptUrl,
    amount_cents: row.amountCents,
    previous_provider_subscription_id: row.previousProviderSubscriptionId,
    plan: { name: row.planName, slug: row.planSlug },
  };
}

async function fetchSubscriptionView(userId: string): Promise<SubscriptionView> {
  const [row] = await db
    .select({
      status: subscriptions.status,
      billingMethod: subscriptions.billingMethod,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planName: billingPlans.name,
      planSlug: billingPlans.slug,
    })
    .from(subscriptions)
    .innerJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    status: row.status,
    billing_method: row.billingMethod,
    current_period_end: isoOrNull(row.currentPeriodEnd),
    plan: { name: row.planName, slug: row.planSlug },
  };
}

function asStoredCheckout(view: CheckoutView): StoredCheckout {
  return {
    id: view.id,
    user_id: view.user_id,
    plan_id: view.plan_id,
    checkout_type: view.checkout_type === "pix" ? "pix" : "card_subscription",
    external_id: view.external_id,
    status: view.status,
    amount_cents: view.amount_cents,
    previous_provider_subscription_id: view.previous_provider_subscription_id,
  };
}

export async function GET(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const checkoutId = new URL(request.url).searchParams.get("checkout");
  if (!checkoutId) return NextResponse.json({ error: "checkout_required" }, { status: 400 });

  let checkout = await fetchCheckoutView(checkoutId, userId);
  let subscription = await fetchSubscriptionView(userId);
  if (!checkout) return NextResponse.json({ error: "checkout_not_found" }, { status: 404 });
  if (["pending", "creating"].includes(checkout.status)) {
    try {
      const activated = await reconcileBillingCheckout(asStoredCheckout(checkout));
      if (activated) {
        checkout = await fetchCheckoutView(checkoutId, userId);
        subscription = await fetchSubscriptionView(userId);
      }
    } catch (error) {
      console.error("Billing checkout reconciliation failed", error instanceof Error ? error.message : "unknown_error");
    }
  }
  return NextResponse.json({ checkout, subscription }, { headers: { "cache-control": "no-store" } });
}
