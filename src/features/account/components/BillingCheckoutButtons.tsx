"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GENERIC_ERROR_MESSAGES } from "@/lib/errors";

/**
 * Botões reais de checkout/portal da página de Billing (Opção A - Stripe
 * Checkout hospedado). A rota devolve `{ url }` e o client redireciona; o
 * fulfillment NUNCA acontece aqui - a ativação vem do webhook.
 *
 * Bug A (auditoria 2026-10-26): o contrato antigo propagava a `message`
 * detalhada do backend ("Diagnóstico REAL" da spec Billing Completo,
 * item 0) - certo quando o dono era o único usuário, vazamento de infra
 * num produto multi-tenant. Agora o texto exibido é SEMPRE controlado
 * aqui, mapeado por CÓDIGO estável - mesmo padrão do DangerZone.
 */

const CHECKOUT_ERROR_MESSAGES: Record<string, string> = {
  stripe_unavailable: GENERIC_ERROR_MESSAGES.billingUnavailable,
  price_not_found: GENERIC_ERROR_MESSAGES.billingUnavailable,
  rate_limited: "Muitas tentativas seguidas - aguarde um minuto e tente de novo.",
  sem_stripe_customer: "Nenhuma compra via Stripe nesta conta ainda - assine um plano antes de gerenciar a assinatura.",
  network_unavailable: GENERIC_ERROR_MESSAGES.networkUnavailable,
};

type CheckoutResult = { ok: true; url: string } | { ok: false; message: string };

async function requestCheckoutUrl(endpoint: string, body: Record<string, unknown>): Promise<CheckoutResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (response.ok && typeof result?.url === "string") return { ok: true, url: result.url };
    // Map por código estável: a mensagem do servidor NUNCA é exibida cru -
    // ela carrega detalhe operacional que pertence ao log, não à UI.
    const code = typeof result?.error === "string" ? result.error : "";
    return { ok: false, message: CHECKOUT_ERROR_MESSAGES[code] ?? "Não foi possível iniciar agora - tente novamente." };
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGES.networkUnavailable };
  }
}

function CheckoutError({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

function Spinner() {
  return <LoaderCircle className="size-4 animate-spin" aria-hidden />;
}

/** Botão de plano: cria a Checkout Session (subscription) e redireciona. */
export function PlanCheckoutButton({ planSlug, label, billing = "monthly" }: { planSlug: string; label: string; billing?: "monthly" | "annual" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const result = await requestCheckoutUrl("/api/billing/checkout", { planSlug, billing });
    if (result.ok) {
      window.location.assign(result.url);
      return; // segue loading até o redirect sair da página
    }
    setError(result.message);
    setLoading(false);
  }

  return (
    <>
      <Button type="button" className="mt-5 w-full text-xs" disabled={loading} onClick={() => void start()}>
        {loading ? <Spinner /> : null}
        {loading ? "Redirecionando…" : label}
      </Button>
      {error ? <CheckoutError message={error} /> : null}
    </>
  );
}

/** Botão de pacote de créditos: Checkout one-time e redireciona. */
export function CreditsCheckoutButton({ packageSlug }: { packageSlug: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const result = await requestCheckoutUrl("/api/billing/ai-credits/checkout", { packageSlug });
    if (result.ok) {
      window.location.assign(result.url);
      return;
    }
    setError(result.message);
    setLoading(false);
  }

  return (
    <>
      <Button type="button" className="mt-1 w-full text-xs" disabled={loading} onClick={() => void start()}>
        {loading ? <Spinner /> : null}
        {loading ? "Redirecionando…" : "Comprar"}
      </Button>
      {error ? <CheckoutError message={error} /> : null}
    </>
  );
}

/** Portal de autoatendimento (upgrade/downgrade/cancelar/cartão). */
export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const result = await requestCheckoutUrl("/api/billing/portal", {});
    if (result.ok) {
      window.location.assign(result.url);
      return;
    }
    setError(result.message);
    setLoading(false);
  }

  return (
    <>
      <Button type="button" className="h-9 rounded-xl text-xs" disabled={loading} onClick={() => void start()}>
        {loading ? <Spinner /> : null}
        {loading ? "Abrindo…" : "Gerenciar assinatura"}
      </Button>
      {error ? <CheckoutError message={error} /> : null}
    </>
  );
}

/**
 * Troca de plano por card (spec Billing Completo, item 2): assinatura ativa
 * do Stripe → cada card ≠ atual abre o Customer Portal, que é o caminho
 * canônico de upgrade/downgrade (nunca reescrever o que o Stripe dá pronto).
 *
 * Pendência do dono: a config do portal com `subscription_update` exige o
 * claim do sandbox no Dashboard - o botão já nasce pronto; até lá o portal
 * abre com faturas/cancelamento/cartão.
 */
export function PlanSwitchButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const result = await requestCheckoutUrl("/api/billing/portal", {});
    if (result.ok) {
      window.location.assign(result.url);
      return;
    }
    setError(result.message);
    setLoading(false);
  }

  return (
    <>
      <Button type="button" className="mt-5 w-full text-xs" disabled={loading} onClick={() => void start()}>
        {loading ? <Spinner /> : null}
        {loading ? "Abrindo portal…" : "Mudar para este plano"}
      </Button>
      {error ? <CheckoutError message={error} /> : null}
    </>
  );
}
