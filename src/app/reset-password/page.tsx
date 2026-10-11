"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/features/auth/components/AuthField";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { AuthNotice } from "@/features/auth/components/AuthNotice";
import type { AuthNoticeState } from "@/features/auth/model/types";
import { clientRateMessage, consumeClientAttempt } from "@/lib/security/client-rate-limit";
import { authService } from "@/services/auth/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const attempt = consumeClientAttempt({
      key: "reset-password",
      maxAttempts: 5,
      windowMs: 10 * 60_000,
    });
    if (!attempt.allowed) {
      setNotice({ tone: "error", message: clientRateMessage(attempt.retryAfterSeconds) });
      return;
    }
    if (password !== confirm || password.length < 10 || !/\d/.test(password)) {
      setNotice({ tone: "info", message: "Use 10 caracteres com letras e números e repita a mesma senha." });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      await authService.updatePassword(password);
      setNotice({ tone: "success", message: "Senha atualizada. Sua conta já está protegida." });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível atualizar a senha.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Segurança da conta"
      title="Crie uma nova senha"
      description="Escolha uma senha exclusiva para concluir a recuperação."
      footer={<Link href="/login" className="font-medium text-prisma-blue hover:underline">Voltar para o login</Link>}
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthField
          id="new-password"
          type="password"
          label="Nova senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
          hint="Mínimo de 10 caracteres, incluindo um número."
        />
        <AuthField
          id="confirm-password"
          type="password"
          label="Confirmar senha"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
        />
        <AuthNotice notice={notice} />
        <Button type="submit" size="lg" disabled={loading} className="h-12 w-full rounded-xl bg-prisma-blue text-white hover:bg-prisma-blue/90">
          {loading ? <><LoaderCircle className="animate-spin" /> Atualizando</> : "Atualizar senha"}
        </Button>
      </form>
    </AuthLayout>
  );
}
