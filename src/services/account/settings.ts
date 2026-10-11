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
    return apiRequest<{ joined?: boolean }>("/api/account/team", {
      method: "POST",
      body: { email, role },
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
  updatePassword(currentPassword: string, password: string) {
    return apiRequest<Record<string, never>>("/api/account/password", {
      method: "PATCH",
      body: { currentPassword, password },
    });
  },
};
