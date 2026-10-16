import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { adminAuditLog, aiCreditLedger, aiCreditWallets, profiles } = schema;

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

  const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const now = new Date();
  // Ledger e carteira do mesmo movimento: uma transação com lock da carteira,
  // para que ajustes concorrentes não calculem saldo a partir de leitura velha.
  const result = await db.transaction(async (tx) => {
    const [wallet] = await tx.select({ balance: aiCreditWallets.balance, lifetimePurchased: aiCreditWallets.lifetimePurchased })
      .from(aiCreditWallets).where(eq(aiCreditWallets.userId, userId)).for("update").limit(1);
    const current = wallet?.balance ?? 0;
    const applied = delta < 0 ? -Math.min(-delta, current) : delta;
    if (applied === 0) return null;

    const balance = current + applied;
    const reference = `admin-adjust-${crypto.randomUUID()}`;
    await tx.insert(aiCreditLedger).values({ userId, amount: applied, reason: "adjustment", reference });

    const purchased = (wallet?.lifetimePurchased ?? 0) + Math.max(0, applied);
    if (wallet) {
      await tx.update(aiCreditWallets).set({ balance, lifetimePurchased: purchased, updatedAt: now }).where(eq(aiCreditWallets.userId, userId));
    } else {
      await tx.insert(aiCreditWallets).values({ userId, balance, lifetimePurchased: purchased });
    }
    return { balance, applied, reference };
  });
  if (!result) return NextResponse.json({ error: "insufficient_balance" }, { status: 409 });

  await db.insert(adminAuditLog).values({
    adminUserId: gate.adminId,
    action: "credit_adjust",
    targetUserId: userId,
    details: { delta: result.applied, reason, reference: result.reference },
  });

  return NextResponse.json({ updated: true, balance: result.balance, applied: result.applied }, { headers: { "cache-control": "no-store" } });
}
