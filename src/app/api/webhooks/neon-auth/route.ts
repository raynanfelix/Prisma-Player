import { after, NextResponse } from "next/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { verifyNeonAuthWebhook } from "@/lib/security/neon-webhook";
import { alertOperations } from "@/lib/security/alert-webhook";
import { ensureAccountBootstrap } from "@/lib/access/bootstrap";

export const runtime = "nodejs";

/**
 * Webhook do Neon Auth (Managed Better Auth) - evento `user.created`.
 *
 * Spec: https://neon.com/docs/auth/guides/webhooks.md - evento non-blocking:
 * "Return 200 immediately and process the event asynchronously". A resposta
 * é sempre minúscula (<10KB) com `no-store`.
 *
 * Assinatura Ed25519 (JWS detached) verificada contra o JWKS do
 * NEON_AUTH_BASE_URL em src/lib/security/neon-webhook.ts. Inválido → 401
 * (4xx não gera retry na Neon). Reentrega do mesmo event id → 200 no-op:
 * a spec da Neon pede a MESMA resposta para duplicados, e o LRU de event
 * ids garante que o bootstrap não rode duas vezes (idempotente por cima,
 * como rede de segurança).
 *
 * Provisionamento instantâneo: `ensureAccountBootstrap` (profiles, access/
 * trial, wallet, inbox, equipe) - o mesmo bootstrap do signup, idempotente.
 */
export async function POST(request: Request) {
  // CRÍTICO: raw body ANTES de qualquer parse - a assinatura é sobre os bytes.
  const raw = await request.text();

  const limited = await rateLimit(request, "neon-webhook", { max: 120, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const event = await verifyNeonAuthWebhook(raw, request.headers);
  if (!event) {
    // Assinatura inválida em produção é sinal de painel/segredo mal
    // configurado ou de tentativa de forja - o dono precisa saber (item 5).
    await alertOperations({
      title: "Webhook do Neon Auth rejeitado",
      detail: "Entrega com assinatura Ed25519 inválida (401). Verifique NEON_AUTH_BASE_URL e os eventos assinados no painel Neon.",
      kind: "neon_auth_invalid_webhook",
    });
    return NextResponse.json({ error: "invalid_webhook" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  if (event.eventType === "user.created" && event.user.id && !event.duplicate) {
    const { id, email, name } = event.user;
    after(async () => {
      await ensureAccountBootstrap({ id, email, name }).catch(async (reason) => {
        console.error("neon_webhook_bootstrap_failed", {
          userId: id,
          reason: reason instanceof Error ? reason.message : "unknown",
        });
        // Signup provisionado de menos = conta quebrada na primeira tela:
        // alerta imediato (item 5) - o retry não existe nesse caminho.
        await alertOperations({
          title: "Bootstrap de conta falhou",
          detail: `user.created de ${id} não provisionou a conta - motivo: ${reason instanceof Error ? reason.message : "unknown"}`,
          kind: "neon_auth_bootstrap_failed",
        });
      });
    });
  }

  // user.before_create é BLOQUEANTE e fail-closed: a spec exige JSON com
  // "allowed" - resposta sem o campo é tratada como FALHA e derruba TODOS os
  // signups com WEBHOOK_DELIVERY_FAILED (aconteceu em produção: o dono
  // assinou todos os eventos no painel). Aqui ninguém é bloqueado no hook;
  // validação de signup fica no fluxo de e-mail/verificação da própria Neon.
  if (event.eventType === "user.before_create") {
    return NextResponse.json({ allowed: true }, { headers: { "cache-control": "no-store" } });
  }

  // send.otp / send.magic_link assinados = a Neon PARA de entregar o
  // e-mail dela e delega pra cá. Nós NÃO temos delivery próprio - logar
  // alto e avisar no painel: remova esses eventos e deixe só user.created.
  if (event.eventType === "send.otp" || event.eventType === "send.magic_link") {
    console.error("neon_webhook_misconfigured_delivery_event", {
      eventType: event.eventType,
      hint: "Remova send.otp/send.magic_link do webhook no painel Neon - deixe apenas user.created; sem delivery próprio, os e-mails da Neon sao engolidos.",
    });
    // 2xx mesmo assim: são eventos BLOCO de fluxo - falhar derrubaria o
    // login/cadastro com WEBHOOK_DELIVERY_FAILED. O e-mail se perde até o
    // painel ser corrigido; melhor 1 pendência que o fluxo inteiro morto.
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }

  // Outros eventTypes e reentregas (duplicate=true): 200 no-op - a resposta
  // dos duplicados é a mesma do primeiro aceito (spec Neon).
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
