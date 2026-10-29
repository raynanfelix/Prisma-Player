import "server-only";

/**
 * Validação server-side do Cloudflare Turnstile.
 *
 * O widget do Turnstile (client-side) gera um token efêmero que é enviado
 * junto com o formulário. Este módulo valida esse token contra a API da
 * Cloudflare ANTES de processar qualquer ação sensível (login, signup,
 * recuperação de senha). Sem esta validação, o widget aparece mas não
 * protege nada.
 *
 * Env necessária: CLOUDFLARE_TURNSTILE_SECRET_KEY
 * (secret key gerada no dashboard Cloudflare → Turnstile → widget)
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { success: true }
  | { success: false; errorCodes: string[] };

/**
 * Valida o token do Turnstile contra a API da Cloudflare.
 * Retorna { success: true } se válido, ou { success: false, errorCodes } se inválido.
 *
 * Em caso de erro de rede/timeout na própria validação, retorna success: false
 * com error-code "network_error" — fail-closed por segurança.
 */
export async function verifyTurnstileToken(token: string | undefined | null): Promise<TurnstileResult> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Secret não configurada: em dev pode ser intencional, em prod é erro de config.
    // Fail-open em dev (permite login), fail-closed em prod (bloqueia).
    if (process.env.NODE_ENV === "production") {
      console.error("[turnstile] CLOUDFLARE_TURNSTILE_SECRET_KEY ausente em produção — bloqueando.");
      return { success: false, errorCodes: ["missing_secret"] };
    }
    // Dev/preview: log warning mas permite (desenvolvedor pode não ter a key local)
    console.warn("[turnstile] CLOUDFLARE_TURNSTILE_SECRET_KEY ausente — pulando validação em dev.");
    return { success: true };
  }

  if (!token || typeof token !== "string" || token.length === 0) {
    return { success: false, errorCodes: ["missing_token"] };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[turnstile] API retornou HTTP ${response.status}`);
      return { success: false, errorCodes: [`http_${response.status}`] };
    }

    const data = (await response.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };

    if (data.success) {
      return { success: true };
    }

    return {
      success: false,
      errorCodes: data["error-codes"] ?? ["unknown"],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[turnstile] Erro na validação: ${message}`);
    return { success: false, errorCodes: ["network_error"] };
  }
}