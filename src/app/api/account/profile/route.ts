import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUserId } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { profiles } = schema;

function toProfileView(row: typeof profiles.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.fullName,
    phone: row.phone,
    avatar_url: row.avatarUrl,
    locale: row.locale,
    email_notifications: row.emailNotifications,
    security_notifications: row.securityNotifications,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!row) return NextResponse.json({ error: "profile_load_failed" }, { status: 500 });
  return NextResponse.json({ profile: toProfileView(row) });
}

export async function PATCH(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-profile:${userId}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body || Object.keys(body).length === 0) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const patch: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.fullName === "string") patch.fullName = body.fullName.trim().slice(0, 160);
  if (typeof body.phone === "string") patch.phone = body.phone.trim().slice(0, 40);
  if (["pt-BR", "es", "en"].includes(String(body.locale))) patch.locale = String(body.locale);
  if (typeof body.emailNotifications === "boolean") patch.emailNotifications = body.emailNotifications;
  if (typeof body.securityNotifications === "boolean") patch.securityNotifications = body.securityNotifications;

  const [row] = await db.update(profiles).set(patch).where(eq(profiles.id, userId)).returning();
  if (!row) return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  return NextResponse.json({ profile: toProfileView(row) });
}
