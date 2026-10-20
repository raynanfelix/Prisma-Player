"use client";

import type {
  AccountOverview,
  AccountProfile,
  AccountTeam,
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
   * Estágio 2 da troca de senha: exige [senha atual + OTP] — a rota valida o
   * código (signIn.emailOtp) antes de trocar a senha (changePassword).
   */
  updatePassword(currentPassword: string, password: string, otp: string) {
    return apiRequest<Record<string, never>>("/api/account/password", {
      method: "PATCH",
      body: { currentPassword, password, otp },
    });
  },
};
