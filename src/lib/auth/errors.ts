import "server-only";

/**
 * Erro devolvido pelos métodos server do SDK Neon Auth
 * (NeonAuthServerApiError): `code` pode ser um código do Better Auth
 * (ex.: INVALID_EMAIL_OR_PASSWORD), um código de rede (NETWORK_*) ou
 * INTERNAL_ERROR.
 */
export type AuthMethodError = {
  message?: string;
  code?: string;
  status?: number;
  statusText?: string;
} | null | undefined;

/**
 * Mensagens em PT-BR para os códigos estáveis do Better Auth.
 */
export function getAuthErrorMessage(error: AuthMethodError, fallback: string): string {
  const code = String(error?.code ?? "").toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();

  if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || message.includes("already registered") || message.includes("already been registered")) {
    return "Este e-mail já possui uma conta. Faça login.";
  }
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PASSWORD" || code === "CREDENTIAL_ACCOUNT_NOT_FOUND" || message.includes("invalid email or password")) {
    return "E-mail ou senha inválidos.";
  }
  // Códigos reais observados em produção: EMAIL_NOT_VERIFIED e
  // email_not_confirmed (Better Auth, "Email verification required").
  if (code === "EMAIL_NOT_VERIFIED" || code.includes("NOT_VERIFIED") || code.includes("NOT_CONFIRMED") || code.includes("UNVERIFIED") || message.includes("not verified") || message.includes("unverified") || message.includes("verification required") || message.includes("verifique seu e-mail")) {
    return "Confirme seu e-mail antes de entrar. Enviamos um código — verifique sua caixa de entrada.";
  }
  if (code === "INVALID_OTP" || code === "OTP_EXPIRED" || message.includes("invalid otp") || message.includes("otp has expired")) {
    return "Código inválido ou expirado. Solicite um novo código.";
  }
  if (code === "INVALID_EMAIL") {
    return "E-mail inválido.";
  }
  if (code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED") {
    return "O link expirou ou é inválido. Solicite um novo.";
  }
  if (code === "RESET_PASSWORD_DISABLED") {
    return "A recuperação de senha não está configurada neste ambiente.";
  }
  if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG" || message.includes("password")) {
    return "A senha não atende aos requisitos de segurança.";
  }
  if (code === "FAILED_TO_CREATE_USER" || code === "FAILED_TO_CREATE_SESSION") {
    return "O cadastro não foi concluído. Tente novamente em alguns minutos.";
  }
  if (code.includes("RATE_LIMIT") || code === "TOO_MANY_REQUESTS" || message.includes("rate limit")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (code === "INTERNAL_ERROR" || code === "UNEXPECTED_FAILURE") {
    return "O serviço encontrou uma falha inesperada. Tente novamente em alguns minutos.";
  }
  if (code.startsWith("NETWORK") || message.includes("fetch") || message.includes("network")) {
    return "Não foi possível conectar ao servidor. Tente novamente.";
  }
  if (message.includes("timeout")) {
    return "O servidor demorou para responder. Tente novamente.";
  }
  if (message.includes("not configured")) {
    return "A autenticação ainda não foi configurada neste ambiente.";
  }
  return fallback;
}
