"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInputField } from "@/components/shared/OtpInputField";
import { ApiError } from "@/services/http/client";
import { accountSettingsService } from "@/services/account/settings";
import { SettingsCard } from "./SettingsUi";

/** Cooldown do botão "Reenviar código" (o código do Managed vale 15 min). */
const RESEND_COOLDOWN_SECONDS = 60;
const OTP_PATTERN = /^\d{6}$/;

const messages: Record<string, string> = {
  invalid_current_password: "A senha atual não confere.",
  current_password_required: "Informe sua senha atual.",
  invalid_otp_format: "Digite os 6 dígitos do código.",
  invalid_otp: "Código inválido ou expirado. Solicite um novo código.",
  otp_send_failed: "Não foi possível enviar o código. Tente novamente em alguns minutos.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
};

export function PasswordPanel({ notify, email }: { notify: (message: string) => void; email?: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  // Passo de OTP: aparece depois do primeiro "Atualizar senha" (envio do código).
  const [otpStage, setOtpStage] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const savingRef = useRef(false);
  const requestingRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  function friendly(error: unknown, fallback: string) {
    if (error instanceof ApiError) return messages[error.code] ?? error.message ?? fallback;
    return fallback;
  }

  /** Estágio 1: solicita/envia o código OTP para o e-mail da sessão. */
  async function requestOtp() {
    if (requestingRef.current) return false;
    requestingRef.current = true;
    setRequestingOtp(true);
    setOtpError(null);
    try {
      await accountSettingsService.requestPasswordChangeOtp();
      setOtpStage(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      return true;
    } catch (error) {
      notify(friendly(error, "Não foi possível enviar o código. Tente novamente."));
      return false;
    } finally {
      requestingRef.current = false;
      setRequestingOtp(false);
    }
  }

  /** Estágio 2: troca a senha exigindo [senha atual + código]. */
  async function performChange(code: string) {
    if (savingRef.current) return;
    if (password !== confirmation) {
      notify("As senhas não coincidem.");
      return;
    }
    if (!OTP_PATTERN.test(code)) {
      setOtpError("Digite os 6 dígitos do código recebido por e-mail.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setOtpError(null);
    try {
      await accountSettingsService.updatePassword(currentPassword, password, code);
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      setOtp("");
      setOtpStage(false);
      notify("Senha atualizada com sucesso.");
    } catch (error) {
      const message = friendly(error, "Use pelo menos 10 caracteres, com letras e números.");
      if (error instanceof ApiError && (error.code === "invalid_otp" || error.code === "invalid_otp_format")) {
        // Erro do código junto ao campo; o InputOTP é limpo para nova digitação.
        setOtp("");
        setOtpError(message);
      } else {
        notify(message);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /** Botão principal: pede o código na 1ª vez; com código pronto, troca a senha. */
  async function handleUpdate() {
    if (!otpStage) {
      await requestOtp();
      return;
    }
    await performChange(otp);
  }

  /** Auto-submit: ao completar os 6 dígitos do código, troca a senha. */
  function handleOtpChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setOtp(digits);
    if (otpError) setOtpError(null);
    if (OTP_PATTERN.test(digits)) void performChange(digits);
  }

  return (
    <SettingsCard title="Alterar senha" description="Crie uma senha exclusiva para sua conta.">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Senha atual
          <Input
            className="mt-2 h-11 rounded-xl"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="text-sm font-medium">
          Nova senha
          <Input className="mt-2 h-11 rounded-xl" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </label>
        <label className="text-sm font-medium">
          Confirmar senha
          <Input className="mt-2 h-11 rounded-xl" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle2 className="size-4" />10 caracteres</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="size-4" />Letras e números</span>
      </div>
      {otpStage && (
        <div className="mt-5">
          <OtpInputField
            id="password-otp"
            label="Código de confirmação"
            value={otp}
            onChange={handleOtpChange}
            error={otpError}
            description={`Enviamos um código para ${email || "seu e-mail"}. Confirme para trocar a senha.`}
            disabled={saving}
            resending={requestingOtp}
            resendCooldown={resendCooldown}
            onResend={() => void requestOtp()}
          />
        </div>
      )}
      <Button
        className="mt-5 rounded-full"
        onClick={() => void handleUpdate()}
        disabled={saving || requestingOtp || !currentPassword || !password || !confirmation || (otpStage && otp.length !== 6)}
      >
        {requestingOtp ? "Enviando código…" : saving ? "Atualizando…" : otpStage ? "Confirmar troca de senha" : "Atualizar senha"}
      </Button>
    </SettingsCard>
  );
}
