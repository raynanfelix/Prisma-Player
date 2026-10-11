import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions = new Set(["suspend", "reactivate", "trial_extend", "trial_reset"]);

/**
 * Suporte: suspende/reativa assinatura e estende/reseta trial.
 * Suspender não cancela no provedor: a recorrência do cartão continua até
 * ser tratada na AbacatePay (aviso devolvido na resposta).
 */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-status:${gate.adminId}`, { max: 30, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ userId?: unknown; action?: unknown; days?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const userId = String(parsed.body?.userId ?? "");
  const action = String(parsed.body?.action ?? "");
  if (!uuid.test(userId) || !actions.has(action)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const now = new Date();
  let auditAction = action;
  let result: Record<string, unknown> = { updated: true };

  if (action === "suspend" || action === "reactivate") {
    const { data: sub } = await admin.from("subscriptions").select("status").eq("user_id", userId).maybeSingle();
    if (!sub) return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
    if (action === "suspend") {
      const { error } = await admin.from("subscriptions").update({ status: "suspended", updated_at: now.toISOString() }).eq("user_id", userId);
      if (error) return NextResponse.json({ error: "status_change_failed" }, { status: 500 });
      auditAction = "subscription_suspend";
      result = { updated: true, warning: "Assinatura suspensa só na Prisma. Trate a recorrência na AbacatePay." };
    } else {
      const { error } = await admin.from("subscriptions").update({
        status: "active", cancelled_at: null,
        current_period_start: now.toISOString(),
        current_period_end: new Date(now.getTime() + 30 * 86400000).toISOString(),
        updated_at: now.toISOString(),
      }).eq("user_id", userId);
      if (error) return NextResponse.json({ error: "status_change_failed" }, { status: 500 });
      auditAction = "subscription_reactivate";
    }
  } else {
    const days = Math.trunc(Number(parsed.body?.days ?? 0));
    const { data: access } = await admin.from("account_access").select("trial_status,trial_ends_at").eq("user_id", userId).maybeSingle();
    if (!access) return NextResponse.json({ error: "access_not_found" }, { status: 404 });
    if (action === "trial_extend") {
      if (!Number.isInteger(days) || days < 1 || days > 60) return NextResponse.json({ error: "invalid_days" }, { status: 400 });
      const base = Math.max(now.getTime(), access.trial_ends_at ? new Date(access.trial_ends_at).getTime() : 0);
      const endsAt = new Date(base + days * 86400000).toISOString();
      const { error } = await admin.from("account_access").update({ trial_status: "active", trial_ends_at: endsAt, updated_at: now.toISOString() }).eq("user_id", userId);
      if (error) return NextResponse.json({ error: "trial_change_failed" }, { status: 500 });
      auditAction = "trial_extend";
      result = { updated: true, trial_ends_at: endsAt };
    } else {
      const { error } = await admin.from("account_access").update({ trial_status: "available", trial_started_at: null, trial_ends_at: null, updated_at: now.toISOString() }).eq("user_id", userId);
      if (error) return NextResponse.json({ error: "trial_change_failed" }, { status: 500 });
      auditAction = "trial_reset";
    }
  }

  await admin.from("admin_audit_log").insert({
    admin_user_id: gate.adminId,
    action: auditAction,
    target_user_id: userId,
    details: action === "trial_extend" ? { days: Math.trunc(Number(parsed.body?.days ?? 0)) } : {},
  });

  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
