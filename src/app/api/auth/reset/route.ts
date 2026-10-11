import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { createClient } from "@/lib/supabase/server";
import { getAuthErrorMessage } from "@/lib/supabase/auth-errors";
import { csrfGuard } from "@/lib/security/csrf";
import { hashRateLimitIdentifier, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const limited = await rateLimit(request, "auth-reset", { max: 3, windowMs: 15 * 60_000, failClosed: true });
  if (limited) return limited;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const parsed = await readJsonBody<{ email?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
  const accountLimited = await rateLimit(request, "auth-reset-account", {
    max: 3, windowMs: 60 * 60_000, failClosed: true, identifier: hashRateLimitIdentifier(email),
  });
  if (accountLimited) return accountLimited;

  const supabase = await createClient();
  const result = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  if (result.error) {
    const message = getAuthErrorMessage(result.error, "Não foi possível enviar o e-mail.");
    return NextResponse.json({ error: "reset_failed", message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
