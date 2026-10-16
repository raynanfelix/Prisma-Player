import { NextResponse } from "next/server";
import { shouldRequireHmac, verifyWebhookSecret, verifyWebhookSignature } from "@/lib/billing/abacatepay/webhook";
import type { AbacateWebhook } from "@/lib/billing/abacatepay/types";
import { rateLimit } from "@/lib/security/rate-limit";
import { processAbacateWebhook, type AbacateWebhookOutcome } from "@/lib/billing/webhook-flow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Billing pode custar caro em erro repetido, entao o rate limit fecha a porta
  // (failClosed) quando o contador ficar indisponivel.
  const limited = await rateLimit(request, "webhook:abacatepay", { max: 60, windowMs: 60_000, failClosed: true });
  if (limited) {
    console.warn("AbacatePay webhook rate limited");
    return limited;
  }

  const url = new URL(request.url);
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature")
    || request.headers.get("x-abacate-signature")
    || request.headers.get("x-signature");
  const validSecret = verifyWebhookSecret(url.searchParams.get("webhookSecret"));
  const validSignature = verifyWebhookSignature(rawBody, signature);
  // Ambos os mecanismos provam conhecimento do mesmo secret cadastrado, entao
  // historicamente qualquer um basta. Com ABACATEPAY_REQUIRE_HMAC=true a
  // assinatura HMAC no header passa a ser exigida e o secret da URL nao basta.
  if (shouldRequireHmac() ? !validSignature : !validSecret && !validSignature) {
    console.warn("AbacatePay webhook authentication failed", { validSecret, validSignature, hasSignature: Boolean(signature) });
    return NextResponse.json({ error: "invalid_webhook_signature" }, { status: 401 });
  }

  let event: AbacateWebhook;
  try {
    event = JSON.parse(rawBody) as AbacateWebhook;
  } catch {
    return NextResponse.json({ error: "invalid_webhook_json" }, { status: 400 });
  }
  if (!event?.event || !event.data) return NextResponse.json({ error: "invalid_webhook" }, { status: 400 });

  return respondToWebhookFlow(await processAbacateWebhook(event, rawBody));
}

function respondToWebhookFlow(outcome: AbacateWebhookOutcome): NextResponse {
  switch (outcome.status) {
    case "duplicate": return NextResponse.json({ ok: true, duplicate: true });
    case "ignored": return NextResponse.json({ ok: true, ignored: true });
    case "processed": return NextResponse.json({ ok: true });
    case "failed": return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
  }
}
