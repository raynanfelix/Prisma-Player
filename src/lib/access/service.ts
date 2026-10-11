import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { envInt } from "@/lib/config/env";

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

function accessFrom(
  row: { onboarding_completed?: boolean; trial_status?: string | null; trial_ends_at?: string | null } | null,
  subscription: { status?: string | null; current_period_end?: string | null } | null,
): AccountAccess {
  const now = Date.now();
  const trialActive = row?.trial_status === "active" && Boolean(row.trial_ends_at) && new Date(row.trial_ends_at!).getTime() > now;
  const subscriptionActive = isSubscriptionEffective(subscription);
  return {
    onboardingCompleted: row?.onboarding_completed ?? true,
    trialStatus: (row?.trial_status as AccountAccess["trialStatus"]) ?? "used",
    trialEndsAt: row?.trial_ends_at ?? null,
    subscriptionActive,
    trialActive,
    hasAccess: trialActive || subscriptionActive,
  };
}

export async function getAccountAccess(userId: string): Promise<AccountAccess> {
  const admin = createAdminClient();
  const [accessResult, subscriptionResult] = await Promise.all([
    admin.from("account_access").select("onboarding_completed,trial_status,trial_ends_at").eq("user_id", userId).maybeSingle(),
    admin.from("subscriptions").select("status,current_period_end").eq("user_id", userId).maybeSingle(),
  ]);
  return accessFrom(accessResult.data, subscriptionResult.data);
}

/**
 * Acesso + capacidades + quotas do titular da conta numa única ida ao banco.
 * Toda decisão de "pode usar" e "quanto pode usar" no servidor sai daqui.
 */
export async function getAccountPlan(ownerId: string): Promise<AccountPlan> {
  const admin = createAdminClient();
  const [accessResult, subscriptionResult] = await Promise.all([
    admin.from("account_access").select("onboarding_completed,trial_status,trial_ends_at").eq("user_id", ownerId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("status,current_period_end,plan:billing_plans(automatic_reports,audience_sync,outgoing_webhooks,private_benchmark,portfolio_comparison,conversion_drop_alerts,storage_gb,included_plays,prisma_ai_analyses,team_seats)")
      .eq("user_id", ownerId)
      .maybeSingle(),
  ]);

  const subscription = subscriptionResult.data;
  const access = accessFrom(accessResult.data, subscription);
  const rawPlan = Array.isArray(subscription?.plan) ? subscription.plan[0] : subscription?.plan;
  const plan = (rawPlan ?? null) as PlanRow | null;

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
  const admin = createAdminClient();
  const { data } = await admin.from("videos").select("size_bytes").eq("user_id", ownerId);
  let total = 0;
  for (const row of data ?? []) total += Number(row.size_bytes) || 0;
  return total;
}

/**
 * Plays únicos do mês corrente (sessões distintas com event_type=play).
 * Mesma definição do overview da conta. `included_plays` é cota com overage
 * cobrado por play excedente (billing_plans.play_overage_millicents), não
 * bloqueio — por isso esta função serve para medição/observabilidade, nunca
 * para negar eventos legítimos sem decisão de produto.
 */
export async function getMonthPlaysUsed(ownerId: string): Promise<number> {
  const admin = createAdminClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data } = await admin
    .from("video_events")
    .select("session_id")
    .eq("user_id", ownerId)
    .eq("event_type", "play")
    .gte("created_at", monthStart.toISOString());
  return new Set((data ?? []).map((row) => row.session_id)).size;
}
