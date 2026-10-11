import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Suporte: ativa/desativa plano no catálogo (afeta novos checkouts). */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-plans:${gate.adminId}`, { max: 30, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ planId?: unknown; isActive?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const planId = String(parsed.body?.planId ?? "");
  if (!uuid.test(planId) || typeof parsed.body?.isActive !== "boolean") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_plans").update({ is_active: parsed.body.isActive, updated_at: new Date().toISOString() }).eq("id", planId).select("slug").single();
  if (error || !data) return NextResponse.json({ error: "plan_toggle_failed" }, { status: 400 });

  await admin.from("admin_audit_log").insert({
    admin_user_id: gate.adminId,
    action: "plan_change",
    target_user_id: null,
    details: { plan_slug: data.slug, is_active: parsed.body.isActive, scope: "catalog" },
  });

  return NextResponse.json({ updated: true }, { headers: { "cache-control": "no-store" } });
}
