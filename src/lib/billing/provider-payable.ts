import "server-only";
import type { AbacateCheckout } from "./abacatepay/types";

type ProviderPayableView = Pick<AbacateCheckout, "devMode" | "amount" | "currency">;

/**
 * Fail-closed: so ativa quando o checkout do provedor nao esta em devMode e,
 * para status PAID, amount (centavos) e currency conferem com o registro local.
 * Usado pela reconciliacao, que consulta a API do provedor antes de decidir.
 */
export function providerPayable(provider: ProviderPayableView, checkout: { amount_cents: number }): boolean {
  return provider.devMode !== true
    && provider.amount === checkout.amount_cents
    && provider.currency === "BRL";
}

/**
 * Visao do payload de webhook: o objeto de checkout nem sempre vem completo no
 * evento, e o devMode do topo do evento ja e checado a parte pelo handler.
 * Regras:
 * - `devMode: true` no objeto do checkout bloqueia sempre;
 * - amount presente e divergente do registro local bloqueia;
 * - currency presente e diferente de BRL bloqueia;
 * - campos ausentes NAO bloqueiam — o payload do provedor nem sempre traz o
 *   objeto completo, e a reconciliacao reconfere amount/currency contra a API
 *   antes de qualquer reprocessamento.
 */
export function providerWebhookPayable(view: Record<string, unknown> | null | undefined, storedAmountCents: number): boolean {
  if (!view) return true;
  if (view.devMode === true) return false;
  const amount = typeof view.amount === "number" ? view.amount : view.amount == null ? null : Number(view.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount !== storedAmountCents)) return false;
  const currency = typeof view.currency === "string" ? view.currency.trim().toUpperCase() : "";
  if (currency && currency !== "BRL") return false;
  return true;
}
