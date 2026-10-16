import { NextResponse } from "next/server";
import { getCurrentUserId, getAuth } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `auth-revoke-all:${userId}`, { max: 5, windowMs: 60 * 60_000, failClosed: true });
  if (limited) return limited;

  // revokeSessions encerra TODAS as sessões do usuário no Managed Better Auth
  // (signOut global), inclusive a atual.
  const { error } = await getAuth().revokeSessions();
  if (error) return NextResponse.json({ error: "revoke_failed" }, { status: 400 });

  // Limpa o cookie da sessão atual (as linhas já foram removidas upstream).
  await getAuth().signOut().catch(() => undefined);
  return NextResponse.json({ ok: true, revoked: true });
}
