import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { accountAccess, adminAuditLog, profiles, subscriptions } = schema;

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

  const parsed = await readJsonBody<{ userId?: unknown; action?: unknown; days?: unknown; reason?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const userId = String(parsed.body?.userId ?? "");
  const action = String(parsed.body?.action ?? "");
  const reason = String(parsed.body?.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 280);
  if (!uuid.test(userId) || !actions.has(action) || !reason) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const now = new Date();
  let auditAction = action;
  let result: Record<string, unknown> = { updated: true };

  if (action === "suspend" || action === "reactivate") {
    const [sub] = await db.select({ status: subscriptions.status }).from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    if (!sub) return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
    if (action === "suspend") {
      await db.update(subscriptions).set({ status: "suspended", updatedAt: now }).where(eq(subscriptions.userId, userId));
      auditAction = "subscription_suspend";
      result = { updated: true, warning: "Assinatura suspensa só na Prisma. Trate a recorrência na AbacatePay." };
    } else {
      await db.update(subscriptions).set({
        status: "active",
        cancelledAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
        updatedAt: now,
      }).where(eq(subscriptions.userId, userId));
      auditAction = "subscription_reactivate";
    }
  } else {
    const days = Math.trunc(Number(parsed.body?.days ?? 0));
    const [access] = await db.select({ trialStatus: accountAccess.trialStatus, trialEndsAt: accountAccess.trialEndsAt })
      .from(accountAccess).where(eq(accountAccess.userId, userId)).limit(1);
    if (!access) return NextResponse.json({ error: "access_not_found" }, { status: 404 });
    if (action === "trial_extend") {
      if (!Number.isInteger(days) || days < 1 || days > 60) return NextResponse.json({ error: "invalid_days" }, { status: 400 });
      const base = Math.max(now.getTime(), access.trialEndsAt ? access.trialEndsAt.getTime() : 0);
      const endsAt = new Date(base + days * 86400000);
      await db.update(accountAccess).set({ trialStatus: "active", trialEndsAt: endsAt, updatedAt: now }).where(eq(accountAccess.userId, userId));
      auditAction = "trial_extend";
      result = { updated: true, trial_ends_at: endsAt.toISOString() };
    } else {
      await db.update(accountAccess).set({ trialStatus: "available", trialStartedAt: null, trialEndsAt: null, updatedAt: now }).where(eq(accountAccess.userId, userId));
      auditAction = "trial_reset";
    }
  }

  await db.insert(adminAuditLog).values({
    adminUserId: gate.adminId,
    action: auditAction,
    targetUserId: userId,
    details: action === "trial_extend" ? { days: Math.trunc(Number(parsed.body?.days ?? 0)), reason } : { reason },
  });

  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
