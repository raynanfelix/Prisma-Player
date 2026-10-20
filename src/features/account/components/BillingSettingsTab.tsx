"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountOverview, BillingCard, BillingInvoice } from "@/features/account/model/types";
import { formatBRL } from "@/lib/billing/catalog";
import { accountSettingsService } from "@/services/account/settings";
import { ApiError } from "@/services/http/client";
import { SettingsCard, SettingsSkeleton } from "./SettingsUi";
import { CancelSurvey } from "./CancelSurvey";

/**
 * Tela Faturamento (spec Billing Completo, item 3): assinatura atual,
 * método de pagamento e faturas — tudo REAL, vindo das rotas
 * /api/billing/invoices e /api/billing/payment-method (guard manage).
 *
 * A assinatura atual vem do overview que a página de Configurações já
 * carrega (banco: subscriptions + billing_plans). Troca de cartão e
 * cancelamento pertencem ao Customer Portal do Stripe — nunca aqui.
 */

const SUB_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-[#B9FF66] text-[#191A23]" },
  past_due: { label: "Pagamento pendente", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  pending: { label: "Pendente", className: "bg-slate-500/10 text-slate-500 dark:text-zinc-400" },
  suspended: { label: "Suspensa", className: "bg-slate-500/10 text-slate-500 dark:text-zinc-400" },
  cancelled: { label: "Cancelada", className: "bg-slate-500/10 text-slate-500 dark:text-zinc-400" },
  expired: { label: "Expirada", className: "bg-slate-500/10 text-slate-500 dark:text-zinc-400" },
  none: { label: "Sem assinatura", className: "bg-slate-500/10 text-slate-500 dark:text-zinc-400" },
};

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  paid: { label: "Pago", className: "bg-[#B9FF66] text-[#191A23]" },
  open: { label: "Aberta", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  void: { label: "Anulada", className: "bg-slate-500/10 text-slate-500 dark:text-zinc-400" },
  draft: { label: "Rascunho", className: "bg-slate-500/10 text-slate-500 dark:text-zinc-400" },
  uncollectible: { label: "Não cobrada", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  discover: "Discover",
  jcb: "JCB",
  diners: "Diners Club",
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

function formatCardExpiry(card: BillingCard): string {
  const month = String(card.exp_month).padStart(2, "0");
  return `${month}/${String(card.exp_year)}`;
}

function formatAmount(cents: number, currency: string): string {
  if (currency.toLowerCase() === "brl") return formatBRL(cents);
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

type PanelStatus = "loading" | "ready" | "failed";

export function BillingSettingsTab({
  overview,
  notify,
}: {
  overview: AccountOverview | null;
  notify: (message: string) => void;
}) {
  const [invoices, setInvoices] = useState<BillingInvoice[] | null>(null);
  const [card, setCard] = useState<BillingCard | null>(null);
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [updatingCard, setUpdatingCard] = useState(false);

  const load = useCallback(async () => {
    // Regra react-hooks/set-state-in-effect: todo setState acontece APÓS o
    // primeiro await — nada síncrono no corpo do efeito que o chama.
    try {
      const [invoicesData, cardData] = await Promise.all([
        accountSettingsService.getInvoices(),
        accountSettingsService.getPaymentMethod(),
      ]);
      setInvoices(invoicesData.invoices);
      setCard(cardData.card);
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }, []);

  useEffect(() => {
    // load é async: todo setState acontece APÓS o primeiro await (nenhum
    // setState síncrono no corpo do efeito) — a regra não atravessa a
    // chamada de função (mesmo padrão do TeamPanel).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function retryLoad() {
    // setState em event handler (não em efeito) — o carregamento vira skeleton.
    setStatus("loading");
    await load();
  }

  async function updateCard() {
    if (updatingCard) return;
    setUpdatingCard(true);
    try {
      const { url } = await accountSettingsService.openBillingPortal();
      window.location.assign(url);
    } catch (error) {
      setUpdatingCard(false);
      notify(error instanceof ApiError ? error.message : "Não foi possível abrir o portal de cobrança agora.");
    }
  }

  if (!overview || status === "loading") {
    return <SettingsSkeleton />;
  }

  // Verdade efetiva vem do SERVIDOR (access.subscriptionActive =
  // isSubscriptionEffective — status active E período vigente). Reler o
  // relógio no client seria renderização impura e duplicaria a regra de
  // negócio; linha `active` com período vencido exibe como "Expirada".
  const subscription = overview.subscription;
  const periodEnd = subscription?.currentPeriodEnd ?? null;
  const effectiveActive = overview.access.subscriptionActive;
  const statusKey = !subscription
    ? "none"
    : subscription.status === "active" && !effectiveActive
      ? "expired"
      : subscription.status;
  const subStatus = SUB_STATUS[statusKey] ?? SUB_STATUS.none;
  const isStripe = subscription?.provider === "stripe";

  return (
    <div className="space-y-5">
      {status === "failed" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          <span>Não foi possível carregar suas informações de cobrança agora.</span>
          <Button type="button" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => void retryLoad()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {/* Assinatura atual */}
      <SettingsCard
        title="Assinatura atual"
        description="Plano, situação e o fim do período vigente — do banco de assinaturas do Prisma Player."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-[#191A23] dark:text-white">{overview.plan?.name ?? "Nenhum plano"}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
              {subscription ? `Válido até ${formatDate(periodEnd)}` : "Assine um plano para liberar o acesso completo."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${subStatus.className}`}>{subStatus.label}</span>
            <CancelSurvey active={effectiveActive && isStripe} notify={notify} />
          </div>
        </div>
      </SettingsCard>

      {/* Método de pagamento */}
      <SettingsCard
        title="Método de pagamento"
        description="O cartão salvo no Stripe usado nas renovações — a troca é feita no portal de cobrança."
      >
        {status === "ready" ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            {card ? (
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <CreditCard className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#191A23] dark:text-white">
                    {BRAND_LABELS[card.brand] ?? card.brand} •••• {card.last4}
                  </p>
                  <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Validade {formatCardExpiry(card)}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <CreditCard className="size-5" aria-hidden />
                </span>
                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                  Nenhum método salvo — ao assinar, seu cartão fica salvo no Stripe.
                </p>
              </div>
            )}
            <Button
              type="button"
              className="h-9 rounded-xl bg-[#B9FF66] text-xs font-bold text-[#191A23] hover:bg-[#a6ee50]"
              disabled={updatingCard}
              onClick={() => void updateCard()}
            >
              {updatingCard ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {updatingCard ? "Abrindo…" : "Atualizar cartão"}
            </Button>
          </div>
        ) : (
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Carregando método de pagamento…</p>
        )}
      </SettingsCard>

      {/* Faturas */}
      <SettingsCard
        title="Faturas"
        description="Últimas 12 faturas — o PDF hospedado abre direto no Stripe."
      >
        {status !== "ready" ? (
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Carregando faturas…</p>
        ) : (invoices?.length ?? 0) === 0 ? (
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
            Nenhuma fatura ainda — suas compras via Stripe aparecem aqui automaticamente.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs font-medium text-[#191A23] dark:text-zinc-200">
              <thead className="border-b border-slate-100 bg-slate-50 uppercase text-slate-500 font-semibold dark:border-zinc-800 dark:bg-card dark:text-zinc-400">
                <tr>
                  <th className="p-3.5">Fatura</th>
                  <th className="p-3.5">Data</th>
                  <th className="p-3.5">Valor</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {(invoices ?? []).map((invoice) => {
                  const invoiceStatus = INVOICE_STATUS[invoice.status] ?? {
                    label: invoice.status,
                    className: "bg-slate-500/10 text-slate-500 dark:text-zinc-400",
                  };
                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50/50 dark:hover:bg-transparent">
                      <td className="p-3.5 font-bold text-[#191A23] dark:text-white">
                        {invoice.number ?? invoice.id}
                        <span className="block text-[10px] font-normal text-slate-400 dark:text-zinc-500">{invoice.id}</span>
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-zinc-400">{formatDate(invoice.created_at)}</td>
                      <td className="p-3.5 font-bold text-[#191A23] dark:text-white">
                        {formatAmount(invoice.total_cents, invoice.currency)}
                      </td>
                      <td className="p-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${invoiceStatus.className}`}>
                          {invoice.status === "paid" ? <CheckCircle2 size={12} aria-hidden /> : null}
                          {invoiceStatus.label}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        {invoice.hosted_invoice_url ? (
                          <a
                            href={invoice.hosted_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#191A23] dark:text-zinc-400 dark:hover:text-white"
                          >
                            <Download size={14} aria-hidden /> PDF
                          </a>
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
