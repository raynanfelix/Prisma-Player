import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUserId } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-trial:${userId}`, { max: 5, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const parsed = await readJsonBody<{ action?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = body?.action;
  if (action !== "activate" && action !== "later") return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  const admin = createAdminClient();
  const now = new Date();
  const update = action === "activate" ? {
    onboarding_completed: true,
    trial_status: "active",
    trial_started_at: now.toISOString(),
    trial_ends_at: new Date(now.getTime() + 14 * 86400000).toISOString(),
    updated_at: now.toISOString(),
  } : { onboarding_completed: true, updated_at: now.toISOString() };
  let query = admin.from("account_access").update(update).eq("user_id", userId);
  if (action === "activate") query = query.eq("trial_status", "available");
  const { data, error } = await query.select("trial_status,trial_ends_at").maybeSingle();
  if (error) return NextResponse.json({ error: "trial_update_failed" }, { status: 500 });
  if (action === "activate" && !data) return NextResponse.json({ error: "trial_unavailable" }, { status: 409 });
  if (action === "activate") {
    await admin.from("user_inbox").update({ read_at: now.toISOString() }).eq("user_id", userId).eq("kind", "welcome").is("read_at", null);
    await admin.from("user_inbox").insert({ user_id: userId, kind: "trial", title: "Teste gratuito ativado", message: "Voce tem acesso completo por 14 dias. Aproveite para publicar, medir e otimizar suas VSLs." });
  }
  return NextResponse.json({ ok: true, ...data });
}
