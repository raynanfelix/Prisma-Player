import "server-only";

import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getStripe } from "@/lib/billing/stripe/client";
import { alertOperations } from "@/lib/security/alert-webhook";
import { db, schema } from "@/lib/db";
import { safeLog } from "@/lib/utils/log";

const { paymentWebhookEvents, subscriptions } = schema;

/**
 * Reconciliação Stripe↔banco (spec Impecável, item 2) - o cinto de segurança
 * de escala. Webhook se perde (reentrega esgota, endpoint cai, bug no
 * tratamento) e a linha local silenciosamente diverge do provedor que cobra
 * de verdade. Este job NUNCA corrige sozinho - cortar acesso de quem paga ou
 * devolver acesso de quem cancelou é decisão humana: ele REGISTRA a
 * divergência em payment_webhook_events (visível no admin, idempotente por
 * dia via event_id `reconcile:{data}:{sub}`) e alerta o dono.
 *
 * Divergências detectadas:
 * - Stripe active × linha local cortada (cancelled/expired): cliente
 *   PAGANDO sem acesso - renovação com webhook perdido e o expire do cron
 *   cortou a linha.
 * - Stripe canceled × linha local active: acesso aberto SEM cobrança -
 *   cancelamento imediato (chargeback/refund) com webhook perdido.
 * - period_end dessincronizado (>2 dias) com active×active: renovação que
 *   o Stripe aplicou e o banco nunca soube.
 *
 * Estados transitórios (pending/past_due/suspended) ficam FORA: são do
 * webhook/dunning - o reconcile não compete com eles nem duplica alerta.
 */

/** Página do Stripe (máximo da API) e teto por listagem no reconcile. */
const RECONCILE_PAGE_SIZE = 100;
const RECONCILE_MAX_SUBSCRIPTIONS = 200;
/** Stripe renova no segundo exato; acima de 2 dias é webhook perdido, não atraso. */
const PERIOD_DRIFT_TOLERANCE_MS = 2 * 24 * 3_600_000;

/** Status locais terminais: acesso cortado - divergem de um stripe active. */
const LOCAL_ENDED_STATUSES = new Set(["cancelled", "expired"]);

export type ReconcileResult = {
  kind: "completed" | "skipped_no_stripe";
  /** Assinaturas conferidas (listagens ativa + cancelada, com teto). */
  checked: number;
  /** Divergências NOVAS registradas hoje (reexecução no mesmo dia não conta). */
  divergences: number;
  errors: string[];
};

type LocalSubscription = {
  id: string;
  userId: string;
  status: string;
  currentPeriodEnd: Date | null;
};

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function isoOf(value: Date | null): string {
  return value ? value.toISOString() : "null";
}

/** Fim do período vigente: na API endive vive no primeiro item da subscription. */
function periodEndOf(subscription: Stripe.Subscription): Date | null {
  const end = subscription.items.data[0]?.current_period_end;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

async function localSubscriptionOf(providerSubscriptionId: string): Promise<LocalSubscription | null> {
  const [row] = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId, status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId))
    .limit(1);
  return row ?? null;
}

/** Lista um status com auto-paginação do SDK e teto (o filtro status é valor único). */
async function listUpTo(stripe: Stripe, status: "active" | "canceled"): Promise<Stripe.Subscription[]> {
  return stripe.subscriptions
    .list({ status, limit: RECONCILE_PAGE_SIZE })
    .autoPagingToArray({ limit: RECONCILE_MAX_SUBSCRIPTIONS });
}

/**
 * Compara uma assinatura do Stripe com a linha local e devolve o diff em
 * texto (null quando convergem). O diff é o `processing_error` do evento e
 * o corpo do alerta - curto e sem dado sensível.
 */
