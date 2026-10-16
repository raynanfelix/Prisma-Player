import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth/server";
import { abacateRequest } from "@/lib/billing/abacatepay/client";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { db, schema } from "@/lib/db";

const { subscriptions } = schema;

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Limita chamadas simultâneas/consecutivas que poderiam atingir o gateway.
  // fail-open aqui: preferimos deixar o usuario cancelar a cancelar por falha do
  // contador, ao contrario dos endpoints de checkout (que criam custo novo).
  const cancelLimit = await rateLimit(request, `billing-cancel:${userId}`, { max: 3, windowMs: 60_000 });
  if (cancelLimit) return cancelLimit;

  const [subscription] = await db
    .select({
      id: subscriptions.id,
      billingMethod: subscriptions.billingMethod,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  if (!subscription) return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
  if (subscription.billingMethod !== "card" || !subscription.providerSubscriptionId) return NextResponse.json({ error: "pix_does_not_auto_renew" }, { status: 409 });
  if (subscription.status !== "active") return NextResponse.json({ error: "subscription_not_active" }, { status: 409 });
  try {
    await abacateRequest("/subscriptions/cancel", { method: "POST", body: JSON.stringify({ id: subscription.providerSubscriptionId }) });
    const now = new Date();
    await db.update(subscriptions).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(eq(subscriptions.id, subscription.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("AbacatePay cancellation failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "cancellation_failed" }, { status: 502 });
  }
}
