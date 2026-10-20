/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { AccountOverview } from "@/features/account/model/types";
import { BillingSettingsTab } from "@/features/account/components/BillingSettingsTab";
import { CancelSurvey } from "@/features/account/components/CancelSurvey";
import { ApiError } from "@/services/http/client";

/**
 * Tela Faturamento (spec Billing Completo, item 3) + pesquisa de churn
 * (item 4): render com o serviço mockado — dados reais das rotas, estados
 * vazios honestos e o fluxo completo de cancelamento (survey → oferta →
 * portal; a pesquisa NUNCA bloqueia o cancelamento).
 */

const { getInvoicesMock, getPaymentMethodMock, openBillingPortalMock, submitChurnSurveyMock } = vi.hoisted(() => ({
  getInvoicesMock: vi.fn(),
  getPaymentMethodMock: vi.fn(),
  openBillingPortalMock: vi.fn(),
  submitChurnSurveyMock: vi.fn(),
}));

vi.mock("@/services/account/settings", () => ({
  accountSettingsService: {
    getInvoices: getInvoicesMock,
    getPaymentMethod: getPaymentMethodMock,
    openBillingPortal: openBillingPortalMock,
    submitChurnSurvey: submitChurnSurveyMock,
  },
}));

const norm = (text: string) => text.replace(/\u00A0/g, " ");

const OVERVIEW_ACTIVE_STRIPE: AccountOverview = {
  access: { trialStatus: "used", trialEndsAt: null, subscriptionActive: true, hasAccess: true },
  subscription: { status: "active", currentPeriodEnd: "2027-01-15T12:00:00.000Z", billingMethod: "card", provider: "stripe" },
  plan: { name: "Plano Pro", included_plays: 50_000, storage_gb: 0, prisma_ai_analyses: 50, team_seats: 3 },
  usage: { plays: 1, storageBytes: 0, videos: 1, aiCredits: 0, aiUsed: 0 },
};

const OVERVIEW_ACTIVE_LEGACY: AccountOverview = {
  ...OVERVIEW_ACTIVE_STRIPE,
  subscription: { status: "active", currentPeriodEnd: "2027-01-15T12:00:00.000Z", billingMethod: "pix", provider: "abacatepay" },
};

const OVERVIEW_EMPTY: AccountOverview = {
  access: { trialStatus: "used", trialEndsAt: null, subscriptionActive: false, hasAccess: false },
  subscription: null,
  plan: null,
  usage: { plays: 0, storageBytes: 0, videos: 0, aiCredits: 0, aiUsed: 0 },
};

const notifyMock = vi.fn();

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function renderOverview(overview: AccountOverview): Root {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => {
    root.render(<BillingSettingsTab overview={overview} notify={notifyMock} />);
  });
  return root;
}

function renderSurvey(active = true): Root {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => {
    root.render(<CancelSurvey active={active} notify={notifyMock} />);
  });
  return root;
}

/** React rastreia o value do input — setter nativo + evento input. */
function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

const findButton = (label: string): HTMLButtonElement =>
  Array.from(document.querySelectorAll("button")).find((button) => norm(button.textContent ?? "").includes(label)) as HTMLButtonElement;

beforeEach(() => {
  getInvoicesMock.mockReset();
  getPaymentMethodMock.mockReset();
  openBillingPortalMock.mockReset();
  submitChurnSurveyMock.mockReset();
  notifyMock.mockReset();
  getInvoicesMock.mockResolvedValue({
    invoices: [
      { id: "in_123", number: "2026-001", created_at: "2026-10-01T12:00:00.000Z", total_cents: 14790, currency: "brl", status: "paid", hosted_invoice_url: "https://invoice.stripe.com/i/in_123" },
      { id: "in_456", number: "2026-002", created_at: "2026-09-01T12:00:00.000Z", total_cents: 6790, currency: "brl", status: "void", hosted_invoice_url: null },
    ],
  });
  getPaymentMethodMock.mockResolvedValue({ card: { brand: "visa", last4: "4242", exp_month: 8, exp_year: 2028 } });
  openBillingPortalMock.mockResolvedValue({ url: "https://billing.stripe.com/session" });
  submitChurnSurveyMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BillingSettingsTab — tela Faturamento (item 3)", () => {
  it("assinatura ativa do Stripe: plano, status, cartão e faturas reais renderizam", async () => {
    renderOverview(OVERVIEW_ACTIVE_STRIPE);
    await act(async () => {
      await flush();
    });

    const body = norm(document.body.textContent ?? "");
    expect(body).toContain("Plano Pro");
    expect(body).toContain("Ativa");
    expect(body).toContain("Válido até");
    expect(body).toContain("2027");
    expect(body).toContain("Visa •••• 4242");
    expect(body).toContain("Validade 08/2028");
    expect(body).toContain("2026-001");
    expect(body).toContain("R$ 148");
    expect(body).toContain("Pago");
    expect(body).toContain("Anulada");
    expect(findButton("Cancelar assinatura")).toBeTruthy();

    const pdfLink = document.querySelector('a[href="https://invoice.stripe.com/i/in_123"]');
    expect(pdfLink).not.toBeNull();
  });

  it("sem assinatura e sem customer: estados vazios honestos e sem botão de cancelar", async () => {
    getInvoicesMock.mockResolvedValue({ invoices: [] });
    getPaymentMethodMock.mockResolvedValue({ card: null });
    renderOverview(OVERVIEW_EMPTY);
    await act(async () => {
      await flush();
    });

    const body = norm(document.body.textContent ?? "");
    expect(body).toContain("Nenhum plano");
    expect(body).toContain("Sem assinatura");
    expect(body).toContain("Nenhum método salvo");
    expect(body).toContain("Nenhuma fatura ainda");
    expect(findButton("Cancelar assinatura")).toBeUndefined();
  });

  it("assinatura legada (AbacatePay): ativa, mas sem cancelar pelo portal do Stripe", async () => {
    renderOverview(OVERVIEW_ACTIVE_LEGACY);
    await act(async () => {
      await flush();
    });

    expect(norm(document.body.textContent ?? "")).toContain("Ativa");
    expect(findButton("Cancelar assinatura")).toBeUndefined();
  });

  it("falha no carregamento: mensagem honesta com retry", async () => {
    getInvoicesMock.mockRejectedValue(new Error("network"));
    getPaymentMethodMock.mockRejectedValue(new Error("network"));
    renderOverview(OVERVIEW_ACTIVE_STRIPE);
    await act(async () => {
      await flush();
    });

    expect(norm(document.body.textContent ?? "")).toContain("Não foi possível carregar suas informações de cobrança");
    expect(findButton("Tentar de novo")).toBeTruthy();
  });
});

