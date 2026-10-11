import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { abacateRequest } from "@/lib/billing/abacatepay/client";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

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
  const admin = createAdminClient();
  const result = await admin.from("subscriptions").select("id,billing_method,provider_subscription_id,status").eq("user_id", userId).single();
  if (result.error || !result.data) return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
  if (result.data.billing_method !== "card" || !result.data.provider_subscription_id) return NextResponse.json({ error: "pix_does_not_auto_renew" }, { status: 409 });
  if (result.data.status !== "active") return NextResponse.json({ error: "subscription_not_active" }, { status: 409 });
  try {
    await abacateRequest("/subscriptions/cancel", { method: "POST", body: JSON.stringify({ id: result.data.provider_subscription_id }) });
    const now = new Date().toISOString();
    await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", result.data.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("AbacatePay cancellation failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "cancellation_failed" }, { status: 502 });
  }
}
