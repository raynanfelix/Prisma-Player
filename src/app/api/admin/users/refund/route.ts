import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { REFUND_WINDOW_DAYS } from "@/lib/billing/catalog";
import { getStripe } from "@/lib/billing/stripe/client";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { alertOperations } from "@/lib/security/alert-webhook";
import { db, schema } from "@/lib/db";

const { profiles } = schema;

const NO_STORE = { "cache-control": "no-store" } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

/**
 * POST /api/admin/users/refund (spec Pagamentos, item 4): reembolso manual
 * do último pagamento da conta via Stripe. Ação sensível com janela curta -
 * charges pagos há mais de `REFUND_WINDOW_DAYS` dias são recusados (a
 * contestação vira caminho do chargeback, não do suporte).
 *
 * Fluxo: profile → stripeCustomerId → último charge pago (o mais recente
 * com status succeeded entre os 5 últimos) → refunds.create (integral).
 * Sem customer ou sem charge pago → 404. O trilha do motivo vai no alerta
 * operacional (kind refund_issued) e o webhook `charge.refunded` que já
 * existe avisa o cliente no inbox.
 */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-refund:${gate.adminId}`, { max: 10, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ userId?: unknown; reason?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const userId = String(parsed.body?.userId ?? "");
  if (!uuid.test(userId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers: NO_STORE });
  // Motivo obrigatório na UI (AdminConfirm); aqui é aceito e vai no trilha
  // do alerta - o corpo oficial da spec é {userId}.
  const reason = String(parsed.body?.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 280);

  const [profile] = await db
    .select({ id: profiles.id, stripeCustomerId: profiles.stripeCustomerId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!profile) return NextResponse.json({ error: "account_not_found" }, { status: 404, headers: NO_STORE });
  const customerId = profile.stripeCustomerId ?? null;
  if (!customerId) {
    return NextResponse.json({ error: "stripe_customer_not_found", message: "A conta nunca comprou via Stripe - não há cobrança para reembolsar." }, { status: 404, headers: NO_STORE });
  }

  try {
    const charges = await getStripe().charges.list({ customer: customerId, limit: 5 });
    const paid = charges.data.find((charge) => charge.status === "succeeded") ?? null;
    if (!paid) {
      return NextResponse.json({ error: "paid_charge_not_found", message: "Nenhum pagamento concluído recente nesta conta." }, { status: 404, headers: NO_STORE });
    }

    if (paid.created * 1000 < Date.now() - REFUND_WINDOW_DAYS * DAY_MS) {
      return NextResponse.json(
        { error: "refund_window_expired", message: `Janela de reembolso de ${REFUND_WINDOW_DAYS} dias encerrada para este pagamento.` },
        { status: 400, headers: NO_STORE },
      );
    }

    const refund = await getStripe().refunds.create({ charge: paid.id });
    // Trilha operacional (spec, item 4): quem reembolsou, quanto e por quê.
    await alertOperations({
      title: "Reembolso emitido pelo admin",
      detail: `admin ${gate.adminId} reembolsou ${paid.amount} centavos (charge ${paid.id}) da conta ${userId}${reason ? ` - motivo: ${reason}` : ""}`,
      kind: "refund_issued",
    });
    return NextResponse.json({ refunded: true, charge_id: paid.id, refund_id: refund.id, amount_cents: refund.amount ?? paid.amount }, { headers: NO_STORE });
  } catch (error) {
    // Padrão das rotas de billing: falha nunca é silenciosa (o dono precisa
    // saber que um reembolso pedido não saiu) e não vaza detalhe do Stripe.
    await alertOperations({
      title: "Reembolso admin falhou",
      detail: `admin ${gate.adminId}, conta ${userId} - motivo: ${error instanceof Error ? error.message : "unknown"}`,
      kind: "refund_failed",
    });
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "stripe_unavailable", message: "Stripe não configurado - defina STRIPE_SECRET_KEY (restricted API key rk_…) no ambiente." },
        { status: 503, headers: NO_STORE },
      );
    }
    return NextResponse.json({ error: "stripe_unavailable" }, { status: 502, headers: NO_STORE });
  }
}
