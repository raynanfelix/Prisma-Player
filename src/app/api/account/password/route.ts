import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUserId, getAuth } from "@/lib/auth/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { csrfGuard } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/auth-events";

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

  // changePassword valida a senha atual no Managed Better Auth e, com
  // revokeOtherSessions, troca para uma nova sessão preservando a atual.
  const { error } = await getAuth().changePassword({ currentPassword, newPassword: password, revokeOtherSessions: true });
  if (error) {
    if (String(error.code ?? "").toUpperCase() === "INVALID_PASSWORD") {
      await recordSecurityEvent("password_change_denied", { userId });
      return NextResponse.json({ error: "invalid_current_password" }, { status: 403 });
    }
    return NextResponse.json({ error: "password_update_failed" }, { status: 400 });
  }
  await recordSecurityEvent("password_changed", { userId });
  return NextResponse.json({ ok: true });
}
