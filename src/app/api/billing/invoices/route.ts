import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getStripe } from "@/lib/billing/stripe/client";
import { guard } from "@/lib/api/guard";
import { rateLimit } from "@/lib/security/rate-limit";
import { alertOperations } from "@/lib/security/alert-webhook";
import { db, schema } from "@/lib/db";
import { safeLog } from "@/lib/utils/log";

const { profiles } = schema;

const NO_STORE = { "cache-control": "no-store" } as const;

/** Fatura enxuta da tela Faturamento - só o que a UI renderiza. */
type InvoiceSummary = {
  id: string;
  number: string | null;
  created_at: string;
  total_cents: number;
  currency: string;
  status: string;
  hosted_invoice_url: string | null;
};

/**
 * GET /api/billing/invoices - últimas faturas do customer do Stripe
 * (spec Billing Completo, item 3: tela Faturamento em Configurações).
 *
 * Sem `profiles.stripe_customer_id` (nunca comprou via Stripe) devolve
 * `{ invoices: [] }` - a tela mostra o estado vazio honesto, não um erro.
 * O PDF/fatura hospedada abre direto no Stripe (`hosted_invoice_url`).
 */
export async function GET(request: Request) {
  const gate = await guard(request, { role: "manage" });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;

  const limited = await rateLimit(request, `billing-invoices:${ownerId}`, { max: 20, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  try {
    const [profile] = await db
      .select({ stripeCustomerId: profiles.stripeCustomerId })
      .from(profiles)
      .where(eq(profiles.id, ownerId))
      .limit(1);
    const customerId = profile?.stripeCustomerId ?? null;
    if (!customerId) {
      return NextResponse.json({ invoices: [] }, { headers: NO_STORE });
    }

    const page = await getStripe().invoices.list({ customer: customerId, limit: 12 });
    const invoices: InvoiceSummary[] = page.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number ?? null,
      created_at: new Date(invoice.created * 1000).toISOString(),
      total_cents: invoice.total,
      currency: invoice.currency,
      status: invoice.status ?? "draft",
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    }));
    return NextResponse.json({ invoices }, { headers: NO_STORE });
  } catch (error) {
    // Alerta operacional (mesma régua das outras rotas de billing): dono
    // precisa saber se a tela de faturas está cega.
    await alertOperations({
      title: "Listagem de faturas falhou",
      detail: `owner ${ownerId} - motivo: ${error instanceof Error ? error.message : "unknown"}`,
      kind: "billing_invoices_failed",
    });
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "stripe_unavailable", message: "Stripe não configurado - defina STRIPE_SECRET_KEY (restricted API key rk_…) no ambiente." },
        { status: 503, headers: NO_STORE },
      );
    }
    safeLog("stripe_invoices_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502, headers: NO_STORE });
  }
}
