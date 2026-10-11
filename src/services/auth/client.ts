"use client";

import posthog from "posthog-js";
import { apiRequest, ApiError } from "@/services/http/client";

export class AuthServiceError extends Error {
  constructor(error: unknown, fallback: string) {
    const message = error instanceof ApiError && error.payload?.message
      ? String(error.payload.message)
      : error instanceof Error
        ? error.message
        : fallback;
    super(message);
    this.name = "AuthServiceError";
  }
}

export function safeAuthRedirect(value: string | null, fallback = "/dashboard/videos") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export const authService = {
  async signInWithEmail(email: string, password: string) {
    try {
      const data = await apiRequest<{ user: { id: string; email?: string } | null }>("/api/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password },
      });
      if (data.user) {
        posthog.identify(data.user.id, { email: data.user.email });
        posthog.capture("user_logged_in", { method: "email" });
      }
      return data.user;
    } catch (error) {
      throw new AuthServiceError(error, "Não foi possível entrar agora. Tente novamente.");
    }
  },

  async signUpWithEmail(input: { name: string; email: string; password: string }) {
    try {
      const data = await apiRequest<{ data: { user: { id: string; email?: string } | null }; hasSession?: boolean }>("/api/auth/signup", {
        method: "POST",
        body: { name: input.name, email: input.email, password: input.password },
      });
      if (data.data?.user) {
        posthog.identify(data.data.user.id, { email: data.data.user.email });
        posthog.capture("user_signed_up", { method: "email" });
      }
      return { session: data.hasSession ? "present" : null } as { session: string | null };
    } catch (error) {
      throw new AuthServiceError(error, "Não foi possível criar a conta. Tente novamente.");
    }
  },

  async requestPasswordReset(email: string) {
    try {
      await apiRequest("/api/auth/reset", {
        method: "POST",
        body: { email: email.trim().toLowerCase() },
      });
    } catch (error) {
      throw new AuthServiceError(error, "Não foi possível enviar o e-mail.");
    }
  },

  async updatePassword(password: string) {
    try {
      await apiRequest("/api/auth/update-password", {
        method: "POST",
        body: { password },
      });
    } catch (error) {
      throw new AuthServiceError(error, "O link expirou ou a senha não foi aceita.");
    }
  },

  async signOut() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
    }
  },
};
