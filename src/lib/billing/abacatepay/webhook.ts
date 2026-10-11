import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { BILLING } from "@/lib/constants";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Legacy secret AbacatePay appends to the webhook URL (`?webhookSecret=`) and
 * historically used as the HMAC key. Keep it only as the legacy URL-secret /
 * auth-fallback mechanism (see `verifyWebhookSignature` below).
 */
function urlSecret(): string | null {
  return process.env.ABACATEPAY_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Effective HMAC key for signature verification. When
 * `ABACATEPAY_WEBHOOK_SIGNING_SECRET` is set it is the ONLY accepted key —
 * it is meant to be registered on a webhook URL WITHOUT `?webhookSecret=`, so
 * it never travels in any URL.
 *
 * RH-02: a chave HMAC nunca pode ser o próprio secret que viaja na URL
 * (`ABACATEPAY_WEBHOOK_SECRET` é anexado pelo provedor a cada entrega e aparece
 * em logs de acesso). Sem uma chave de assinatura DISTINTA configurada, a
 * verificação HMAC fica indisponível (fail-closed) — quem tem a URL do webhook
 * não pode forjar assinatura.
 */
function signingKey(): string | null {
  const dedicated = process.env.ABACATEPAY_WEBHOOK_SIGNING_SECRET?.trim() || null;
  if (dedicated) return dedicated;
  const legacy = process.env.ABACATEPAY_WEBHOOK_SECRET?.trim() || null;
  if (!legacy) return null;
  console.warn("AbacatePay HMAC disabled: ABACATEPAY_WEBHOOK_SIGNING_SECRET must be set to a value distinct from the webhook URL secret");
  return null;
}

/**
 * Pode o `?webhookSecret=` da URL autenticar uma entrega? Por padrao NAO
 * (fail-closed); habilite apenas com `ABACATEPAY_ALLOW_URL_SECRET=true` quando
 * precisar manter o fallback legado, jamais em producao.
 */
function allowUrlSecret(): boolean {
  return process.env.ABACATEPAY_ALLOW_URL_SECRET === "true";
}

/**
 * When HMAC must be required:
 * - `ABACATEPAY_REQUIRE_HMAC=true` forces it always;
 * - in production it is required by default (secure-by-default), unless
 *   `ABACATEPAY_ALLOW_URL_SECRET=true` is set explicitly to keep accepting
 *   URL-secret-only deliveries;
 * - outside production the historical OR fallback is kept unless
 *   `ABACATEPAY_REQUIRE_HMAC=true`.
 */
export function shouldRequireHmac(): boolean {
  if (process.env.ABACATEPAY_REQUIRE_HMAC === "true") return true;
  if (process.env.ABACATEPAY_ALLOW_URL_SECRET === "true") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * The secret AbacatePay appends to the webhook URL (`?webhookSecret=`).
 * Rejected by default (`ABACATEPAY_ALLOW_URL_SECRET=false`). The dedicated
 * signing secret is NEVER accepted through the URL.
 */
export function verifyWebhookSecret(received: string | null): boolean {
  if (!allowUrlSecret()) return false;
  const configured = urlSecret();
  if (!configured) return false;
  return Boolean(received && safeEqual(received, configured));
}

/**
 * AbacatePay signs the raw payload with HMAC-SHA256 using the registered
 * webhook `secret`, not an asymmetric key.
 *
 * A chave aceita é SEMPRE `ABACATEPAY_WEBHOOK_SIGNING_SECRET`, distinta do
 * secret que viaja na URL (ver `signingKey` / RH-02). Sem ela, a verificação
 * HMAC fica indisponível e o handler decide pela política de
 * `shouldRequireHmac` (em produção a entrega é rejeitada).
 *
 * The digest encoding is not pinned by the provider docs, so hex and base64 are
 * both accepted, along with the common `sha256=` prefix. Returns false when no
 * signature is present so the caller can fall back to the URL secret.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = signingKey();
  if (!signature || !secret) return false;

  const received = signature.trim().replace(/^sha256=/i, "");
  if (!received || received.length > BILLING.WEBHOOK_SIGNATURE_MAX_LENGTH) return false;

  const digest = createHmac("sha256", secret).update(Buffer.from(rawBody, "utf8")).digest();

  return safeEqual(digest.toString("hex"), received.toLowerCase())
    || safeEqual(digest.toString("base64"), received);
}