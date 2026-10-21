"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botões reais de checkout/portal da página de Billing (Opção A - Stripe
 * Checkout hospedado). A rota devolve `{ url }` e o client redireciona; o
 * fulfillment NUNCA acontece aqui - a ativação vem do webhook.
 *
 * Estados cobertos por botão: idle → loading (spinner) → redirect; erro
 * vira mensagem inline honesta (rate limit, Stripe sem config, catálogo
 * sem seed, portal sem customer…).
 */

type CheckoutResult = { ok: true; url: string } | { ok: false; message: string };

async function requestCheckoutUrl(endpoint: string, body: Record<string, unknown>): Promise<CheckoutResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
    if (response.ok && typeof result?.url === "string") return { ok: true, url: result.url };
    // Diagnóstico REAL (spec Billing Completo, item 0): as rotas de billing
    // devolvem `message` detalhada (price_not_found, stripe_unavailable,
    // sem_stripe_customer…) - ela SEMPRE vence o genérico; o texto padrão
    // só sobrevive quando o backend não mandou nada.
    if (response.status === 429) return { ok: false, message: result?.message ?? "Muitas tentativas seguidas - aguarde um minuto e tente de novo." };
    if (response.status === 409) return { ok: false, message: result?.message ?? "Nenhuma compra via Stripe nesta conta ainda." };
    if (response.status === 503) return { ok: false, message: result?.message ?? "Pagamentos temporariamente indisponíveis - configure o Stripe no ambiente." };
    if (response.status === 502) return { ok: false, message: result?.message ?? "Catálogo de preços ainda não sincronizado - rode o seed do Stripe." };
    return { ok: false, message: result?.message ?? "Não foi possível iniciar agora - tente novamente." };
  } catch {
    return { ok: false, message: "Não foi possível iniciar agora - verifique sua conexão." };
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
