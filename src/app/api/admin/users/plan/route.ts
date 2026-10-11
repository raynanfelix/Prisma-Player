import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Suporte: troca o plano da conta manualmente. NÃO altera nada no provedor
 * (AbacatePay): a cobrança recorrente continua a que está lá. A resposta
 * inclui o aviso para o operador não esquecer a conciliação.
 */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-plan:${gate.adminId}`, { max: 30, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ userId?: unknown; planSlug?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const userId = String(parsed.body?.userId ?? "");
  const planSlug = String(parsed.body?.planSlug ?? "").trim().toLowerCase().slice(0, 80);
  if (!uuid.test(userId) || !planSlug) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const admin = createAdminClient();
  const [profile, plan, current] = await Promise.all([
    admin.from("profiles").select("id").eq("id", userId).maybeSingle(),
    admin.from("billing_plans").select("id,slug,name").eq("slug", planSlug).eq("is_active", true).maybeSingle(),
    admin.from("subscriptions").select("status,billing_method").eq("user_id", userId).maybeSingle(),
  ]);
  if (!profile.data) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (!plan.data) return NextResponse.json({ error: "plan_not_found" }, { status: 404 });

  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    plan_id: plan.data.id,
    status: "active",
    billing_method: current.data?.billing_method ?? "pix",
    current_period_start: now,
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
    cancelled_at: null,
    updated_at: now,
  };
  const saved = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" }).select("status,current_period_end").single();
  if (saved.error) return NextResponse.json({ error: "plan_change_failed" }, { status: 500 });

  await admin.from("admin_audit_log").insert({
    admin_user_id: gate.adminId,
    action: "plan_change",
    target_user_id: userId,
    details: { plan_slug: plan.data.slug, previous_status: current.data?.status ?? null, provider_warning: "cobranca no provedor nao alterada" },
  });

  return NextResponse.json({
    updated: true,
    plan: plan.data.slug,
    warning: "Plano trocado só na Prisma. Concilie a cobrança na AbacatePay.",
  }, { headers: { "cache-control": "no-store" } });
}
