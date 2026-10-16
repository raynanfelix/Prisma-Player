import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";
import { envInt } from "@/lib/config/env";

const { accountAccess, billingPlans, subscriptions, videoEvents, videos } = schema;

export type AccountAccess = {
  onboardingCompleted: boolean;
  trialStatus: "available" | "active" | "used" | "expired";
  trialEndsAt: string | null;
  subscriptionActive: boolean;
  trialActive: boolean;
  hasAccess: boolean;
};

/**
 * Capacidades comerciais liberadas para a conta. Durante o trial tudo fica
 * ligado (a mensagem de ativação promete "acesso completo por 14 dias"); sem
 * trial e sem assinatura, tudo fica desligado.
 *
 * O padrão anterior era o inverso: a ausência de assinatura devolvia todas as
 * capacidades como `true`, o que entregava recursos pagos de graça.
 */
export type PlanCapabilities = {
  automatic_reports: boolean;
  audience_sync: boolean;
  outgoing_webhooks: boolean;
  private_benchmark: boolean;
  portfolio_comparison: boolean;
  conversion_drop_alerts: boolean;
};

export type PlanQuotas = {
  storageBytes: number;
  includedPlays: number | null;
  aiAnalyses: number | null;
  teamSeats: number;
};

export type AccountPlan = {
  access: AccountAccess;
  capabilities: PlanCapabilities;
  quotas: PlanQuotas;
};

const NO_CAPABILITIES: PlanCapabilities = {
  automatic_reports: false,
  audience_sync: false,
  outgoing_webhooks: false,
  private_benchmark: false,
  portfolio_comparison: false,
  conversion_drop_alerts: false,
};

const ALL_CAPABILITIES: PlanCapabilities = {
  automatic_reports: true,
  audience_sync: true,
  outgoing_webhooks: true,
  private_benchmark: true,
  portfolio_comparison: true,
  conversion_drop_alerts: true,
};

const GB = 1024 ** 3;

type AccessRow = {
  onboarding_completed?: boolean;
  trial_status?: string | null;
  trial_ends_at?: string | null;
};

type SubscriptionRow = {
  status?: string | null;
  current_period_end?: string | null;
};

type PlanRow = Partial<PlanCapabilities> & {
  storage_gb?: number | null;
  included_plays?: number | null;
  prisma_ai_analyses?: number | null;
  team_seats?: number | null;
};

/**
 * Assinatura efetiva: status active E período vigente. `current_period_end`
 * nulo com status active é tratado como SEM acesso (fail-closed): todas as
 * escritas legítimas (webhook, ativação, admin) definem o fim do período, e
 * período aberto seria acesso vitalício silencioso — vetor de burla.
 */
export function isSubscriptionEffective(subscription: { status?: string | null; current_period_end?: string | null } | null): boolean {
  if (!subscription || subscription.status !== "active") return false;
  if (!subscription.current_period_end) return false;
  return new Date(subscription.current_period_end).getTime() > Date.now();
}

/**
 * Rótulo de verdade para telas: difere `active` vigente de linha vencida.
 * Linha `active` com período passado/nulo exibe como vencida — foi exatamente
 * essa divergência (admin verde x produto bloqueado) que gerou o chamado.
 */
export function subscriptionDisplayStatus(subscription: { status?: string | null; current_period_end?: string | null } | null): string {
  if (!subscription?.status) return "none";
  if (subscription.status === "active" && !isSubscriptionEffective(subscription)) return "expired";
  return subscription.status;
}

function accessFrom(
  row: AccessRow | null,
  subscription: SubscriptionRow | null,
): AccountAccess {
  const now = Date.now();
  const validTrialStatuses = ["available", "active", "used", "expired"] as const;
  const rawTrialStatus = row?.trial_status ?? "used";
  const trialStatus = validTrialStatuses.includes(rawTrialStatus as typeof validTrialStatuses[number])
    ? rawTrialStatus
    : "used"; // Fail-closed: valor inválido tratado como sem trial
  const trialEndsAt = row?.trial_ends_at;
  const trialActive = trialStatus === "active" && typeof trialEndsAt === "string" && new Date(trialEndsAt).getTime() > now;
  const subscriptionActive = isSubscriptionEffective(subscription);
  return {
    onboardingCompleted: row?.onboarding_completed ?? true,
    trialStatus: trialStatus as AccountAccess["trialStatus"],
    trialEndsAt: row?.trial_ends_at ?? null,
    subscriptionActive,
    trialActive,
    hasAccess: trialActive || subscriptionActive,
  };
}

function toAccessRow(row: {
  onboardingCompleted: boolean;
  trialStatus: string;
  trialEndsAt: Date | null;
} | undefined): AccessRow | null {
  if (!row) return null;
  return {
    onboarding_completed: row.onboardingCompleted,
    trial_status: row.trialStatus,
    trial_ends_at: isoOrNull(row.trialEndsAt),
  };
}

function toSubscriptionRow(row: {
  status: string;
  currentPeriodEnd: Date | null;
} | undefined): SubscriptionRow | null {
  if (!row) return null;
  return {
    status: row.status,
    current_period_end: isoOrNull(row.currentPeriodEnd),
  };
}

