#!/usr/bin/env node
/**
 * scripts/stripe-seed.mjs — catálogo Stripe do Prisma Player (Opção A).
 *
 * Cria os Products e Prices da spec (docs/STRIPE_INTEGRATION_SPEC.md) usando
 * o `STRIPE_SECRET_KEY` do dono (use uma restricted API key — prefixo rk_).
 * Idempotente: lista antes de criar — pode rodar quantas vezes quiser.
 *
 *   $Env:STRIPE_SECRET_KEY = "rk_..."        (PowerShell)
 *   node scripts/stripe-seed.mjs
 *
 * Modelagem (regras da skill stripe-best-practices):
 * - 1 Product por plano (mensal e anual são Prices/billing variants do MESMO
 *   product) e 1 Product por pacote de créditos.
 * - Prices criados com `lookup_key`: o app resolve preço por lookup (zero
 *   migration no nosso DB). NUNCA objeto `plan` (deprecated).
 * - Anual = Price `recurring { interval: "year" }`: o ano é cobrado à vista.
 * - Nada aqui passa `payment_method_types` (dynamic payment methods).
 * - `automatic_tax` fica desligado (Stripe Tax não cobre o Brasil).
 */
import { existsSync, readFileSync } from "node:fs";
import Stripe from "stripe";

function loadEnvFileIfPresent(name) {
  if (!existsSync(name) || process.env.STRIPE_SECRET_KEY) return;
  for (const line of readFileSync(name, "utf8").split(/\r?\n/)) {
    const match = /^\s*STRIPE_SECRET_KEY\s*=\s*"?([^"\r\n#]+)"?\s*$/.exec(line);
    if (match) process.env.STRIPE_SECRET_KEY = match[1].trim();
  }
}
loadEnvFileIfPresent(".env.local");
loadEnvFileIfPresent(".env");

const apiKey = process.env.STRIPE_SECRET_KEY;
if (!apiKey) {
  console.error(
    "ERRO: STRIPE_SECRET_KEY ausente. Exporte a restricted API key (rk_…) antes de rodar:\n" +
      '  PowerShell: $Env:STRIPE_SECRET_KEY = "rk_..."\n' +
      "  ou defina STRIPE_SECRET_KEY em .env.local",
  );
  process.exit(1);
}

const stripe = new Stripe(apiKey);

/** 1 Product por plano; mensal+anual = Prices do mesmo product (billing variants). */
const PLANS = [
  { slug: "iniciante", name: "Prisma Iniciante", monthly: 6790, annual: 53880 },
  { slug: "pro", name: "Prisma Pro", monthly: 14790, annual: 117480 },
  { slug: "escala", name: "Prisma Escala", monthly: 34790, annual: 275880 },
];

/** 1 Product por pacote de créditos (one-time). */
const CREDIT_PACKAGES = [
  { slug: "credits-start", suffix: "start", name: "Créditos IA Start", amount: 1990 },
  { slug: "credits-pro", suffix: "pro", name: "Créditos IA Pro", amount: 8990 },
  { slug: "credits-escala", suffix: "escala", name: "Créditos IA Escala", amount: 32990 },
];

// Idempotência: índice dos products existentes por metadata.prisma_plan.
const products = await stripe.products.list({ limit: 100, active: true });
const productsByPlan = new Map(
  products.data.map((product) => [product.metadata?.prisma_plan ?? "", product]),
);

async function ensureProduct(slug, name) {
  const existing = productsByPlan.get(slug);
  if (existing) {
    console.log(`product  ok      ${name} (${existing.id})`);
    return existing;
  }
  const product = await stripe.products.create({ name, metadata: { prisma_plan: slug } });
  productsByPlan.set(slug, product);
  console.log(`product  criado  ${name} (${product.id})`);
  return product;
}

async function ensurePrice({ lookupKey, create }) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    console.log(`price    ok      ${lookupKey} (${existing.data[0].id})`);
    return existing.data[0];
  }
  const price = await stripe.prices.create({ ...create, lookup_key: lookupKey });
  console.log(`price    criado  ${lookupKey} (${price.id})`);
  return price;
}

console.log("== Prisma Player — seed do catálogo Stripe ==\n");

for (const plan of PLANS) {
  const product = await ensureProduct(plan.slug, plan.name);
  await ensurePrice({
    lookupKey: `plano_${plan.slug}_mensal`,
    create: { product: product.id, currency: "brl", unit_amount: plan.monthly, recurring: { interval: "month" } },
  });
  await ensurePrice({
    lookupKey: `plano_${plan.slug}_anual`,
    // Anual à vista: um Price por ano, cobrado em uma vez.
    create: { product: product.id, currency: "brl", unit_amount: plan.annual, recurring: { interval: "year" } },
  });
}

for (const pkg of CREDIT_PACKAGES) {
  const product = await ensureProduct(pkg.slug, pkg.name);
  await ensurePrice({
    lookupKey: `creditos_ia_${pkg.suffix}`,
    create: { product: product.id, currency: "brl", unit_amount: pkg.amount },
  });
}

console.log("\nPronto. Próximos passos no Dashboard Stripe:");
console.log("  1. Ative Pix/cartão em Settings → Payment methods (o Checkout escolhe sozinho).");
console.log("  2. Developers → Webhooks → Add endpoint: https://SEU-DOMINIO/api/webhooks/stripe");
console.log("     Eventos: checkout.session.completed, checkout.session.async_payment_succeeded,");
console.log("     checkout.session.async_payment_failed, customer.subscription.updated,");
console.log("     customer.subscription.deleted, invoice.paid, invoice.payment_failed,");
console.log("     charge.dispute.created, charge.refunded, radar.early_fraud_warning.created");
console.log("  3. Copie o Signing secret (whsec_…) para STRIPE_WEBHOOK_SECRET.");
