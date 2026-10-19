export type BillingPlan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  amount_cents: number;
  currency: "BRL";
  included_plays: number;
  /** Storage nÃ£o Ã© mais cobrado nem limitado â€” campo legado da tabela. */
  storage_gb?: number;
  prisma_ai_analyses: number;
  team_seats: number;
  play_overage_millicents: number;
  /** Sem cobranÃ§a por storage â€” campo legado da tabela. */
  storage_overage_cents_per_gb?: number;
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

export type CreditPackage = {
  id: string;
  slug: string;
  name: string;
  credits: number;
  bonus_credits: number;
  amount_cents: number;
};

/**
 * CatÃ¡logo LOCAL â€” fonte da vitrine de planos e pacotes de crÃ©ditos IA.
 * Espelha o pricing pÃºblico do site (mesmos valores que o dono mantÃ©m na
 * landing). Quando o novo provedor de pagamento chegar, as rows do banco
 * (billing_plans / ai_credit_products) passam a prevalecer; isto Ã© o
 * fallback que garante que a pÃ¡gina NUNCA fique vazia â€” inclusive no trial.
 */
export const CATALOG_PLANS: BillingPlan[] = [
  {
    id: "catalog-iniciante",
    slug: "iniciante",
    name: "Plano Iniciante",
    description: "Para produtores e afiliados testando e validando suas primeiras VSLs.",
    amount_cents: 6790,
    currency: "BRL",
    included_plays: 10_000,
    prisma_ai_analyses: 10,
    team_seats: 1,
    play_overage_millicents: 20,
    provider_pix_product_id: null,
    provider_card_product_id: null,
    is_featured: false,
  },
  {
    id: "catalog-pro",
    slug: "pro",
    name: "Plano Pro",
    description: "Para ofertas validadas com trÃ¡fego pago constante e trabalho recorrente de retenÃ§Ã£o.",
    amount_cents: 14790,
    currency: "BRL",
    included_plays: 50_000,
    prisma_ai_analyses: 50,
    team_seats: 3,
    play_overage_millicents: 20,
    provider_pix_product_id: null,
    provider_card_product_id: null,
    is_featured: true,
    automatic_reports: true,
    private_benchmark: true,
  },
  {
    id: "catalog-escala",
    slug: "escala",
    name: "Plano Escala",
    description: "Para agÃªncias, coprodutores e lanÃ§amentos de alto volume que precisam de suporte prÃ³ximo.",
    amount_cents: 34790,
    currency: "BRL",
    included_plays: 200_000,
    prisma_ai_analyses: 200,
    team_seats: 10,
    play_overage_millicents: 20,
    provider_pix_product_id: null,
    provider_card_product_id: null,
    is_featured: false,
    automatic_reports: true,
    audience_sync: true,
    outgoing_webhooks: true,
    private_benchmark: true,
    portfolio_comparison: true,
    conversion_drop_alerts: true,
  },
];

/**
 * Pacotes de crÃ©ditos da Prisma IA (vitrine). Valores de lanÃ§amento â€”
 * ajustÃ¡veis quando o provedor de pagamento for integrado.
 */
export const CATALOG_CREDIT_PACKAGES: CreditPackage[] = [
  { id: "catalog-credits-start", slug: "credits-start", name: "CrÃ©ditos IA â€” Start", credits: 100, bonus_credits: 0, amount_cents: 1990 },
  { id: "catalog-credits-pro", slug: "credits-pro", name: "CrÃ©ditos IA â€” Pro", credits: 500, bonus_credits: 100, amount_cents: 8990 },
  { id: "catalog-credits-escala", slug: "credits-escala", name: "CrÃ©ditos IA â€” Escala", credits: 2000, bonus_credits: 500, amount_cents: 32990 },
];

const sharedFeatures = [
  "Todas as funcionalidades de personalizaÃ§Ã£o e conversÃ£o",
  "Analytics completo, retenÃ§Ã£o e funil da VSL",
  "Testes A/B de vÃ­deos e proteÃ§Ã£o por domÃ­nio",
  "Pixels e integraÃ§Ãµes de conversÃ£o",
];

export function getPlanBenefits(plan: BillingPlan) {
  const benefits = [
    ...sharedFeatures,
    `${plan.included_plays.toLocaleString("pt-BR")} plays incluÃ­dos por mÃªs`,
    `${plan.prisma_ai_analyses.toLocaleString("pt-BR")} anÃ¡lises da Prisma IA por mÃªs`,
    plan.team_seats === 1 ? "Acesso individual para o titular" : `AtÃ© ${plan.team_seats} membros na equipe`,
    `${formatPlayOverage(plan.play_overage_millicents)} por play excedente`,
  ];
  if (plan.automatic_reports) benefits.push("RelatÃ³rios automÃ¡ticos de desempenho");
  if (plan.audience_sync) benefits.push("Audience Sync para campanhas de remarketing");
  if (plan.outgoing_webhooks) benefits.push("Webhooks para integrar eventos da operaÃ§Ã£o");
  if (plan.private_benchmark) benefits.push("Benchmark privado da prÃ³pria operaÃ§Ã£o");
  if (plan.portfolio_comparison) benefits.push("ComparaÃ§Ã£o global entre todas as VSLs");
  if (plan.conversion_drop_alerts) benefits.push("Alertas inteligentes de queda na conversÃ£o");
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

