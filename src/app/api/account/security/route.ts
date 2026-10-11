import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getAuthAssuranceLevel } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const [{ data: factors }, { data: events }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.from("security_events").select("id,event_type,metadata,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ factors: factors?.all ?? [], events: events ?? [] });
}

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `account-security:${userId}`, { max: 10, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ action?: unknown; factorId?: unknown; challengeId?: unknown; code?: unknown; friendlyName?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = typeof body?.action === "string" ? body.action : "";
  const supabase = await createClient();

  if (action === "enroll") {
    const existing = await supabase.auth.mfa.listFactors();
    if (existing.error) return NextResponse.json({ error: "mfa_list_failed" }, { status: 500 });
    if (existing.data.all.some((factor) => factor.status === "verified")) {
      return NextResponse.json({ error: "mfa_already_active" });
    }
    const stale = existing.data.all.filter((factor) => factor.status === "unverified" && factor.friendly_name === "Prisma Player");
    await Promise.all(stale.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })));
    const result = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: typeof body.friendlyName === "string" ? body.friendlyName : "Prisma Player" });
    if (result.error) return NextResponse.json({ error: "mfa_enroll_failed" }, { status: 400 });
    return NextResponse.json({ factorId: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret });
  }

  if (action === "challenge") {
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    if (!factorId) return NextResponse.json({ error: "factor_id_required" }, { status: 400 });
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) return NextResponse.json({ error: "challenge_failed" }, { status: 400 });
    return NextResponse.json({ challengeId: challenge.data.id });
  }

  if (action === "verify") {
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!factorId || !challengeId || code.length !== 6) return NextResponse.json({ error: "invalid_verify_payload" }, { status: 400 });
    const result = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    if (result.error) return NextResponse.json({ error: "verify_failed" }, { status: 400 });
    await supabase.auth.refreshSession().catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if (action === "unenroll") {
    const factorId = typeof body.factorId === "string" ? body.factorId : "";
    if (!factorId) return NextResponse.json({ error: "factor_id_required" }, { status: 400 });
    const aal = await getAuthAssuranceLevel();
    if (aal !== "aal2") {
      return NextResponse.json({ error: "aal2_required" }, { status: 403 });
    }
    const result = await supabase.auth.mfa.unenroll({ factorId });
    if (result.error) return NextResponse.json({ error: "unenroll_failed" }, { status: 400 });
    await supabase.auth.refreshSession().catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
