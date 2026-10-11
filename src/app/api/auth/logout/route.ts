import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csrfGuard } from "@/lib/security/csrf";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
