/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { CATALOG_PLANS } from "@/lib/billing/catalog";
import { BillingPlansShowcase } from "@/features/account/components/BillingPlansShowcase";

/**
 * Toggle mensal/anual da vitrine de planos (spec Impecável, item 3): o ciclo
 * muda o preço exibido, o selo "à vista/ano" e o `billing` que o botão envia
 * ao /api/billing/checkout. Fetch mockado SEM sucesso — o redirect nunca
 * acontece e o teste prova o corpo do POST + a mensagem de erro honesta.
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

function renderShowcase(props: Partial<Parameters<typeof BillingPlansShowcase>[0]> = {}): Root {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => {
    root.render(
      <BillingPlansShowcase plans={CATALOG_PLANS} currentPlanSlug={null} showPortal={false} hasPlan={false} {...props} />,
    );
  });
  return root;
}

/** pt-BR usa NBSP entre "R$" e o valor — normaliza para asserções legíveis. */
const norm = (text: string) => text.replace(/\u00A0/g, " ");

const cycleButtons = () => Array.from(document.querySelectorAll('[role="group"] button')) as HTMLButtonElement[];
const cardPrice = (index: number) => norm(document.querySelectorAll("article p.text-3xl")[index]!.textContent ?? "");
const checkoutButtons = () => Array.from(document.querySelectorAll('article [data-slot="button"]')) as HTMLButtonElement[];

describe("BillingPlansShowcase — toggle mensal/anual", () => {
  it("padrão ANUAL: preço grande é o equivalente mensal e cada card mostra o valor à vista/ano", () => {
    renderShowcase();

    expect(cardPrice(0)).toContain("R$ 45");
    expect(cardPrice(1)).toContain("R$ 98");
    expect(cardPrice(2)).toContain("R$ 230");

    const body = norm(document.body.textContent ?? "");
    expect(body).toContain("Cobrado R$ 539 à vista/ano — economize 34%");
    expect(body).toContain("Cobrado R$ 1.175 à vista/ano — economize 34%");
    expect(body).toContain("Cobrado R$ 2.759 à vista/ano — economize 34%");

    expect(cycleButtons()[1]!.getAttribute("aria-pressed")).toBe("true");
    expect(cycleButtons()[0]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggle para MENSAL troca os preços, some o selo à vista e atualiza aria-pressed", () => {
    renderShowcase();

    act(() => {
      cycleButtons()[0]!.click();
    });

    expect(cardPrice(0)).toContain("R$ 68");
    expect(cardPrice(1)).toContain("R$ 148");
    expect(cardPrice(2)).toContain("R$ 348");
    expect(norm(document.body.textContent ?? "")).not.toContain("à vista/ano");

    expect(cycleButtons()[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(cycleButtons()[1]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("o botão de checkout envia o ciclo selecionado — annual por padrão, monthly após o toggle", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ message: "indisponível agora" }), { status: 400 }));
    renderShowcase();

    await act(async () => {
      checkoutButtons()[1]!.click(); // card do plano Pro, ciclo padrão annual
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/billing/checkout");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ planSlug: "pro", billing: "annual" });

    act(() => {
      cycleButtons()[0]!.click(); // MENSAL
    });
    await act(async () => {
      checkoutButtons()[0]!.click(); // card Iniciante, ciclo mensal
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ planSlug: "iniciante", billing: "monthly" });

    // Erro honesto inline (sem redirect — o fetch não devolveu { url }).
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("indisponível agora");
  });

  it("plano atual e portal continuam respeitados: card do plano vigente sem botão", () => {
    renderShowcase({ currentPlanSlug: "pro", showPortal: false, hasPlan: true });

    const cards = Array.from(document.querySelectorAll("article"));
    expect(norm(cards[1]!.textContent ?? "")).toContain("Seu plano atual");
    expect(checkoutButtons()).toHaveLength(2);
    expect(norm(cards[0]!.textContent ?? "")).toContain("Mudar para este plano");
  });
});
