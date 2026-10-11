import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBillingCheckout } from "@/lib/billing/service";
import type { BillingPlan } from "@/lib/billing/catalog";
import { AbacatePayError } from "@/lib/billing/abacatepay/client";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Custo real em chamadas à AbacatePay por checkout criado: fail-closed protege
  // contra spam de criação mesmo quando o contador de rate limit fica indisponível.
  const checkoutLimit = await rateLimit(request, `billing-checkout:${userId}`, { max: 5, windowMs: 60_000, failClosed: true });
  if (checkoutLimit) return checkoutLimit;

  const parsed = await readJsonBody<{ plan?: unknown; method?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const slug = typeof body?.plan === "string" ? body.plan : "";
  const method = body?.method === "pix" || body?.method === "card" ? body.method : null;
  if (!slug || !method) return NextResponse.json({ error: "invalid_checkout" }, { status: 400 });

  const admin = createAdminClient();
  const planResult = await admin.from("billing_plans").select("*").eq("slug", slug).eq("is_active", true).single();
  if (planResult.error || !planResult.data) return NextResponse.json({ error: "plan_not_found" }, { status: 404 });

  try {
    const checkout = await createBillingCheckout(userId, planResult.data as BillingPlan, method === "pix" ? "pix" : "card_subscription");
    return NextResponse.json(checkout, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    if (detail === "plan_already_active") return NextResponse.json({ error: detail, message: "Este já é o seu plano atual." }, { status: 409 });
    console.error("AbacatePay checkout failed", error instanceof AbacatePayError ? { endpoint: error.endpoint, status: error.status, detail } : { detail });
    const message = error instanceof AbacatePayError && (error.status === 401 || error.status === 403)
      ? "A chave da AbacatePay nao tem permissao suficiente. Ative CHECKOUT:CREATE, PRODUCT:READ, PRODUCT:CREATE e a permissao de criar assinaturas."
      : "A AbacatePay recusou a criacao do checkout. Confira a chave, as permissoes e tente novamente.";
    return NextResponse.json({ error: "checkout_provider_failed", message }, { status: 502 });
  }
}
