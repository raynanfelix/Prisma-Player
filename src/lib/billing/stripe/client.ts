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
 * Resolve o ID do Price ativo pelo `lookup_key` (o catálogo vive no Stripe —
 * zero migration no nosso DB). Cache em memória com TTL de 10 min por lookup;
 * cache miss (ou TTL expirado) cai no `prices.list` — o caminho oficial de
 * busca por lookup_key. Miss não é cacheado: rodar o seed libera o checkout
 * imediatamente, sem esperar o TTL.
 *
 * Retorna null quando o lookup não existe (seed ainda não rodado, price
 * arquivado…). A rota converte isso num erro honesto para o cliente.
 */
export async function resolvePriceByLookupKey(lookupKey: string): Promise<string | null> {
  const cache = priceCache();
  const hit = cache.get(lookupKey);
  if (hit && Date.now() < hit.expiresAt) return hit.priceId;

  const stripe = getStripe();
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const priceId = prices.data[0]?.id ?? null;
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
