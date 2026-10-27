"use client";

import { GENERIC_ERROR_MESSAGES } from "@/lib/errors";

export interface ApiErrorPayload {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: ApiErrorPayload | null;

  constructor(status: number, payload: ApiErrorPayload | null, fallback: string, code?: string) {
    super(payload?.message || payload?.error || fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = code || payload?.error || "request_failed";
    this.payload = payload;
  }
}

type JsonRequestInit = Omit<RequestInit, "body" | "signal"> & {
  body?: unknown;
  signal?: AbortSignal;
};

/**
 * Cliente HTTP único para componentes do navegador.
 *
 * Mantém cookies de sessão, normaliza erros e evita que cada tela implemente
 * novamente serialização e parsing de respostas. URLs externas continuam
 * proibidas aqui; uploads assinados possuem serviços próprios.
 *
 * Timeout padrão: 10 segundos. Para cancelar uma requisição, passe um
 * AbortSignal criado com `AbortController`.
 */
export async function apiRequest<T>(
  path: `/${string}`,
  init: JsonRequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined;
  if (hasBody && !headers.has("content-type")) headers.set("content-type", "application/json");

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 10_000);

  // Bug B (auditoria 2026-10-26): o contrato deste módulo é "normaliza
  // erros", mas o fetch estava sem try/catch - TypeError de rede ("fetch
  // failed") e AbortError do timeout propagavam crus para TODOS os
  // consumidores, que podiam exibir texto interno de infra na UI. Aqui é a
  // FONTE: falha de rede/timeout vira ApiError com status 0 e mensagem
  // amigável genérica - o detalhe interno morre no navegador.
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal: abortController.signal,
      credentials: "same-origin",
      headers,
      body: hasBody ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, null, GENERIC_ERROR_MESSAGES.networkUnavailable, "network_unavailable");
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await readPayload(response);

  if (!response.ok) {
    throw new ApiError(response.status, payload, `A solicitação falhou (${response.status}).`);
  }

  return (payload ?? {}) as T;
}

async function readPayload(response: Response): Promise<ApiErrorPayload | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null) as Promise<ApiErrorPayload | null>;
}