import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { getStripe } from "@/lib/billing/stripe/client";
import { guard } from "@/lib/api/guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { alertOperations } from "@/lib/security/alert-webhook";
import { db, schema } from "@/lib/db";
import { safeLog } from "@/lib/utils/log";

const { profiles } = schema;

const NO_STORE = { "cache-control": "no-store" } as const;

type CardSummary = {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
};

function toCardSummary(paymentMethod: Stripe.PaymentMethod | null | undefined): CardSummary | null {
  const card = paymentMethod?.card;
  if (!card) return null;
  return { brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year };
}

/**
 * GET /api/billing/payment-method — cartão padrão do customer do Stripe
 * (spec Billing Completo, item 3: tela Faturamento em Configurações).
 *
 * No SDK 23 (API 2026-03-25) o cartão de assinatura vive em
 * `invoice_settings.default_payment_method` — vem EXPANDIDO na retrieve
 * (sem expand o campo é só o id `pm_…`). Sem customer OU sem cartão →
 * `{ card: null }` ("Nenhum método salvo"). A TROCA de cartão nunca
 * acontece aqui — o botão "Atualizar cartão" abre o Customer Portal
 * (caminho canônico do Stripe).
 */
export async function GET(request: Request) {
  const gate = await guard(request, { role: "manage" });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const limited = await rateLimit(request, `billing-payment-method:${ownerId}`, { max: 20, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  try {
    const [profile] = await db
      .select({ stripeCustomerId: profiles.stripeCustomerId })
      .from(profiles)
      .where(eq(profiles.id, ownerId))
      .limit(1);
    const customerId = profile?.stripeCustomerId ?? null;
    if (!customerId) {
      return NextResponse.json({ card: null }, { headers: NO_STORE });
    }

    const customer = await getStripe().customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    // Customer deletado no Stripe (DeletedCustomer.deleted = true) não tem
    // mais configuração de cobrança — trata como "sem método salvo".
    if (customer.deleted) {
      return NextResponse.json({ card: null }, { headers: NO_STORE });
    }
    const paymentMethod = customer.invoice_settings?.default_payment_method ?? null;
    const card = toCardSummary(typeof paymentMethod === "object" ? paymentMethod : null);
    return NextResponse.json({ card }, { headers: NO_STORE });
  } catch (error) {
    // Alerta operacional (mesma régua das outras rotas de billing).
    await alertOperations({
      title: "Leitura do método de pagamento falhou",
      detail: `owner ${ownerId} — motivo: ${error instanceof Error ? error.message : "unknown"}`,
      kind: "billing_payment_method_failed",
    });
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "stripe_unavailable", message: "Stripe não configurado — defina STRIPE_SECRET_KEY (restricted API key rk_…) no ambiente." },
        { status: 503, headers: NO_STORE },
      );
    }
    safeLog("stripe_payment_method_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502, headers: NO_STORE });
  }
}
