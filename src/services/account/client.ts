"use client";

import { apiRequest } from "@/services/http/client";

export interface AccountIdentity {
  name: string;
  email: string;
}

export const accountService = {
  async getIdentity(): Promise<AccountIdentity> {
    const data = await apiRequest<{ profile: { full_name: string | null; email: string | null } | null }>("/api/account/profile", {
      cache: "no-store",
    });
    const profile = data.profile;
    return {
      name: String(profile?.full_name ?? profile?.email ?? "Conta Prisma"),
      email: profile?.email ?? "",
    };
  },

  getAccess() {
    return apiRequest<{ isAdmin: boolean; hasAccess: boolean }>("/api/account/access", {
      cache: "no-store",
    });
  },
};
