import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { billingOrigin, getStripe } from "@/lib/billing/stripe/client";
import { guard } from "@/lib/api/guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { alertOperations } from "@/lib/security/alert-webhook";
import { GENERIC_ERROR_MESSAGES } from "@/lib/errors";
import { db, schema } from "@/lib/db";
import { safeLog } from "@/lib/utils/log";

const { profiles } = schema;

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * POST /api/billing/portal - sessão do Customer Portal (upgrade/downgrade,
 * cancelamento, troca de cartão). Exige `profiles.stripe_customer_id`
 * (gravado pelo webhook na primeira compra): sem customer do Stripe não há
 * o que gerenciar → 409 sem_stripe_customer.
 */
export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "manage" });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const limited = await rateLimit(request, `billing-portal:${ownerId}`, { max: 10, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const [profile] = await db
    .select({ stripeCustomerId: profiles.stripeCustomerId })
    .from(profiles)
    .where(eq(profiles.id, ownerId))
    .limit(1);
  const customerId = profile?.stripeCustomerId ?? null;
  if (!customerId) {
    return NextResponse.json(
      { error: "sem_stripe_customer", message: "Nenhuma compra via Stripe nesta conta ainda - assine um plano antes de gerenciar a assinatura." },
      { status: 409, headers: NO_STORE },
    );
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${billingOrigin(request)}/dashboard/billing`,
    });
    return NextResponse.json({ url: session.url }, { headers: NO_STORE });
  } catch (error) {
    // Alerta operacional (hardening item 5): portal fora = cliente sem como
    // cancelar/trocar cartão - situação que vira chargeback.
    await alertOperations({
      title: "Portal de cobrança falhou",
      detail: `owner ${ownerId} - motivo: ${error instanceof Error ? error.message : "unknown"}`,
      kind: "billing_portal_failed",
    });
    if (!process.env.STRIPE_SECRET_KEY) {
      // Bug A: instrução de setup não vai ao cliente - alertOperations já
      // levou o motivo ao dono.
      return NextResponse.json(
        { error: "stripe_unavailable", message: GENERIC_ERROR_MESSAGES.billingUnavailable },
        { status: 503, headers: NO_STORE },
      );
    }
    safeLog("stripe_portal_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502, headers: NO_STORE });
  }
}
