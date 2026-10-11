import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { createClient } from "@/lib/supabase/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const limited = await rateLimit(request, "auth-update-password", { max: 5, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ password?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: "password_update_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
