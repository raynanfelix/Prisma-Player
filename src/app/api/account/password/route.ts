import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { rateLimit } from "@/lib/security/rate-limit";
import { csrfGuard } from "@/lib/security/csrf";

/**
 * Verifies the current password on a throwaway client so a stolen session alone
 * cannot change the password and lock the real owner out. Using a client with
 * `persistSession: false` keeps this check from rotating the caller's cookies.
 */
async function currentPasswordMatches(email: string, password: string) {
  const verifier = createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  return !error;
}

export async function PATCH(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-password:${userId}`, { max: 5, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const parsed = await readJsonBody<{ password?: unknown; currentPassword?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const password = typeof body?.password === "string" ? body.password : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return NextResponse.json({ error: "weak_password" }, { status: 400 });
  if (!currentPassword) return NextResponse.json({ error: "current_password_required" }, { status: 400 });

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData?.user?.email;
  if (userError || !email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await currentPasswordMatches(email, currentPassword))) {
    await supabase.from("security_events").insert({ user_id: userId, event_type: "password_change_denied" });
    return NextResponse.json({ error: "invalid_current_password" }, { status: 403 });
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: "password_update_failed" }, { status: 400 });
  await supabase.from("security_events").insert({ user_id: userId, event_type: "password_changed" });
  return NextResponse.json({ ok: true });
}
