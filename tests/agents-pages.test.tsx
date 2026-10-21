/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";
import ContactPage from "@/app/contact/page";
import DevelopersPage from "@/app/developers/page";

/**
 * Itens 4 e 5 "Is Agentic" (Ora): render básico das novas páginas públicas
 * /contact (trust anchor) e /developers (descobribilidade dev) - ao menos um
 * h1, corpo substancial (≥500 chars) e nenhum erro de render.
 */

// Ambiente act do React: sem a flag, act() não flusha efeitos no happy-dom.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Nav/Footer das páginas públicas não navegam nestes testes; fora do App
// Router, hooks de navegação lançam "invariant expected app router...".
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

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

describe("página /contact", () => {
  it("renderiza h1, corpo ≥500 chars e canal de contato sem erro", async () => {
    const errors: unknown[] = [];
    window.addEventListener("error", (event) => {
      errors.push(event.error ?? event.message);
    });

    await mount(<ContactPage />);

    const h1 = document.querySelector("h1");
    expect(h1?.textContent).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text.length).toBeGreaterThanOrEqual(500);
    expect(text).toContain("1 dia útil");
    expect(text).toContain("raynanbarbosa803@gmail.com");
    expect(text).toContain("/privacy");
    expect(text).toContain("/terms");
    expect(errors).toHaveLength(0);
  });
});

describe("página /developers", () => {
  it("renderiza o h1 exigido pelo Ora, endpoints e corpo ≥500 chars sem erro", async () => {
    const errors: unknown[] = [];
    window.addEventListener("error", (event) => {
      errors.push(event.error ?? event.message);
    });

    await mount(<DevelopersPage />);

    const h1 = document.querySelector("h1");
    expect(h1?.textContent).toBe("Prisma Player - Recursos para desenvolvedores e agentes");

    const text = document.body.textContent ?? "";
    expect(text.length).toBeGreaterThanOrEqual(500);
    expect(text).toContain("/api/openapi.json");
    expect(text).toContain("/llms.txt");
    expect(text).toContain("Accept: text/markdown");
    expect(text).toContain("/contact");
    expect(errors).toHaveLength(0);
  });
});
