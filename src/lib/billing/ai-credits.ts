import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";

const { aiCreditLedger, aiCreditWallets } = schema;

/** Localiza o código 23505 (unique_violation) na cadeia de causes do pg/Drizzle. */
function isUniqueViolationError(error: unknown): boolean {
  let cause: unknown = error;
  for (let depth = 0; cause && depth < 5; depth += 1) {
    if (typeof cause === "object" && cause !== null && "code" in cause && (cause as { code?: unknown }).code === "23505") return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

export type ConsumeAiCreditResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: "insufficient_credits" | "credit_already_consumed" };

/**
 * Débito atômico de 1 crédito (equivale ao RPC `consume_ai_credit`): debita a
 * carteira só se `balance >= 1`, registra o uso no ledger com `reference`
 * única (idempotência por job) e devolve o saldo restante. Tudo numa única
 * transação - falha no ledger reverte o débito.
 */
export async function consumeAiCredit(userId: string, reference: string, metadata: Record<string, unknown>): Promise<ConsumeAiCreditResult> {
  try {
    return await db.transaction(async (tx) => {
      const [wallet] = await tx
        .update(aiCreditWallets)
        .set({
          balance: sql`${aiCreditWallets.balance} - 1`,
          lifetimeUsed: sql`${aiCreditWallets.lifetimeUsed} + 1`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(aiCreditWallets.userId, userId), gte(aiCreditWallets.balance, 1)))
        .returning({ balance: aiCreditWallets.balance });
      if (!wallet) return { ok: false as const, reason: "insufficient_credits" as const };

      await tx.insert(aiCreditLedger).values({ userId, amount: -1, reason: "usage", reference, metadata });
      return { ok: true as const, remaining: wallet.balance };
    });
  } catch (error) {
    if (isUniqueViolationError(error)) return { ok: false, reason: "credit_already_consumed" };
    throw error;
  }
}

export type RefundAiCreditResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "usage_not_found" };

/**
 * Estorno de 1 crédito (equivale ao RPC `refund_ai_credit`): só devolve se o
 * consumo correspondente existe; o lançamento de estorno usa a referência
 * derivada (`<reference>:refund`) para a UNIQUE do ledger tornar o estorno
 * idempotente - segunda chamada devolve o saldo sem creditar de novo.
 */
export async function refundAiCredit(userId: string, reference: string): Promise<RefundAiCreditResult> {
  return db.transaction(async (tx) => {
    const [usage] = await tx.select({ id: aiCreditLedger.id })
      .from(aiCreditLedger)
      .where(and(eq(aiCreditLedger.userId, userId), eq(aiCreditLedger.reference, reference), eq(aiCreditLedger.reason, "usage")))
      .limit(1);
    if (!usage) return { ok: false as const, reason: "usage_not_found" as const };

    try {
      await tx.insert(aiCreditLedger).values({
        userId,
        amount: 1,
        reason: "refund",
        reference: `${reference}:refund`,
        metadata: { refund_of: reference },
      });
    } catch (error) {
      if (isUniqueViolationError(error)) {
        // Estorno já registrado: devolve o saldo atual sem creditar de novo.
        const [wallet] = await tx.select({ balance: aiCreditWallets.balance }).from(aiCreditWallets).where(eq(aiCreditWallets.userId, userId)).limit(1);
        return { ok: true as const, balance: wallet?.balance ?? 0 };
      }
      throw error;
    }

    const [wallet] = await tx
      .update(aiCreditWallets)
      .set({
        balance: sql`${aiCreditWallets.balance} + 1`,
        lifetimeUsed: sql`greatest(0, ${aiCreditWallets.lifetimeUsed} - 1)`,
        updatedAt: sql`now()`,
      })
      .where(eq(aiCreditWallets.userId, userId))
      .returning({ balance: aiCreditWallets.balance });
    return { ok: true as const, balance: wallet?.balance ?? 0 };
  });
}

