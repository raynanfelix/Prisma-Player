import "server-only";
import { NextResponse } from "next/server";

export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export type ParsedBody<T> = { ok: true; body: T } | { ok: false; response: NextResponse };

function tooLarge(maxBytes: number): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: "payload_too_large", maxBytes }, { status: 413 }) };
}

/**
 * Lê e valida o corpo JSON medindo os bytes reais.
 *
 * Confiar apenas no header `content-length` deixava passar qualquer cliente que
 * usasse `Transfer-Encoding: chunked`, que não envia esse header — o teto de
 * payload era opcional para quem quisesse ignorá-lo.
 */
export async function readJsonBody<T>(request: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<ParsedBody<T>> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge(maxBytes);

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid_body" }, { status: 400 }) };
  }
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return tooLarge(maxBytes);

  try {
    return { ok: true, body: (raw ? JSON.parse(raw) : {}) as T };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid_json" }, { status: 400 }) };
  }
}
