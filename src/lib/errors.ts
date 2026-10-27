/**
 * Mensagens de erro genéricas compartilhadas (review Standards, achado 1).
 *
 * Contrato de UX: a MESMA classe de falha sempre produz a MESMA sentença -
 * o usuário aprende o padrão e revisões futuras (ou i18n) trocam em um
 * lugar só. Só entram aqui strings que são LITERALEMENTE idênticas através
 * de 2+ camadas (página client, service, rota de API); mensagens contextuais
 * de tela ("Não foi possível mover esta tarefa") continuam no componente
 * dono do contexto.
 *
 * Nunca incluir detalhe de provedor (auth/banco/e-mail) aqui: o detalhe
 * pertence ao log do servidor; o que chega ao navegador é genérico.
 */
export const GENERIC_ERROR_MESSAGES = {
  /** OTP/verificação inválido ou vencido - ação: pedir código novo. */
  otpInvalidOrExpired: "Código inválido ou expirado. Solicite um novo código.",
  /** Envio do código de verificação falhou (e-mail real não saiu). */
  otpSendFailed: "Não foi possível enviar o código. Tente novamente em alguns minutos.",
  /** Criação de conta falhou no provedor (sem vazar detalhe interno). */
  createAccount: "Não foi possível criar a conta. Tente novamente.",
  /** Login falhou por indisponibilidade (não por credencial errada). */
  signIn: "Não foi possível entrar agora. Tente novamente.",
  /** Envio do e-mail de recuperação falhou. */
  sendEmail: "Não foi possível enviar o e-mail. Tente novamente.",
  /** Troca de senha falhou. */
  updatePassword: "Não foi possível atualizar a senha. Tente novamente.",
  /** Reenvio do código de verificação falhou. */
  resendCode: "Não foi possível reenviar o código. Tente novamente.",
  /** Exclusão de conta falhou em passo parcial (detalhe só no log). */
  deleteAccount:
    "Não foi possível concluir a exclusão da conta. Tente novamente ou entre em contato com o suporte.",
  /** Rede/timeout: o fetch não completou - texto interno nunca chega à UI. */
  networkUnavailable: "Não foi possível conectar ao servidor. Tente novamente.",
  /** Serviço de cobrança (Stripe) indisponível/mal configurado - sem instrução de infra no corpo. */
  billingUnavailable: "Não foi possível conectar ao serviço de cobrança agora. Tente novamente.",
} as const;
