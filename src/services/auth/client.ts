"use client";

import { apiRequest, ApiError } from "@/services/http/client";
import { GENERIC_ERROR_MESSAGES } from "@/lib/errors";

class AuthServiceError extends Error {
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
        // LGPD Art. 6º III (minimização) + Art. 33 (transferência internacional):
        // email é dado pessoal desnecessário para analytics de produto e configura
        // transferência a operador sem DPA/SCCs documentados. user.id interno já
        // é suficiente para funil e retenção; email removido do identify.
        
      }
      return data.user;
    } catch (error) {
      throw new AuthServiceError(error, GENERIC_ERROR_MESSAGES.signIn);
    }
  },

  async signUpWithEmail(input: { name: string; email: string; password: string }) {
    try {
      const data = await apiRequest<{
        user: { id: string; email?: string } | null;
        hasSession?: boolean;
        emailVerificationRequired?: boolean;
      }>("/api/auth/signup", {
        method: "POST",
        body: { name: input.name, email: input.email, password: input.password },
      });
      
      return {
        session: data.hasSession ? "present" : null,
        emailVerificationRequired: Boolean(data.emailVerificationRequired),
      };
    } catch (error) {
      throw new AuthServiceError(error, GENERIC_ERROR_MESSAGES.createAccount);
    }
  },

  /** Troca o código de 6 dígitos do e-mail; com auto-sign-in devolve sessão. */
  async verifyEmailWithCode(email: string, otp: string) {
    try {
      const data = await apiRequest<{ verified?: boolean; hasSession?: boolean }>("/api/auth/verify-email", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), otp },
      });
      return { verified: Boolean(data.verified), hasSession: Boolean(data.hasSession) };
    } catch (error) {
      throw new AuthServiceError(error, GENERIC_ERROR_MESSAGES.otpInvalidOrExpired);
    }
  },

  /** Reenvia o código de verificação (resposta do servidor é sempre genérica). */
  async resendVerificationEmail(email: string) {
    try {
      await apiRequest("/api/auth/verify-email", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), resend: true },
      });
    } catch (error) {
      throw new AuthServiceError(error, GENERIC_ERROR_MESSAGES.resendCode);
    }
  },

  async requestPasswordReset(email: string) {
    try {
      await apiRequest("/api/auth/reset", {
        method: "POST",
        body: { email: email.trim().toLowerCase() },
      });
    } catch (error) {
      throw new AuthServiceError(error, GENERIC_ERROR_MESSAGES.sendEmail);
    }
  },

  async updatePassword(password: string, token?: string) {
    try {
      await apiRequest("/api/auth/update-password", {
        method: "POST",
        body: { password, ...(token ? { token } : {}) },
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
