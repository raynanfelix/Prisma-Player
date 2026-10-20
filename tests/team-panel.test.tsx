/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { TeamPanel } from "@/features/account/components/TeamPanel";

/**
 * Aba Equipe das Configurações (spec Impecável, item 4): UI reflete o
 * contrato REAL do /api/account/team — convites sempre pendentes (sem envio
 * de e-mail), assentos por plano com mensagem honesta "Seu plano permite
 * N assentos — faça upgrade" e o aceite dos convites endereçados ao próprio
 * usuário (sem este card, um convite nunca seria visto nem aceito).
 */

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn();
const notify = vi.fn();

type TeamPayload = {
  team?: { name: string };
  currentRole?: string;
  seats?: number;
  members?: Array<Record<string, unknown>>;
  invites?: Array<Record<string, unknown>>;
  invitations?: Array<Record<string, unknown>>;
  status?: number;
  error?: string;
};

function respondWith(payload: TeamPayload): void {
  const status = payload.status ?? 200;
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/account/team" && status === 404) {
      return jsonResponse({ error: payload.error ?? "team_not_found", invitations: payload.invitations ?? [] }, 404);
    }
    if (url === "/api/account/team") {
      return jsonResponse({
        team: payload.team ?? { name: "Minha Operação" },
        currentRole: payload.currentRole ?? "owner",
        seats: payload.seats ?? 3,
        members: payload.members ?? [],
        invites: payload.invites ?? [],
        invitations: payload.invitations ?? [],
      });
    }
    return jsonResponse({ invited: true });
  });
}

const member = (id: string, email: string, role = "owner", status = "active") => ({
  id,
  user_id: `user-${id}`,
  role,
  status,
  joined_at: "2026-01-01T10:00:00.000Z",
  profile: { id: `user-${id}`, email, full_name: null, avatar_url: null },
});

const invite = (id: string, email: string, role = "viewer") => ({
  id,
  email,
  role,
  status: "pending",
  expires_at: "2026-10-27T12:00:00.000Z",
  created_at: "2026-10-20T12:00:00.000Z",
});

function renderPanel(): void {
  act(() => {
    createRoot(document.body.appendChild(document.createElement("div"))).render(
      <I18nProvider>
        <TeamPanel notify={notify} />
      </I18nProvider>,
    );
  });
}

/** React controla o input: só o setter nativo + evento input atualiza o estado. */
function setEmailValue(value: string): void {
  const input = document.querySelector("input[type='email']") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});

const text = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  notify.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  fetchMock.mockReset();
});

