import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { createClient } from "@/lib/supabase/server";
import { getAuthErrorMessage } from "@/lib/supabase/auth-errors";
import { csrfGuard } from "@/lib/security/csrf";
import { recordAuthFailure } from "@/lib/security/auth-events";
import { hashRateLimitIdentifier, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const limited = await rateLimit(request, "auth-signup", { max: 5, windowMs: 15 * 60_000, failClosed: true });
  if (limited) return limited;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const parsed = await readJsonBody<{ name?: unknown; email?: unknown; password?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || !email || !password) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const accountLimited = await rateLimit(request, "auth-signup-account", {
    max: 3, windowMs: 60 * 60_000, failClosed: true, identifier: hashRateLimitIdentifier(email),
  });
  if (accountLimited) return accountLimited;

  const supabase = await createClient();
  const result = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${siteUrl}/auth/callback?next=/welcome`,
    },
  });
  if (result.error) {
    await recordAuthFailure("signup_failed", email, request);
    const message = getAuthErrorMessage(result.error, "Não foi possível criar a conta. Tente novamente.");
    return NextResponse.json({ error: "signup_failed", message }, { status: 400 });
  }
  return NextResponse.json({ data: result.data, hasSession: Boolean(result.data.session) });
}
