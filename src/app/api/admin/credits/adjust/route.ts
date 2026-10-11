import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Suporte: crédito/débito manual de Prisma IA com motivo obrigatório.
 * Todo movimento gera linha no ledger (reason=adjustment) + trilha de
 * auditoria. O saldo nunca fica negativo: débito maior que o saldo zera.
 */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-credits:${gate.adminId}`, { max: 30, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ userId?: unknown; delta?: unknown; reason?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const userId = String(parsed.body?.userId ?? "");
  const delta = Math.trunc(Number(parsed.body?.delta ?? 0));
  const reason = String(parsed.body?.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 280);
  if (!uuid.test(userId) || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000 || !reason) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!profile) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const { data: wallet } = await admin.from("ai_credit_wallets").select("balance,lifetime_purchased").eq("user_id", userId).maybeSingle();
  const current = wallet?.balance ?? 0;
  const applied = delta < 0 ? -Math.min(-delta, current) : delta;
  const balance = current + applied;
  if (applied === 0) return NextResponse.json({ error: "insufficient_balance" }, { status: 409 });

  const reference = `admin-adjust-${crypto.randomUUID()}`;
  const ledger = await admin.from("ai_credit_ledger").insert({ user_id: userId, amount: applied, reason: "adjustment", reference });
  if (ledger.error) return NextResponse.json({ error: "adjust_failed" }, { status: 500 });

  const purchased = (wallet?.lifetime_purchased ?? 0) + Math.max(0, applied);
  const upsert = wallet
    ? await admin.from("ai_credit_wallets").update({ balance, lifetime_purchased: purchased, updated_at: new Date().toISOString() }).eq("user_id", userId)
    : await admin.from("ai_credit_wallets").insert({ user_id: userId, balance, lifetime_purchased: purchased });
  if (upsert.error) return NextResponse.json({ error: "adjust_failed" }, { status: 500 });

  await admin.from("admin_audit_log").insert({
    admin_user_id: gate.adminId,
    action: "credit_adjust",
    target_user_id: userId,
    details: { delta: applied, reason, reference },
  });

  return NextResponse.json({ updated: true, balance, applied }, { headers: { "cache-control": "no-store" } });
}