const ACCESS_COLUMNS = {
  onboardingCompleted: accountAccess.onboardingCompleted,
  trialStatus: accountAccess.trialStatus,
  trialEndsAt: accountAccess.trialEndsAt,
};

export async function getAccountAccess(userId: string): Promise<AccountAccess> {
  const [accessRow, subscriptionRow] = await Promise.all([
    db.select(ACCESS_COLUMNS).from(accountAccess).where(eq(accountAccess.userId, userId)).limit(1),
    db
      .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1),
  ]);
  return accessFrom(toAccessRow(accessRow[0]), toSubscriptionRow(subscriptionRow[0]));
}

/**
 * Acesso + capacidades + quotas do titular da conta numa única ida ao banco.
 * Toda decisão de "pode usar" e "quanto pode usar" no servidor sai daqui.
 */
export async function getAccountPlan(ownerId: string): Promise<AccountPlan> {
  const [accessRow, subscriptionRow] = await Promise.all([
    db.select(ACCESS_COLUMNS).from(accountAccess).where(eq(accountAccess.userId, ownerId)).limit(1),
    db
      .select({
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        automaticReports: billingPlans.automaticReports,
        audienceSync: billingPlans.audienceSync,
        outgoingWebhooks: billingPlans.outgoingWebhooks,
        privateBenchmark: billingPlans.privateBenchmark,
        portfolioComparison: billingPlans.portfolioComparison,
        conversionDropAlerts: billingPlans.conversionDropAlerts,
        storageGb: billingPlans.storageGb,
        includedPlays: billingPlans.includedPlays,
        prismaAiAnalyses: billingPlans.prismaAiAnalyses,
        teamSeats: billingPlans.teamSeats,
      })
      .from(subscriptions)
      .leftJoin(billingPlans, eq(subscriptions.planId, billingPlans.id))
      .where(eq(subscriptions.userId, ownerId))
      .limit(1),
  ]);

  const subscription = toSubscriptionRow(subscriptionRow[0]);
  const access = accessFrom(toAccessRow(accessRow[0]), subscription);
  const plan: PlanRow | null = subscriptionRow[0]
    ? {
        automatic_reports: subscriptionRow[0].automaticReports ?? false,
        audience_sync: subscriptionRow[0].audienceSync ?? false,
        outgoing_webhooks: subscriptionRow[0].outgoingWebhooks ?? false,
        private_benchmark: subscriptionRow[0].privateBenchmark ?? false,
        portfolio_comparison: subscriptionRow[0].portfolioComparison ?? false,
        conversion_drop_alerts: subscriptionRow[0].conversionDropAlerts ?? false,
        storage_gb: subscriptionRow[0].storageGb ?? null,
        included_plays: subscriptionRow[0].includedPlays ?? null,
        prisma_ai_analyses: subscriptionRow[0].prismaAiAnalyses ?? null,
        team_seats: subscriptionRow[0].teamSeats ?? null,
      }
    : null;

  const capabilities: PlanCapabilities = access.subscriptionActive && plan
    ? {
        automatic_reports: Boolean(plan.automatic_reports),
        audience_sync: Boolean(plan.audience_sync),
        outgoing_webhooks: Boolean(plan.outgoing_webhooks),
        private_benchmark: Boolean(plan.private_benchmark),
        portfolio_comparison: Boolean(plan.portfolio_comparison),
        conversion_drop_alerts: Boolean(plan.conversion_drop_alerts),
      }
    : access.trialActive
      ? ALL_CAPABILITIES
      : NO_CAPABILITIES;

  const storageGb = access.subscriptionActive && plan?.storage_gb
    ? Number(plan.storage_gb)
    : envInt("TRIAL_STORAGE_GB", 5);

  return {
    access,
    capabilities,
    quotas: {
      storageBytes: Math.max(0, storageGb) * GB,
      includedPlays: plan?.included_plays ?? null,
      aiAnalyses: plan?.prisma_ai_analyses ?? null,
      teamSeats: plan?.team_seats ?? 1,
    },
  };
}

/** Bytes já ocupados pelos vídeos da conta. Somado no servidor, nunca no cliente. */
export async function getStorageUsedBytes(ownerId: string): Promise<number> {
  const [row] = await db
    .select({ totalSize: sql<string>`coalesce(sum(${videos.sizeBytes}), 0)` })
    .from(videos)
    .where(eq(videos.userId, ownerId));
  return Number(row?.totalSize ?? 0);
}

/**
 * Plays únicos do mês corrente (sessões distintas com event_type=play).
 * Mesma definição do overview da conta. `included_plays` é cota com overage
 * cobrado por play excedente (billing_plans.play_overage_millicents), não
 * bloqueio — por isso esta função serve para medição/observabilidade, nunca
 * para negar eventos legítimos sem decisão de produto.
 */
export async function getMonthPlaysUsed(ownerId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ playSessions: sql<number>`count(distinct ${videoEvents.sessionId})::int` })
    .from(videoEvents)
    .where(
      and(
        eq(videoEvents.userId, ownerId),
        eq(videoEvents.eventType, "play"),
        gte(videoEvents.createdAt, monthStart),
      ),
    );
  return row?.playSessions ?? 0;
}
