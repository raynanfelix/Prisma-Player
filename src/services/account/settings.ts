"use client";

import type {
  AccountOverview,
  AccountProfile,
  AccountTeam,
  BillingCard,
  BillingInvoice,
} from "@/features/account/model/types";
import { apiRequest } from "@/services/http/client";

export const accountSettingsService = {
  getProfile() {
    return apiRequest<{ profile: AccountProfile }>("/api/account/profile", {
      cache: "no-store",
    });
  },
  updateProfile(input: {
    fullName: string;
    phone: string;
    locale: string;
    emailNotifications: boolean;
    securityNotifications: boolean;
  }) {
    return apiRequest<{ profile: AccountProfile }>("/api/account/profile", {
      method: "PATCH",
      body: input,
    });
  },
  getOverview() {
    return apiRequest<AccountOverview>("/api/account/overview", {
      cache: "no-store",
    });
  },
  getTeam() {
    return apiRequest<AccountTeam>("/api/account/team", { cache: "no-store" });
  },
  inviteMember(email: string, role: string) {
    return apiRequest<{ invited?: boolean }>("/api/account/team", {
      method: "POST",
      body: { email, role },
    });
  },
  /** Aceita um convite endereçado ao usuário logado (POST action=accept). */
  acceptInvitation(inviteId: string) {
    return apiRequest<{ accepted?: boolean }>("/api/account/team", {
      method: "POST",
      body: { action: "accept", inviteId },
    });
  },
  updateMemberRole(memberId: string, role: string) {
    return apiRequest<Record<string, never>>("/api/account/team", {
      method: "PATCH",
      body: { memberId, role },
    });
  },
  removeTeamAccess(payload: { memberId?: string; inviteId?: string }) {
    return apiRequest<Record<string, never>>("/api/account/team", {
      method: "DELETE",
      body: payload,
    });
  },
  /**
   * Estágio 1 da troca de senha: pede o código OTP (enviado para o e-mail da
   * sessão pelo Managed Neon Auth).
   */
  requestPasswordChangeOtp() {
    return apiRequest<{ ok?: boolean }>("/api/account/password", {
      method: "POST",
      body: { stage: "request" },
    });
  },
  /**
   * Estágio 2 da troca de senha: exige [senha atual + OTP] - a rota valida o
   * código (signIn.emailOtp) antes de trocar a senha (changePassword).
   */
  updatePassword(currentPassword: string, password: string, otp: string) {
    return apiRequest<Record<string, never>>("/api/account/password", {
      method: "PATCH",
      body: { currentPassword, password, otp },
    });
  },
  /**
   * Estágio 1 do step-up da exclusão de conta (contas SSO-only, sem senha):
   * envia o código OTP para o e-mail da sessão (mesmo mecanismo da troca de
   * senha).
   */
  requestDeleteOtp() {
    return apiRequest<{ ok?: boolean }>("/api/account/delete", {
      method: "POST",
      body: { stage: "request-otp" },
    });
  },
  /**
   * Exclusão definitiva da conta (LGPD): a rota exige confirm "EXCLUIR" e
   * OU senha OU o código OTP do step-up. Sucesso encerra a sessão no
   * servidor; o client deve sair da sessão (redirecionamento completo).
   */
  deleteAccount(input: { password: string } | { otp: string }) {
    return apiRequest<{ deleted?: boolean; storageWarnings?: number }>("/api/account/delete", {
      method: "POST",
      body: { confirm: "EXCLUIR", ...input },
    });
  },
  /** Tela Faturamento (spec Billing Completo, item 3). */
  getInvoices() {
    return apiRequest<{ invoices: BillingInvoice[] }>("/api/billing/invoices", {
      cache: "no-store",
    });
  },
  getPaymentMethod() {
    return apiRequest<{ card: BillingCard | null }>("/api/billing/payment-method", {
      cache: "no-store",
    });
  },
  /**
   * Sessão do Customer Portal (troca de plano/cartão e cancelamento -
   * o Stripe é o caminho canônico; o app nunca reescreve o que ele dá
   * pronto). Devolve `{ url }` para redirecionar.
   */
  openBillingPortal() {
    return apiRequest<{ url: string }>("/api/billing/portal", {
      method: "POST",
      body: {},
    });
  },
  /**
   * Pesquisa de churn (spec Billing Completo, item 4): registra o motivo do
   * cancelamento antes de abrir o portal. NUNCA bloqueia o cancelamento.
   */
  submitChurnSurvey(input: { reason: string; feedback?: string; improvement?: string }) {
    return apiRequest<{ ok?: boolean }>("/api/billing/churn-survey", {
      method: "POST",
      body: input,
    });
  },
};
