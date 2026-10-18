import "server-only";

import type { BillingPlan } from "./catalog";
import { schema } from "@/lib/db";

const { billingPlans } = schema;

/**
 * Adapta a linha Drizzle de `billing_plans` para o contrato snake_case de
 * `BillingPlan` (consumido pelas telas e pelo acesso de conta).
 */
export function toBillingPlan(row: typeof billingPlans.$inferSelect): BillingPlan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    amount_cents: row.amountCents,
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
