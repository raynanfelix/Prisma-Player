import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { CATALOG_PLANS } from "@/lib/billing/catalog";
import { billingOrigin, getStripe, resolvePriceByLookupKey, STRIPE_INTEGRATION_IDENTIFIER } from "@/lib/billing/stripe/client";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { alertOperations } from "@/lib/security/alert-webhook";
import { db, schema } from "@/lib/db";
import { safeLog } from "@/lib/utils/log";

const { profiles } = schema;

const PLAN_SLUGS = new Set(CATALOG_PLANS.map((plan) => plan.slug));
const BILLING_PERIODS = new Set(["monthly", "annual"]);
const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * POST /api/billing/checkout — cria a Checkout Session (mode subscription)
 * do plano escolhido e devolve `{ url }` para o client redirecionar.
 *
 * Regras da spec/skills travadas aqui:
 * - `payment_method_types` NUNCA é enviado (dynamic payment methods — o
 *   Dashboard decide Pix/cartão/Link por cliente).
 * - `automatic_tax` desligado (Stripe Tax não cobre o Brasil).
 * - OwnerId no `client_reference_id` (campo oficial); metadata só como
 *   fallback em `subscription_data.metadata`.
 * - `integration_identifier` (API 2026-03-25+): label do fluxo com sufixo
 *   de 8 letras para tracking no Dashboard.
 * - Fulfillment JAMAIS aqui: só o webhook ativa o plano.
 */
export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "manage" });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const limited = await rateLimit(request, `billing-checkout:${ownerId}`, { max: 10, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ planSlug?: unknown; billing?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const planSlug = typeof parsed.body.planSlug === "string" ? parsed.body.planSlug.trim() : "";
  const billing = typeof parsed.body.billing === "string" ? parsed.body.billing.trim() : "";
  if (!PLAN_SLUGS.has(planSlug) || !BILLING_PERIODS.has(billing)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400, headers: NO_STORE });
  }

  try {
    // O catálogo do Stripe usa sufixos em português (plano_pro_mensal/anual,
    // criados pelo seed e pelas PRICE_DEFINITIONS); o client envia monthly/annual.
    const periodSuffix = billing === "annual" ? "anual" : "mensal";
    const [priceId, profileRows] = await Promise.all([
      resolvePriceByLookupKey(`plano_${planSlug}_${periodSuffix}`),
      db
        .select({ stripeCustomerId: profiles.stripeCustomerId })
        .from(profiles)
        .where(eq(profiles.id, ownerId))
        .limit(1),
    ]);
    if (!priceId) {
      return NextResponse.json(
        {
          error: "price_not_found",
          message: `Preço plano_${planSlug}_${billing} ainda não existe no Stripe — rode scripts/stripe-seed.mjs com a sua API key.`,
        },
        { status: 502, headers: NO_STORE },
      );
    }

    const stripeCustomerId = profileRows[0]?.stripeCustomerId ?? null;
    const origin = billingOrigin(request);
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: ownerId,
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      subscription_data: { metadata: { accountOwnerId: ownerId } },
      success_url: `${origin}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
      integration_identifier: STRIPE_INTEGRATION_IDENTIFIER,
    });

    return NextResponse.json({ url: session.url }, { headers: NO_STORE });
  } catch (error) {
    // Alerta operacional (hardening item 5): cliente com cartão na mão e
    // Stripe fora é receita perdida em silêncio — o dono precisa saber.
    await alertOperations({
      title: "Checkout de plano falhou",
      detail: `owner ${ownerId} — motivo: ${error instanceof Error ? error.message : "unknown"}`,
      kind: "billing_checkout_failed",
    });
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "stripe_unavailable", message: "Stripe não configurado — defina STRIPE_SECRET_KEY (restricted API key rk_…) no ambiente." },
        { status: 503, headers: NO_STORE },
      );
    }
    safeLog("stripe_checkout_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502, headers: NO_STORE });
  }
}
