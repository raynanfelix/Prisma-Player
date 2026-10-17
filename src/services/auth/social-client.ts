"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Cliente browser do Neon Auth (Managed Better Auth).
 *
 * Sem argumentos: o wrapper conversa com o proxy same-origin `/api/auth/*`
 * (catch-all `src/app/api/auth/[...all]/route.ts`), então não precisa de
 * URL nem de variáveis públicas — e as credenciais de sessão continuam
 * saindo só dos cookies do SDK.
 *
 * O `authService` (client.ts) continua sendo a porta para as rotas
 * PRÓPRIAS da aplicação; este cliente existe para os fluxos que o wrapper
 * do Neon precisa conduzir no navegador — hoje, o OAuth social:
 * fora de iframe o plugin Redirect do Better Auth navega sozinho para a
 * URL do Google; dentro de iframe (embed) o wrapper troca por popup.
 */
export const authClient = createAuthClient();

export type SocialSignInResult = { ok: true } | { ok: false; message: string };

/**
 * Inicia o login social com o Google.
 *
 * Em sucesso o navegador sai da página (redirect/popup do wrapper) — o
 * caller não deve esperar retorno além de "iniciado". Erros vêm sempre
 * como mensagem PT-BR pronta para exibir.
 */
export async function signInWithGoogle(callbackURL: string): Promise<SocialSignInResult> {
  try {
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
    if (error) return { ok: false, message: socialErrorMessage(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: socialErrorMessage(error) };
  }
}

/** Erros do social em PT-BR — códigos estáveis do Better Auth/Neon primeiro. */
function socialErrorMessage(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code ?? "").toUpperCase();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();

  if (message.includes("invalid domain") || message.includes("domínio")) {
    return "A origem desta aplicação ainda não foi liberada no Neon Auth. Contate o suporte.";
  }
  if (message.includes("popup") || message.includes("pop-up")) {
    return "O popup do Google foi bloqueado pelo navegador. Permita popups e tente novamente.";
  }
  if (message.includes("provider not found") || code.includes("PROVIDER")) {
    return "O login com Google não está configurado neste ambiente. Use e-mail e senha.";
  }
  if (code.includes("RATE_LIMIT") || code === "TOO_MANY_REQUESTS" || message.includes("rate limit")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (code.startsWith("NETWORK") || code.includes("FETCH") || message.includes("fetch") || message.includes("network")) {
    return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
  }
  return "Não foi possível iniciar o login com o Google. Tente novamente.";
}
