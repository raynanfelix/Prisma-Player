/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { PlanCheckoutButton } from "@/features/account/components/BillingCheckoutButtons";

/**
 * Contrato de erro dos botões de checkout (Bug A da auditoria 2026-10-26):
 * o texto exibido é SEMPRE controlado pelo map de CÓDIGO estável - a
 * `message` detalhada do backend (instruções de infra como
 * STRIPE_SECRET_KEY/stripe-seed.mjs) NUNCA aparece na UI; o dono debuga
 * pelo log do servidor. O mistério dos erros genéricos morre no log, não
 * na tela do cliente final.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  fetchMock.mockReset();
});

function renderButton(): Root {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => {
    root.render(<PlanCheckoutButton planSlug="pro" label="Assinar este plano" />);
  });
  return root;
}

async function clickAndSettle(): Promise<void> {
  await act(async () => {
    (document.querySelector('[data-slot="button"]') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

const alertText = () => document.querySelector('[role="alert"]')?.textContent ?? "";

describe("PlanCheckoutButton - erro controlado por código (Bug A)", () => {
  it("502 price_not_found: mensagem de INFRA do backend nunca aparece - map por código vence", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: "price_not_found",
            message: "Preço plano_pro_mensal ainda não existe no Stripe - rode scripts/stripe-seed.mjs com a sua API key.",
          }),
          { status: 502, headers: { "content-type": "application/json" } },
        ),
    );
    renderButton();

    await clickAndSettle();

    // A instrução de seed NUNCA chega à UI do cliente final...
    expect(alertText()).not.toContain("stripe-seed.mjs");
    expect(alertText()).not.toContain("API key");
    // ...o texto é o genérico de cobrança do map por código.
    expect(alertText()).toContain("Não foi possível conectar ao serviço de cobrança");
  });

  it("502 sem message mantém o fallback honesto", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "price_not_found" }), { status: 502, headers: { "content-type": "application/json" } }),
    );
    renderButton();

    await clickAndSettle();

    expect(alertText()).toContain("Não foi possível conectar ao serviço de cobrança");
  });

  it("503 stripe_unavailable com message de setup de infra: genérica na UI, nunca STRIPE_SECRET_KEY", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: "stripe_unavailable",
            message: "Stripe não configurado - defina STRIPE_SECRET_KEY (restricted API key rk_…) no ambiente.",
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
    );
    renderButton();

    await clickAndSettle();

    expect(alertText()).not.toContain("STRIPE_SECRET_KEY");
    expect(alertText()).toContain("Não foi possível conectar ao serviço de cobrança");
  });

  it("409 sem_stripe_customer devolve a mensagem de produto do map", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "sem_stripe_customer" }), { status: 409, headers: { "content-type": "application/json" } }),
    );
    renderButton();

    await clickAndSettle();

    expect(alertText()).toContain("Nenhuma compra via Stripe nesta conta ainda");
  });

  it("rede caída (fetch rejeita) devolve a mensagem de rede normalizada", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    renderButton();

    await clickAndSettle();

    expect(alertText()).not.toContain("fetch failed");
    expect(alertText()).toContain("Não foi possível conectar ao servidor");
  });
});