describe("TeamPanel — aba Equipe das Configurações", () => {
  it("lista membros e convites pendentes com papel, status real e data de expiração", async () => {
    respondWith({
      seats: 5,
      members: [member("m1", "dono@prisma.test"), member("m2", "ana@prisma.test", "editor")],
      invites: [invite("i1", "novo@prisma.test", "analyst")],
    });
    renderPanel();
    await flush();

    expect(text()).toContain("Minha Operação");
    expect(text()).toContain("dono@prisma.test");
    expect(text()).toContain("ana@prisma.test");
    expect(text()).toContain("Convite pendente · Analista");
    expect(text()).toContain("expira em 27/10/2026");
    expect(text()).toContain("3 de 5 acessos utilizados");
    expect(text()).toContain("Ativo");
  });

  it("plano de 1 assento: formulário desativado com a mensagem honesta de upgrade (sem nomes antigos)", async () => {
    respondWith({ seats: 1, members: [member("m1", "dono@prisma.test")] });
    renderPanel();
    await flush();

    expect(text()).toContain("Seu plano permite 1 assento (só você) — faça upgrade para o Pro ou Escala para convidar.");
    expect(text()).not.toContain("Prime Growth"); // copy stale do catálogo antigo
    const inviteButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Convidar"));
    expect(inviteButton?.disabled).toBe(true);
  });

  it("assentos esgotados: aviso honesto com o número do plano e Convidar desativado ANTES do erro 409", async () => {
    respondWith({
      seats: 3,
      members: [member("m1", "dono@prisma.test"), member("m2", "a@prisma.test", "editor"), member("m3", "b@prisma.test", "viewer")],
    });
    renderPanel();
    await flush();

    expect(text()).toContain("Seu plano permite 3 assentos — faça upgrade para convidar mais pessoas.");
    const inviteButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Convidar"));
    expect(inviteButton?.disabled).toBe(true);
  });

  it("convidar: POST com e-mail e papel — e a mensagem fala a verdade (criar conta), não 'enviado por e-mail'", async () => {
    respondWith({ seats: 3, members: [member("m1", "dono@prisma.test")] });
    renderPanel();
    await flush();

    const emailInput = document.querySelector("input[type='email']") as HTMLInputElement;
    act(() => {
      setEmailValue("nova@prisma.test");
    });
    const inviteButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Convidar"));
    act(() => {
      inviteButton!.click();
    });
    await flush();

    const postCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/account/team" && (init as RequestInit).method === "POST");
    expect(postCall).toBeTruthy();
    expect(JSON.parse(String((postCall![1] as RequestInit).body))).toEqual({ email: "nova@prisma.test", role: "viewer" });

    expect(notify).toHaveBeenCalledWith(expect.stringContaining("ao criar conta com este e-mail"));
    const notified = String(notify.mock.calls[0]?.[0] ?? "");
    expect(notified).not.toContain("enviado por e-mail");
  });

  it("convite limitado (409): mensagem honesta com o número de assentos do plano", async () => {
    respondWith({ seats: 3, members: [member("m1", "dono@prisma.test")] });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/team" && init?.method === "POST") {
        return jsonResponse({ error: "seat_limit_reached" }, 409);
      }
      if (url === "/api/account/team") {
        return jsonResponse({
          team: { name: "Minha Operação" }, currentRole: "owner", seats: 3,
          members: [member("m1", "dono@prisma.test")], invites: [], invitations: [],
        });
      }
      return jsonResponse({});
    });
    renderPanel();
    await flush();

    const emailInput = document.querySelector("input[type='email']") as HTMLInputElement;
    act(() => {
      setEmailValue("nova@prisma.test");
    });
    act(() => {
      Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Convidar"))!.click();
    });
    await flush();

    expect(notify).toHaveBeenCalledWith("Seu plano permite 3 assentos — faça upgrade para convidar mais pessoas.");
  });

  it("convites endereçados a ESTE usuário: card 'Convites para você' e aceite via POST action=accept", async () => {
    respondWith({
      seats: 3,
      members: [member("m1", "dono@prisma.test")],
      invitations: [{ id: "inv_9", role: "editor", expires_at: "2026-10-27T12:00:00.000Z", team: { name: "Agência Canal 5" } }],
    });
    renderPanel();
    await flush();

    expect(text()).toContain("Convites para você");
    expect(text()).toContain("Agência Canal 5");
    expect(text()).toContain("Papel: Editor");

    act(() => {
      Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Aceitar e entrar"))!.click();
    });
    await flush();

    const acceptCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/account/team" && (init as RequestInit).method === "POST");
    expect(JSON.parse(String((acceptCall![1] as RequestInit).body))).toEqual({ action: "accept", inviteId: "inv_9" });
    expect(notify).toHaveBeenCalledWith("Você entrou na equipe.");
  });

  it("conta sem equipe (404): convites recebidos continuam aceitáveis; sem convites, estado vazio honesto", async () => {
    respondWith({ status: 404, invitations: [{ id: "inv_1", role: "viewer", expires_at: null, team: { name: "Outra Operação" } }] });
    renderPanel();
    await flush();

    expect(text()).toContain("Convites para você");
    expect(text()).toContain("Outra Operação");
    expect(text()).toContain("Aceitar e entrar");

    document.body.innerHTML = "";
    fetchMock.mockReset();
    respondWith({ status: 404, invitations: [] });
    renderPanel();
    await flush();

    expect(text()).toContain("Nenhuma equipe vinculada a esta conta no momento.");
  });
});
