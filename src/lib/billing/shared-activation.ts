import "server-only";

import { eq } from "drizzle-orm";

import { abacateRequest } from "@/lib/billing/abacatepay/client";
import { db, schema } from "@/lib/db";

const { subscriptions } = schema;

function nextPeriodEnd(): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const monthIdx = date.getUTCMonth(); // 0-based
  const day = date.getUTCDate();
  // Próximo mês; handle wrap de ano (dezembro → janeiro seguinte)
  let targetMonthIdx = monthIdx + 1;
  let targetYear = year;
  if (targetMonthIdx > 11) {
    targetMonthIdx = 0;
    targetYear = year + 1;
  }
  // Úmero dia do mês alvo (new Date(y, m, 0) = último dia do mês m-1 em 0-based,
  // então new Date(y, targetMonthIdx+1, 0) = último dia do targetMonthIdx)
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonthIdx + 1, 0)).getUTCDate();
  // Usa o dia corrente, limitado ao máximo do mês alvo (fecha o "vazamento" de 31/jan → ~5 semanas)
  const safeDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonthIdx, safeDay)).toISOString();
}

export async function cancelPreviousProviderSubscription(
  previousId: string | null | undefined,
  currentProviderId: string | null | undefined,
): Promise<void> {
  if (previousId && previousId !== currentProviderId) {
    await abacateRequest("/subscriptions/cancel", {
      method: "POST",
      body: JSON.stringify({ id: previousId }),
    });
  }
}

/**
 * Upsert da assinatura do titular (uma linha por `user_id`). Só grava
 * `provider_subscription_id` na ativação de cartão: ativações PIX não podem
 * apagar o id da assinatura de cartão vigente no provedor.
 */
export async function activateSubscription(checkout: {
  id: string;
  user_id: string;
  plan_id: string;
  checkout_type: "pix" | "card_subscription";
}, providerObjectId?: string | null): Promise<void> {
  const now = new Date();
  const method = checkout.checkout_type === "pix" ? "pix" : "card";
  const providerSubscriptionId = method === "card" && providerObjectId ? providerObjectId : null;

  const values = {
    userId: checkout.user_id,
    planId: checkout.plan_id,
    sourceCheckoutId: checkout.id,
    billingMethod: method,
    status: "active" as const,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(nextPeriodEnd()),
    cancelledAt: null,
    updatedAt: now,
    ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planId: values.planId,
        sourceCheckoutId: values.sourceCheckoutId,
        billingMethod: values.billingMethod,
        status: values.status,
        currentPeriodStart: values.currentPeriodStart,
        currentPeriodEnd: values.currentPeriodEnd,
        cancelledAt: values.cancelledAt,
        updatedAt: values.updatedAt,
        ...(providerSubscriptionId ? { providerSubscriptionId } : {}),
      },
    });
}
