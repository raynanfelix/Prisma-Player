import "server-only";

export function getAuthErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).toLowerCase() : "";
  if (message.includes("already registered") || message.includes("already been registered")) return "Este e-mail já possui uma conta. Faça login.";
  if (code === "user_already_exists" || code === "email_exists") return "Este e-mail já possui uma conta. Faça login.";
  if (message.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (code === "over_email_send_rate_limit") return "O limite temporário de e-mails de confirmação foi atingido. Aguarde cerca de uma hora e tente novamente.";
  if (message.includes("email rate limit") || code.includes("rate_limit")) return "Muitos cadastros foram solicitados. Aguarde alguns minutos e tente novamente.";
  if (message.includes("error sending confirmation email") || message.includes("error sending confirmation mail")) return "Não foi possível enviar o e-mail de confirmação. Verifique o SMTP da Prisma ou tente novamente em alguns minutos.";
  if (message.includes("signup is disabled") || code === "signup_disabled") return "Novos cadastros estão temporariamente pausados.";
  if (message.includes("database error saving new user")) return "O cadastro não foi concluído no banco. Tente novamente em alguns minutos.";
  if (code === "unexpected_failure") return "O serviço de cadastro encontrou uma falha inesperada. Tente novamente em alguns minutos.";
  if (message.includes("password")) return "A senha não atende aos requisitos de segurança.";
  if (message.includes("fetch") || message.includes("network")) return "Não foi possível conectar ao servidor. Tente novamente.";
  if (message.includes("timeout")) return "O servidor demorou para responder. Tente novamente.";
  if (message.includes("not configured")) return "A autenticação ainda não foi configurada neste ambiente.";
  return fallback;
}

