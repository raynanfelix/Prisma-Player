import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { adminAuditLog, billingPlans, profiles, subscriptions } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Suporte: troca o plano da conta manualmente. NÃO altera nada no provedor
 * (Stripe): a cobrança recorrente continua a que está lá. A resposta
 * inclui o aviso para o operador não esquecer a conciliação.
 */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-plan:${gate.adminId}`, { max: 30, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ userId?: unknown; planSlug?: unknown; reason?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const userId = String(parsed.body?.userId ?? "");
  const planSlug = String(parsed.body?.planSlug ?? "").trim().toLowerCase().slice(0, 80);
  const reason = String(parsed.body?.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 280);
  if (!uuid.test(userId) || !planSlug || !reason) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const [profileRow, planRow, currentRow] = await Promise.all([
    db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)).limit(1),
    db.select({ id: billingPlans.id, slug: billingPlans.slug, name: billingPlans.name }).from(billingPlans).where(and(eq(billingPlans.slug, planSlug), eq(billingPlans.isActive, true))).limit(1),
    db.select({ status: subscriptions.status, billingMethod: subscriptions.billingMethod }).from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1),
  ]);
  if (!profileRow[0]) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (!planRow[0]) return NextResponse.json({ error: "plan_not_found" }, { status: 404 });

  const now = new Date();
  const periodEnd = new Date(Date.now() + 30 * 86400000);
  const values = {
    userId,
    planId: planRow[0].id,
    status: "active" as const,
    billingMethod: currentRow[0]?.billingMethod ?? "pix",
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelledAt: null,
    updatedAt: now,
  };
  try {
    // Upsert por titular: sem linha cria a assinatura; com linha troca o plano
    // sem tocar provider_subscription_id/source_checkout_id do provedor.
    await db.insert(subscriptions).values(values).onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planId: values.planId,
        status: values.status,
        billingMethod: values.billingMethod,
        currentPeriodStart: values.currentPeriodStart,
        currentPeriodEnd: values.currentPeriodEnd,
        cancelledAt: values.cancelledAt,
        updatedAt: values.updatedAt,
      },
    });
  } catch {
    return NextResponse.json({ error: "plan_change_failed" }, { status: 500 });
  }

  await db.insert(adminAuditLog).values({
    adminUserId: gate.adminId,
    action: "plan_change",
    targetUserId: userId,
    details: { plan_slug: planRow[0].slug, previous_status: currentRow[0]?.status ?? null, reason, provider_warning: "cobranca no provedor nao alterada" },
  });

  return NextResponse.json({
    updated: true,
    plan: planRow[0].slug,
    warning: "Plano trocado só na Prisma. Concilie a cobrança no Stripe.",
  }, { headers: { "cache-control": "no-store" } });
}
