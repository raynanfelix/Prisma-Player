import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { adminAuditLog, billingPlans } = schema;

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

  const [updated] = await db.update(billingPlans)
    .set({ isActive: parsed.body.isActive, updatedAt: new Date() })
    .where(eq(billingPlans.id, planId))
    .returning({ slug: billingPlans.slug });
  if (!updated) return NextResponse.json({ error: "plan_toggle_failed" }, { status: 400 });

  await db.insert(adminAuditLog).values({
    adminUserId: gate.adminId,
    action: "plan_change",
    targetUserId: null,
    details: { plan_slug: updated.slug, is_active: parsed.body.isActive, scope: "catalog" },
  });

  return NextResponse.json({ updated: true }, { headers: { "cache-control": "no-store" } });
}
