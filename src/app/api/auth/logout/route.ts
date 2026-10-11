import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  // Anti-spam de logs; fail-open de propósito: nunca travar a saída.
  const limited = await rateLimit(request, "auth-logout", { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