describe("CancelSurvey — pesquisa de churn + oferta honesta (item 4)", () => {
  it("inativo → não renderiza nada", () => {
    renderSurvey(false);
    expect(document.querySelector("button")).toBeNull();
  });

  it("fluxo completo: survey com 'outro' exige texto, envia e mostra a oferta (nunca bloqueia)", async () => {
    renderSurvey(true);

    act(() => {
      findButton("Cancelar assinatura").click();
    });
    expect(norm(document.body.textContent ?? "")).toContain("Por que está cancelando?");

    let submit = findButton("Continuar");
    expect(submit.disabled).toBe(true); // sem reason

    act(() => {
      (document.querySelector('input[type="radio"][value="outro"]') as HTMLInputElement).click();
    });
    submit = findButton("Continuar");
    expect(submit.disabled).toBe(true); // 'outro' exige detalhe

    act(() => {
      setValue(document.querySelectorAll("textarea")[0] as HTMLTextAreaElement, "Minha operação mudou de rumo");
      setValue(document.querySelectorAll("textarea")[1] as HTMLTextAreaElement, "Mais relatórios por e-mail");
    });
    submit = findButton("Continuar");
    expect(submit.disabled).toBe(false);

    await act(async () => {
      submit.click();
      await flush();
    });
    expect(submitChurnSurveyMock).toHaveBeenCalledWith({
      reason: "outro",
      feedback: "Minha operação mudou de rumo",
      improvement: "Mais relatórios por e-mail",
    });

    const body = norm(document.body.textContent ?? "");
    expect(body).toContain("prefere mudar de plano");
    expect(findButton("Mudar plano")).toBeTruthy();
    expect(findButton("Continuar com cancelamento")).toBeTruthy();
    expect(body).toContain("cancelamento é concluído no portal seguro do Stripe");
  });

  it("falha na pesquisa NÃO bloqueia: segue para a oferta e avisa", async () => {
    submitChurnSurveyMock.mockRejectedValue(new Error("db down"));
    renderSurvey(true);

    act(() => {
      findButton("Cancelar assinatura").click();
    });
    act(() => {
      (document.querySelector('input[type="radio"][value="preco"]') as HTMLInputElement).click();
    });
    await act(async () => {
      findButton("Continuar").click();
      await flush();
    });

    expect(norm(document.body.textContent ?? "")).toContain("prefere mudar de plano");
    expect(notifyMock).toHaveBeenCalledWith("Não foi possível registrar sua resposta — pode continuar com o cancelamento.");
  });

  it("CTAs da oferta chamam o portal; erro do portal vira aviso honesto", async () => {
    openBillingPortalMock.mockRejectedValue(
      new ApiError(409, { error: "sem_stripe_customer", message: "Nenhuma compra via Stripe nesta conta ainda." }, "fallback"),
    );
    renderSurvey(true);

    act(() => {
      findButton("Cancelar assinatura").click();
    });
    act(() => {
      (document.querySelector('input[type="radio"][value="nao_uso"]') as HTMLInputElement).click();
    });
    await act(async () => {
      findButton("Continuar").click();
      await flush();
    });

    await act(async () => {
      findButton("Mudar plano").click();
      await flush();
    });
    expect(openBillingPortalMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith("Nenhuma compra via Stripe nesta conta ainda.");
  });

  it("'Manter minha assinatura' volta ao estado inicial sem enviar nada", () => {
    renderSurvey(true);

    act(() => {
      findButton("Cancelar assinatura").click();
    });
    act(() => {
      findButton("Manter minha assinatura").click();
    });

    expect(norm(document.body.textContent ?? "")).not.toContain("Por que está cancelando?");
    expect(findButton("Cancelar assinatura")).toBeTruthy();
    expect(submitChurnSurveyMock).not.toHaveBeenCalled();
  });
});
