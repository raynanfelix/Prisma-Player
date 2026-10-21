import { NextResponse } from "next/server";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * Verifica um token de bot do Telegram (getMe) e descobre o chat de entrega
 * (getUpdates - o dono manda /start para o bot). Retorna nome/username/chatId
 * para a tela de integração preencher automaticamente. O token NUNCA é
 * logado nem persistido aqui - só usado na chamada oficial ao Telegram.
 */
export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;
  const limited = await rateLimit(request, `telegram-verify:${ownerId}`, { max: 10, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ token?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const token = typeof parsed.body?.token === "string" ? parsed.body.token.trim() : "";
  if (!/^\d{6,12}:[A-Za-z0-9_-]{30,60}$/.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
    const me = (await meResponse.json()) as { ok?: boolean; result?: { first_name?: string; username?: string } };
    if (!meResponse.ok || !me.ok || !me.result) {
      return NextResponse.json({ error: "telegram_rejected" }, { status: 400, headers: { "cache-control": "no-store" } });
    }

    let chatId = "";
    try {
      const updatesResponse = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=5`, { cache: "no-store" });
      const updates = (await updatesResponse.json()) as { ok?: boolean; result?: Array<{ message?: { chat?: { id?: number } } }> };
      const chat = updates?.result?.find((update) => update.message?.chat?.id)?.message?.chat;
      chatId = chat ? String(chat.id) : "";
    } catch {
      chatId = "";
    }

    return NextResponse.json(
      { ok: true, botName: me.result.first_name ?? "", botUsername: me.result.username ?? "", chatId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "telegram_unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
