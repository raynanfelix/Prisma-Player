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
});
