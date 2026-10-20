/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";
import UserActions from "@/components/admin/UserActions";

// Bug reportado pelo dono: suspender conta em trial (sem linha de assinatura)
// falhava com "Falhou: subscription_not_found" — a rota /api/admin/users/status
// exige uma subscription para suspender. O correto é a UI não oferecer a ação
// quando não há assinatura (estado honesto no lugar do botão).

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const userId = "00000000-0000-4000-8000-000000000000";
const plans = [{ slug: "escala", name: "Plano Escala" }];

// Ambiente act do React: sem a flag, act() não flusha efeitos no happy-dom.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

async function mount(node: ReactElement) {
  const container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function openPanel() {
  const manage = [...document.querySelectorAll("button")].find((button) => button.textContent === "Gerenciar");
  if (!manage) throw new Error("botão Gerenciar ausente");
  act(() => { manage.click(); });
}

function buttonTexts() {
  return [...document.querySelectorAll("button")].map((button) => button.textContent ?? "");
}

describe("UserActions — suspender depende de assinatura", () => {
  it("sem assinatura (subStatus null): não oferece Suspender e mostra estado honesto", async () => {
    await mount(<UserActions userId={userId} email="cliente@teste.dev" plans={plans} subStatus={null} />);
    openPanel();
    expect(buttonTexts()).not.toContain("Suspender");
    expect(document.body.textContent).toContain("Trial / sem assinatura");
    // Trocar plano permanece: sem plano é upgrade, não suspensão.
    expect(buttonTexts()).toContain("Trocar plano");
  });

  it("com assinatura ativa: oferece Suspender", async () => {
    await mount(<UserActions userId={userId} email="cliente@teste.dev" plans={plans} subStatus="active" />);
    openPanel();
    expect(buttonTexts()).toContain("Suspender");
    expect(document.body.textContent).not.toContain("Trial / sem assinatura");
  });

  it("com assinatura suspensa: oferece Reativar (não Suspender)", async () => {
    await mount(<UserActions userId={userId} email="cliente@teste.dev" plans={plans} subStatus="suspended" />);
    openPanel();
    expect(buttonTexts()).toContain("Reativar");
    expect(buttonTexts()).not.toContain("Suspender");
  });
});
