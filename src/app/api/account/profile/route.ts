import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id,email,full_name,phone,avatar_url,locale,email_notifications,security_notifications,created_at").eq("id", userId).single();
  if (error) return NextResponse.json({ error: "profile_load_failed" }, { status: 500 });
  return NextResponse.json({ profile: data });
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
  const update = {
    full_name: typeof body.fullName === "string" ? body.fullName.trim().slice(0, 160) : undefined,
    phone: typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : undefined,
    locale: ["pt-BR", "es", "en"].includes(String(body.locale)) ? body.locale : undefined,
    email_notifications: typeof body.emailNotifications === "boolean" ? body.emailNotifications : undefined,
    security_notifications: typeof body.securityNotifications === "boolean" ? body.securityNotifications : undefined,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update(update).eq("id", userId).select().single();
  if (error) return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  return NextResponse.json({ profile: data });
}