function divergenceOf(stripeStatus: "active" | "canceled", stripePeriodEnd: Date | null, local: LocalSubscription): string | null {
  if (stripeStatus === "active") {
    if (LOCAL_ENDED_STATUSES.has(local.status)) return `stripe=active local=${local.status}`;
    if (local.status !== "active") return null; // transitório: dono é o webhook
    if (stripePeriodEnd === null && local.currentPeriodEnd === null) return null;
    if (stripePeriodEnd === null || local.currentPeriodEnd === null) {
      return `period_end stripe=${isoOf(stripePeriodEnd)} local=${isoOf(local.currentPeriodEnd)} (lado sem período)`;
    }
    const driftMs = Math.abs(stripePeriodEnd.getTime() - local.currentPeriodEnd.getTime());
    if (driftMs > PERIOD_DRIFT_TOLERANCE_MS) {
      const days = Math.round(driftMs / 86_400_000);
      return `period_end stripe=${isoOf(stripePeriodEnd)} local=${isoOf(local.currentPeriodEnd)} (drift ${days} dias)`;
    }
    return null;
  }
  return local.status === "active" ? "stripe=canceled local=active" : null;
}

/**
 * Registra a divergência SEM corrigir nada. O insert idempotente por
 * provider_event_id (`reconcile:{dia}:{sub}`) é o dedupe: reexecução no
 * mesmo dia conflita e não repete o alerta. Retorna true quando o evento
 * é NOVO (alerta disparado).
 */
async function recordDivergence(
  now: Date,
  subscriptionId: string,
  stripeStatus: "active" | "canceled",
  stripePeriodEnd: Date | null,
  local: LocalSubscription,
  diff: string,
): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const inserted = await db
    .insert(paymentWebhookEvents)
    .values({
      provider: "stripe",
      providerEventId: `reconcile:${day}:${subscriptionId}`,
      eventName: "reconcile.divergence",
      providerObjectId: subscriptionId,
      payload: {
        reconcile: {
          stripe: { status: stripeStatus, current_period_end: isoOf(stripePeriodEnd) },
          local: { status: local.status, current_period_end: isoOf(local.currentPeriodEnd) },
          diff,
        },
      },
      status: "received",
      processingError: diff.slice(0, 500),
    })
    .onConflictDoNothing()
    .returning({ id: paymentWebhookEvents.id });
  if (inserted.length === 0) return false; // já registrado hoje - idempotente

  await alertOperations({
    kind: "reconcile",
    title: "Assinatura divergente",
    detail: `sub ${subscriptionId} ${diff}`,
  });
  return true;
}

/** Passada diária de reconciliação (chamada pelo cron; `now` carimba o dia). */
export async function reconcileSubscriptions(now: Date = new Date()): Promise<ReconcileResult> {
  const result: ReconcileResult = { kind: "completed", checked: 0, divergences: 0, errors: [] };

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    // Sem STRIPE_SECRET_KEY não existem assinaturas no provedor para conferir.
    return { kind: "skipped_no_stripe", checked: 0, divergences: 0, errors: [] };
  }

  let activeSubs: Stripe.Subscription[] = [];
  let canceledSubs: Stripe.Subscription[] = [];
  try {
    [activeSubs, canceledSubs] = await Promise.all([listUpTo(stripe, "active"), listUpTo(stripe, "canceled")]);
  } catch (error) {
    result.errors.push(`reconcile_list: ${errorMessageOf(error)}`);
    return result;
  }

  for (const [stripeStatus, subs] of [["active", activeSubs], ["canceled", canceledSubs]] as const) {
    for (const subscription of subs) {
      result.checked += 1;
      try {
        const local = await localSubscriptionOf(subscription.id);
        if (!local) {
          // Assinatura sem linha local: fulfillment perdido ou assinatura de
          // outra operação na mesma conta Stripe - fica no log, não é
          // divergência de ESTADO (evita falso positivo).
          safeLog("reconcile_subscription_sem_linha_local", { subscriptionId: subscription.id, stripeStatus });
          continue;
        }
        const stripePeriodEnd = periodEndOf(subscription);
        const diff = divergenceOf(stripeStatus, stripePeriodEnd, local);
        if (!diff) continue;
        if (await recordDivergence(now, subscription.id, stripeStatus, stripePeriodEnd, local, diff)) {
          result.divergences += 1;
        }
      } catch (error) {
        result.errors.push(`reconcile:${subscription.id}: ${errorMessageOf(error)}`);
      }
    }
  }
  return result;
}
