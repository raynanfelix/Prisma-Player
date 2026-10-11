"use client";

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: ApiErrorPayload | null;

  constructor(status: number, payload: ApiErrorPayload | null, fallback: string) {
    super(payload?.message || payload?.error || fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.error || "request_failed";
    this.payload = payload;
  }
}

type JsonRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function readPayload(response: Response): Promise<ApiErrorPayload | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null) as Promise<ApiErrorPayload | null>;
}

/**
 * Cliente HTTP único para componentes do navegador.
 *
 * Mantém cookies de sessão, normaliza erros e evita que cada tela implemente
 * novamente serialização e parsing de respostas. URLs externas continuam
 * proibidas aqui; uploads assinados possuem serviços próprios.
 */
export async function apiRequest<T>(path: `/${string}`, init: JsonRequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined;
  if (hasBody && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    throw new ApiError(response.status, payload, `A solicitação falhou (${response.status}).`);
  }

  return (payload ?? {}) as T;
}
