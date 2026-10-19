import "server-only";

import Stripe from "stripe";

/**
 * Cliente Stripe do Prisma Player — Opção A (Checkout hospedado).
 *
 * Regras das skills stripe-best-practices que este módulo trava:
 * - `new Stripe(key)` por instância — NUNCA a api key global (deprecated).
 * - A key vem SEMPRE de env (`STRIPE_SECRET_KEY`), idealmente uma restricted
 *   API key `rk_` com permissão mínima — nunca `sk_` em código.
 * - Nenhuma chamada deste módulo passa `payment_method_types`: os métodos de
 *   pagamento (Pix/cartão/Link) são decididos pelo Dashboard (dynamic payment
 *   methods).
 * - `automatic_tax` fica DESLIGADO (Stripe Tax não cobre o Brasil).
 */

/** Sufixo de 8 letras aleatórias exigido pela skill para o label do fluxo. */
export const STRIPE_INTEGRATION_IDENTIFIER = "prisma-player-xbiachdw";

const PRICE_CACHE_TTL_MS = 10 * 60_000;

type CachedPrice = { priceId: string; expiresAt: number };

const globalForStripe = globalThis as unknown as {
  prismaPlayerStripeByKey?: Map<string, Stripe>;
  prismaPlayerStripePriceCache?: Map<string, CachedPrice>;
};

function stripeByKey(): Map<string, Stripe> {
  if (!globalForStripe.prismaPlayerStripeByKey) {
    globalForStripe.prismaPlayerStripeByKey = new Map();
  }
  return globalForStripe.prismaPlayerStripeByKey;
}

function priceCache(): Map<string, CachedPrice> {
  if (!globalForStripe.prismaPlayerStripePriceCache) {
    globalForStripe.prismaPlayerStripePriceCache = new Map();
  }
  return globalForStripe.prismaPlayerStripePriceCache;
}

/**
 * Instância do SDK. Lazy (importar o módulo não exige env — build/testes não
 * precisam de Stripe configurado; a falha clara acontece na primeira chamada)
 * e cacheada POR KEY em globalThis: warm invokes reutilizam a instância e uma
 * key rotacionada no painel cria instância nova na próxima chamada.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe não configurado: defina STRIPE_SECRET_KEY no ambiente (use uma restricted API key com prefixo rk_ — nunca sk_ em código).",
    );
  }
  const cached = stripeByKey().get(key);
  if (cached) return cached;
  const client = new Stripe(key);
  stripeByKey().set(key, client);
  return client;
}

/**
 * Auto-provisionamento: se o lookup_key não existir no Stripe, o Price (e o
 * Product embutido) é CRIADO na hora a partir desta definição local — o dono
 * não precisa criar produto manualmente nem rodar o seed. O seed continua
 * existindo para quem quiser provisionar tudo de uma vez.
 */
interface PriceDefinition {
  productName: string;
  amountCents: number;
  recurring?: "month" | "year";
  planSlug?: string;
  description?: string;
}

const PRICE_DEFINITIONS: Record<string, PriceDefinition> = {
  plano_iniciante_mensal: { productName: "Prisma Iniciante", amountCents: 6790, recurring: "month", planSlug: "iniciante", description: "Para produtores e afiliados testando e validando suas primeiras VSLs." },
  plano_iniciante_anual: { productName: "Prisma Iniciante", amountCents: 53880, recurring: "year", planSlug: "iniciante", description: "Para produtores e afiliados testando e validando suas primeiras VSLs." },
  plano_pro_mensal: { productName: "Prisma Pro", amountCents: 14790, recurring: "month", planSlug: "pro", description: "Para ofertas validadas com tráfego pago constante e trabalho recorrente de retenção." },
  plano_pro_anual: { productName: "Prisma Pro", amountCents: 117480, recurring: "year", planSlug: "pro", description: "Para ofertas validadas com tráfego pago constante e trabalho recorrente de retenção." },
  plano_escala_mensal: { productName: "Prisma Escala", amountCents: 34790, recurring: "month", planSlug: "escala", description: "Para agências, coprodutores e lançamentos de alto volume." },
  plano_escala_anual: { productName: "Prisma Escala", amountCents: 275880, recurring: "year", planSlug: "escala", description: "Para agências, coprodutores e lançamentos de alto volume." },
  creditos_ia_start: { productName: "Créditos IA — Start", amountCents: 1990, planSlug: "credits-start", description: "100 créditos da Prisma IA — não expiram." },
  creditos_ia_pro: { productName: "Créditos IA — Pro", amountCents: 8990, planSlug: "credits-pro", description: "500 créditos + 100 de bônus da Prisma IA — não expiram." },
  creditos_ia_escala: { productName: "Créditos IA — Escala", amountCents: 32990, planSlug: "credits-escala", description: "2.000 créditos + 500 de bônus da Prisma IA — não expiram." },
};

