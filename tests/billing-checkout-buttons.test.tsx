/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { PlanCheckoutButton } from "@/features/account/components/BillingCheckoutButtons";

/**
 * Diagnóstico REAL no botão (spec Billing Completo, item 0): 502/503 com
 * `message` do backend → a mensagem detalhada aparece inline; sem `message`
 * → o fallback honesto continua. O mistério dos erros genéricos morre aqui.
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

describe("PlanCheckoutButton — erro REAL do backend (item 0)", () => {
  it("502 com message devolve o diagnóstico real (price_not_found) no botão", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: "price_not_found",
            message: "Preço plano_pro_mensal ainda não existe no Stripe — rode scripts/stripe-seed.mjs com a sua API key.",
          }),
          { status: 502, headers: { "content-type": "application/json" } },
        ),
    );
    renderButton();

    await clickAndSettle();

    expect(alertText()).toContain("stripe-seed.mjs");
    expect(alertText()).not.toContain("Catálogo de preços ainda não sincronizado");
  });

  it("502 sem message mantém o fallback honesto", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ error: "price_not_found" }), { status: 502, headers: { "content-type": "application/json" } }),
    );
    renderButton();

    await clickAndSettle();

    expect(alertText()).toContain("Catálogo de preços ainda não sincronizado — rode o seed do Stripe.");
  });

  it("503 com message (Stripe sem config) mostra a orientação real do backend", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: "stripe_unavailable",
            message: "Stripe não configurado — defina STRIPE_SECRET_KEY (restricted API key rk_…) no ambiente.",
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
    );
    renderButton();

    await clickAndSettle();

    expect(alertText()).toContain("STRIPE_SECRET_KEY");
    expect(alertText()).not.toContain("Pagamentos temporariamente indisponíveis");
  });
});
