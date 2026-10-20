import "server-only";

import type { BillingPlan } from "./catalog";
import { CATALOG_PLANS } from "./catalog";
import { schema } from "@/lib/db";

const { billingPlans } = schema;

/**
 * Adapta a linha Drizzle de `billing_plans` para o contrato snake_case de
 * `BillingPlan` (consumido pelas telas e pelo acesso de conta).
 *
 * O preço ANUAL não vive na tabela (só mensal): a fonte é o catálogo local
 * (mesmos valores da landing/Stripe, lookup `plano_<slug>_anual`). Plano
 * fora do catálogo recebe o preço de tabela honesto — 12× mensal, sem
 * desconto inventado.
 */
export function toBillingPlan(row: typeof billingPlans.$inferSelect): BillingPlan {
  const catalog = CATALOG_PLANS.find((plan) => plan.slug === row.slug);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    amount_cents: row.amountCents,
    annual_amount_cents: catalog?.annual_amount_cents ?? row.amountCents * 12,
    annual_monthly_equivalent: catalog?.annual_monthly_equivalent ?? row.amountCents,
    currency: "BRL", // CHECK da tabela garante BRL
    included_plays: row.includedPlays,
    storage_gb: row.storageGb,
    prisma_ai_analyses: row.prismaAiAnalyses,
    team_seats: row.teamSeats,
    play_overage_millicents: row.playOverageMillicents,
    storage_overage_cents_per_gb: row.storageOverageCentsPerGb,
    provider_pix_product_id: row.providerPixProductId,
    provider_card_product_id: row.providerCardProductId,
    is_featured: row.isFeatured,
    automatic_reports: row.automaticReports,
    audience_sync: row.audienceSync,
    outgoing_webhooks: row.outgoingWebhooks,
    private_benchmark: row.privateBenchmark,
    portfolio_comparison: row.portfolioComparison,
    conversion_drop_alerts: row.conversionDropAlerts,
  };
}
