export type BillingPlan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  amount_cents: number;
  currency: "BRL";
  included_plays: number;
  storage_gb: number;
  prisma_ai_analyses: number;
  team_seats: number;
  play_overage_millicents: number;
  storage_overage_cents_per_gb: number;
  provider_pix_product_id: string | null;
  provider_card_product_id: string | null;
  is_featured: boolean;
  automatic_reports?: boolean;
  audience_sync?: boolean;
  outgoing_webhooks?: boolean;
  private_benchmark?: boolean;
  portfolio_comparison?: boolean;
  conversion_drop_alerts?: boolean;
};

export const sharedFeatures = [
  "Todas as funcionalidades de personalização e conversão",
  "Analytics completo, retenção e funil da VSL",
  "Testes A/B de vídeos e proteção por domínio",
  "Pixels e integrações de conversão",
];

export function getPlanBenefits(plan: BillingPlan) {
  const benefits = [
    ...sharedFeatures,
    `${plan.included_plays.toLocaleString("pt-BR")} plays incluídos por mês`,
    `${plan.storage_gb.toLocaleString("pt-BR")} GB na biblioteca`,
    `${plan.prisma_ai_analyses.toLocaleString("pt-BR")} análises da Prisma IA por mês`,
    plan.team_seats === 1 ? "Acesso individual para o titular" : `Até ${plan.team_seats} membros na equipe`,
    `${formatPlayOverage(plan.play_overage_millicents)} por play excedente`,
    `${formatStorageOverage(plan.storage_overage_cents_per_gb)} por GB excedente/mês`,
  ];
  if (plan.automatic_reports) benefits.push("Relatórios automáticos de desempenho");
  if (plan.audience_sync) benefits.push("Audience Sync para campanhas de remarketing");
  if (plan.outgoing_webhooks) benefits.push("Webhooks para integrar eventos da operação");
  if (plan.private_benchmark) benefits.push("Benchmark privado da própria operação");
  if (plan.portfolio_comparison) benefits.push("Comparação global entre todas as VSLs");
  if (plan.conversion_drop_alerts) benefits.push("Alertas inteligentes de queda na conversão");
  return benefits;
}

export function formatStorageOverage(cents: number | null | undefined) {
  const normalized = Number(cents);
  const safeCents = Number.isFinite(normalized) && normalized >= 0 ? normalized : 50;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(safeCents / 100);
}

export function formatPlayOverage(millicents: number | null | undefined) {
  const normalized = Number(millicents);
  const safeMillicents = Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(safeMillicents / 100_000);
}

export function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(cents / 100);
}