/**
 * Cria o Price no Stripe a partir da definição local (product embutido).
 * Race-safe: se dois checkouts simultâneos criarem o mesmo lookup_key, o
 * segundo recebe "resource already exists" → re-lista e devolve o primeiro.
 */
async function autoProvisionPrice(stripe: Stripe, lookupKey: string, definition: PriceDefinition): Promise<string | null> {
  try {
    const price = await stripe.prices.create({
      lookup_key: lookupKey,
      unit_amount: definition.amountCents,
      currency: "brl",
      ...(definition.recurring ? { recurring: { interval: definition.recurring } } : {}),
      product_data: {
        name: definition.productName,
        ...(definition.description ? { description: definition.description } : {}),
        metadata: { prisma_plan: definition.planSlug ?? "" },
      },
    });
    return price.id;
  } catch (error) {
    // Dois checkouts ao mesmo tempo criaram o mesmo lookup_key: o que chegou
    // segundo falha com "resource_already_exists" — busca o que o primeiro criou.
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("lookup_key") || message.includes("already exists")) {
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
      return prices.data[0]?.id ?? null;
    }
    throw error;
  }
}

/**
 * Resolve o ID do Price ativo pelo `lookup_key` (o catálogo vive no Stripe —
 * zero migration no nosso DB). Cache em memória com TTL de 10 min por lookup;
 * cache miss (ou TTL expirado) cai no `prices.list` — o caminho oficial de
 * busca por lookup_key. Se o lookup NÃO existe mas há definição local
 * (auto-provisionamento), o Price é criado na hora. Miss não é cacheado:
 * um price criado fora (seed/painel) libera o checkout na próxima chamada.
 *
 * Retorna null quando não existe nem no Stripe nem na definição local
 * (lookup desconhecido → erro honesto na rota).
 */
export async function resolvePriceByLookupKey(lookupKey: string): Promise<string | null> {
  const cache = priceCache();
  const hit = cache.get(lookupKey);
  if (hit && Date.now() < hit.expiresAt) return hit.priceId;

  const stripe = getStripe();
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  let priceId: string | null = prices.data[0]?.id ?? null;

  if (!priceId) {
    const definition = PRICE_DEFINITIONS[lookupKey];
    if (definition) {
      priceId = await autoProvisionPrice(stripe, lookupKey, definition);
    }
  }

  if (priceId) {
    cache.set(lookupKey, { priceId, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
  }
  return priceId;
}

/** Reset dos caches de módulo — exclusivo para testes (padrão reset*ForTests). */
export function resetStripePriceCacheForTests(): void {
  priceCache().clear();
}

/**
 * Origem usada nas URLs de retorno do Checkout/Portal (success/cancel/return).
 * No Vercel/produção o Next reconstrói `request.url` com o host público (a
 * mesma base que o csrfGuard valida); em último caso cai no site público
 * configurado — as URLs do Stripe precisam ser absolutas.
 */
export function billingOrigin(request: Request): string {
  try {
    const origin = new URL(request.url).origin;
    if (origin && origin !== "null") return origin;
  } catch {
    // URL irreconstruíível → fallback abaixo.
  }
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "http://localhost:3000";
}
