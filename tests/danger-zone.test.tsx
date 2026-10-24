/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { DangerZone } from "@/features/account/components/DangerZone";

/**
 * Zona de perigo da exclusão de conta (P1 da spec de conta): explica o que é
 * apagado, exige digitar EXCLUIR e um fator de identidade (senha OU código
 * OTP por e-mail para contas SSO-only) antes de chamar /api/account/delete.
 */

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const { routerMocks } = vi.hoisted(() => ({
  routerMocks: { replace: vi.fn(), refresh: vi.fn() },
}));

// next/navigation fora do App Router do Next não tem provider: mock do hook
// com o mesmo contrato (replace/refresh) usado pelo componente.
vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

const fetchMock = vi.fn();
const notify = vi.fn();

/** React controla o input: só o setter nativo + evento input atualizam o estado. */
function setNativeValue(input: HTMLInputElement, value: string): void {
  const prototype = input.type === "password" ? window.HTMLInputElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderZone(): void {
  act(() => {
    createRoot(document.body.appendChild(document.createElement("div"))).render(
      <DangerZone email="titular@prisma.test" notify={notify} />,
    );
  });
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});

const text = () => document.body.textContent ?? "";

function buttonWith(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  expect(button, `botão "${label}" deveria existir`).toBeTruthy();
  return button as HTMLButtonElement;
}

function fillConfirmation(value: string): void {
  const input = document.querySelector("[data-testid='danger-zone-confirmation']") as HTMLInputElement;
  act(() => {
    setNativeValue(input, value);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  notify.mockClear();
  routerMocks.replace.mockClear();
  routerMocks.refresh.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => jsonResponse({ deleted: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("DangerZone - apagar conta (/dashboard/settings, aba Segurança)", () => {
  it("explica o que é apagado e a irreversibilidade, sem travessões no copy", () => {
    renderZone();

    expect(text()).toContain("Zona de perigo: apagar conta");
    expect(text()).toContain("Esta ação é irreversível. Não há como recuperar a conta depois.");
    expect(text()).toContain("Vídeos e arquivos no armazenamento são removidos em definitivo.");
    expect(text()).toContain("A assinatura ativa é cancelada no provedor de pagamento.");
    expect(text()).toContain("Digite EXCLUIR");
    expect(text()).not.toContain("—");
  });

  it("botão de exclusão fica desativado até digitar EXCLUIR e informar a senha", () => {
    renderZone();
    const confirmButton = buttonWith("Apagar minha conta");
    expect(confirmButton.disabled).toBe(true);

    act(() => {
      fillConfirmation("EXCLUIR");
    });
    expect(confirmButton.disabled).toBe(true);

    act(() => {
      setNativeValue(document.querySelector("[data-testid='danger-zone-password']") as HTMLInputElement, "senha-atual");
    });
    expect(confirmButton.disabled).toBe(false);

    act(() => {
      fillConfirmation("APAGAR");
    });
    expect(confirmButton.disabled).toBe(true);
  });

  it("com EXCLUIR + senha chama /api/account/delete com confirm e password", async () => {
    renderZone();
    act(() => {
      fillConfirmation("EXCLUIR");
      setNativeValue(document.querySelector("[data-testid='danger-zone-password']") as HTMLInputElement, "senha-atual");
    });
    act(() => {
      buttonWith("Apagar minha conta").click();
    });
    await flush();

    const call = fetchMock.mock.calls.find(([url]) => url === "/api/account/delete");
    expect(call).toBeTruthy();
    expect((call![1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ confirm: "EXCLUIR", password: "senha-atual" });
  });

  it("senha errada (403): mensagem amigável junto ao fluxo, sem redirecionar", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
    fetchMock.mockImplementation(async () => jsonResponse({ error: "invalid_password" }, 403));
    renderZone();
    act(() => {
      fillConfirmation("EXCLUIR");
      setNativeValue(document.querySelector("[data-testid='danger-zone-password']") as HTMLInputElement, "errada");
    });
    act(() => {
      buttonWith("Apagar minha conta").click();
    });
    await flush();

    expect(notify).toHaveBeenCalledWith("A senha não confere.");
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });

  it("conta SSO-only: envia o código (stage request-otp), mostra o campo OTP e chama delete com otp", async () => {
    renderZone();
    act(() => {
      fillConfirmation("EXCLUIR");
      buttonWith("Conta sem senha: usar código").click();
    });
    expect(text()).toContain("Enviamos um código de 6 dígitos para o seu e-mail");

    act(() => {
      buttonWith("Enviar código por e-mail").click();
    });
    await flush();

    const sendCall = fetchMock.mock.calls.find(([, init]) => JSON.parse(String((init as RequestInit).body)).stage === "request-otp");
    expect(sendCall).toBeTruthy();
    expect(JSON.parse(String((sendCall![1] as RequestInit).body))).toEqual({ stage: "request-otp" });
    expect(text()).toContain("Código de confirmação");

    act(() => {
      setNativeValue(document.querySelector("input[autocomplete='one-time-code']") as HTMLInputElement, "123456");
    });
    act(() => {
      buttonWith("Apagar minha conta").click();
    });
    await flush();

    const deleteCall = fetchMock.mock.calls.find(([, init]) => {
      const body = JSON.parse(String((init as RequestInit).body));
      return body.confirm === "EXCLUIR";
    });
    expect(deleteCall).toBeTruthy();
    expect(JSON.parse(String((deleteCall![1] as RequestInit).body))).toEqual({ confirm: "EXCLUIR", otp: "123456" });
    // Sucesso: sai da área logada com replace + refresh (mesmo mecanismo do logout).
    expect(routerMocks.replace).toHaveBeenCalledWith("/");
    expect(routerMocks.refresh).toHaveBeenCalled();
  });
});
