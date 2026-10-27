import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../src/services/http/client";

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes JSON and keeps same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest<{ ok: boolean }>("/api/example", {
      method: "POST",
      body: { name: "Prisma" },
    })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/example", expect.objectContaining({
      body: JSON.stringify({ name: "Prisma" }),
      credentials: "same-origin",
      method: "POST",
    }));
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("normalizes API failures without exposing implementation details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "video_not_found", message: "Vídeo não encontrado." }),
      { status: 404, headers: { "content-type": "application/json" } },
    )));

    const error = await apiRequest("/api/videos/missing").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: "video_not_found",
      message: "Vídeo não encontrado.",
    });
  });

  it("rede caída vira ApiError normalizada - nunca TypeError cru 'fetch failed'", async () => {
    // Bug B (auditoria 2026-10-26): o contrato do módulo promete "normaliza
    // erros", mas o fetch estava sem try/catch - TypeError de rede e
    // AbortError de timeout propagavam crus e qualquer consumidor podia
    // exibir "fetch failed" na UI.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const error = await apiRequest("/api/example").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).code).toBe("network_unavailable");
    // A mensagem é amigável e genérica - o texto interno "fetch failed"
    // NUNCA chega ao consumidor.
    expect((error as ApiError).message).toBe("Não foi possível conectar ao servidor. Tente novamente.");
    expect((error as ApiError).message).not.toContain("fetch");
  });

  it("timeout (AbortError do abort de 10s) também vira ApiError normalizada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")));

    const error = await apiRequest("/api/example").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("network_unavailable");
    expect((error as ApiError).message).not.toContain("aborted");
  });
});
