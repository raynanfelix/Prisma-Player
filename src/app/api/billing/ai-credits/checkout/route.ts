import { NextResponse } from "next/server";

import { CATALOG_CREDIT_PACKAGES } from "@/lib/billing/catalog";
import { billingOrigin, getStripe, resolvePriceByLookupKey, STRIPE_INTEGRATION_IDENTIFIER } from "@/lib/billing/stripe/client";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { alertOperations } from "@/lib/security/alert-webhook";
import { safeLog } from "@/lib/utils/log";

const NO_STORE = { "cache-control": "no-store" } as const;

/** Sufixo do lookup_key do pacote (`credits-start` → `start`). */
function lookupSuffixOf(packageSlug: string): string {
  return packageSlug.replace(/^credits-/, "");
}

/**
 * POST /api/billing/ai-credits/checkout - Checkout Session one-time
 * (mode payment) do pacote de créditos. Mesmas regras da rota de plano:
 * sem `payment_method_types`, sem `automatic_tax`, owner no
 * `client_reference_id`; a entrega dos créditos acontece SÓ no webhook.
 *
 * Body `{ packageSlug }`: aceita o slug do catálogo (`credits-start`) ou o
 * sufixo puro (`start`) - o lookup_key é sempre `creditos_ia_<sufixo>`.
 */
export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "manage" });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const limited = await rateLimit(request, `billing-credits-checkout:${ownerId}`, { max: 10, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ packageSlug?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const packageSlug = typeof parsed.body.packageSlug === "string" ? parsed.body.packageSlug.trim() : "";
  const pack = CATALOG_CREDIT_PACKAGES.find((item) => item.slug === packageSlug || item.slug === `credits-${packageSlug}`);
  if (!pack) {
    return NextResponse.json({ error: "invalid_package" }, { status: 400, headers: NO_STORE });
  }

  try {
    const priceId = await resolvePriceByLookupKey(`creditos_ia_${lookupSuffixOf(pack.slug)}`);
    if (!priceId) {
      return NextResponse.json(
        {
          error: "price_not_found",
          message: `Preço creditos_ia_${lookupSuffixOf(pack.slug)} ainda não existe no Stripe - rode scripts/stripe-seed.mjs com a sua API key.`,
        },
        { status: 502, headers: NO_STORE },
      );
    }

    const origin = billingOrigin(request);
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: ownerId,
      payment_intent_data: { metadata: { accountOwnerId: ownerId } },
      success_url: `${origin}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
      integration_identifier: STRIPE_INTEGRATION_IDENTIFIER,
    });

    return NextResponse.json({ url: session.url }, { headers: NO_STORE });
  } catch (error) {
    // Alerta operacional (hardening item 5): mesma regra do checkout de plano.
    await alertOperations({
      title: "Checkout de créditos falhou",
      detail: `owner ${ownerId} - motivo: ${error instanceof Error ? error.message : "unknown"}`,
      kind: "billing_credits_checkout_failed",
    });
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "stripe_unavailable", message: "Stripe não configurado - defina STRIPE_SECRET_KEY (restricted API key rk_…) no ambiente." },
        { status: 503, headers: NO_STORE },
      );
    }
    safeLog("stripe_credits_checkout_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502, headers: NO_STORE });
  }
}
