"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInputField } from "@/components/shared/OtpInputField";
import { ApiError } from "@/services/http/client";
import { accountSettingsService } from "@/services/account/settings";
import { SettingsCard } from "./SettingsUi";

/**
 * Zona de perigo: apagar a conta (P1 da spec de conta, LGPD art. 18, VI).
 *
 * Explica o que é removido, exige digitar EXCLUIR e um fator de identidade:
 * senha (contas com senha) OU código OTP de e-mail (contas SSO-only, mesmo
 * step-up em dois estágios da troca de senha). O copy evita travessões.
 */

const CONFIRMATION = "EXCLUIR";
const OTP_PATTERN = /^\d{6}$/;

const deleteMessages: Record<string, string> = {
  confirmation_required: `Digite ${CONFIRMATION} para liberar a exclusão.`,
  password_or_otp_required: "Informe sua senha ou o código de 6 dígitos.",
  invalid_password: "A senha não confere.",
  invalid_otp_format: "Digite os 6 dígitos do código.",
  invalid_otp: "Código inválido ou expirado. Solicite um novo código.",
  otp_send_failed: "Não foi possível enviar o código. Tente novamente em alguns minutos.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  team_not_empty: "Remova os outros membros da equipe antes de excluir a conta.",
  stripe_cancel_failed: "Não foi possível cancelar a assinatura agora. Nenhum dado foi apagado; tente novamente em instantes.",
};

function friendlyDeleteError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return deleteMessages[error.code] ?? error.message ?? fallback;
  return fallback;
}

export function DangerZone({ email, notify }: { email?: string; notify: (message: string) => void }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStage, setOtpStage] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const busyRef = useRef(false);
  const requestingRef = useRef(false);

  const canConfirm = confirmation.trim() === CONFIRMATION;
  const hasCredential = mode === "password" ? password.length > 0 : otp.length === 6;

  function resetCredential(): void {
    setPassword("");
    setOtp("");
    setOtpStage(false);
    setOtpError(null);
  }

  /** Estágio 1 (modo OTP): envia o código para o e-mail da sessão. */
  async function requestOtp(): Promise<boolean> {
    if (requestingRef.current) return false;
    requestingRef.current = true;
    setRequestingOtp(true);
    setOtpError(null);
    try {
      await accountSettingsService.requestDeleteOtp();
      setOtpStage(true);
      return true;
    } catch (error) {
      notify(friendlyDeleteError(error, "Não foi possível enviar o código. Tente novamente."));
      return false;
    } finally {
      requestingRef.current = false;
      setRequestingOtp(false);
    }
  }

  /** Exclusão definitiva. Sucesso: sessão morta no servidor, saída completa. */
  async function performDelete(): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode === "password") {
        await accountSettingsService.deleteAccount({ password });
      } else {
        if (!OTP_PATTERN.test(otp)) {
          setOtpError("Digite os 6 dígitos do código recebido por e-mail.");
          return;
        }
        await accountSettingsService.deleteAccount({ otp });
      }
      // A conta não existe mais: sai para a landing com replace + refresh
      // (mesmo mecanismo do logout em AccountMenu, que limpa o cache de RSC
      // do router; a sessão já morreu no servidor).
      router.replace("/");
      router.refresh();
    } catch (error) {
      const message = friendlyDeleteError(error, "Não foi possível excluir a conta. Tente novamente.");
      if (error instanceof ApiError && (error.code === "invalid_otp" || error.code === "invalid_otp_format")) {
        setOtp("");
        setOtpError(message);
      } else {
        notify(message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function switchMode(next: "password" | "otp"): void {
    if (mode === next) return;
    setMode(next);
    resetCredential();
  }

  return (
    <SettingsCard
      title="Zona de perigo: apagar conta"
      description="Exclusão definitiva dos seus dados (LGPD, art. 18, VI)."
      className="border-destructive/40"
    >
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle className="size-4" aria-hidden />
          Esta ação é irreversível. Não há como recuperar a conta depois.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Vídeos e arquivos no armazenamento são removidos em definitivo.</li>
          <li>Players, estatísticas, integrações e preferências são apagados.</li>
          <li>A assinatura ativa é cancelada no provedor de pagamento.</li>
          <li>Convites pendentes para o seu e-mail deixam de valer.</li>
        </ul>
      </div>

      <label className="mt-5 block text-sm font-medium">
        Digite {CONFIRMATION} para liberar a exclusão
        <Input
          className="mt-2 h-11 rounded-xl"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          data-testid="danger-zone-confirmation"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Forma de confirmar sua identidade">
        <Button type="button" variant={mode === "password" ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => switchMode("password")}>
          Tenho senha
        </Button>
        <Button type="button" variant={mode === "otp" ? "default" : "outline"} size="sm" className="rounded-full" onClick={() => switchMode("otp")}>
          <Mail className="size-4" aria-hidden />
          Conta sem senha: usar código
        </Button>
      </div>

      {mode === "password" ? (
        <label className="mt-4 block text-sm font-medium">
          Sua senha
          <Input
            className="mt-2 h-11 rounded-xl"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            data-testid="danger-zone-password"
          />
        </label>
      ) : otpStage ? (
        <div className="mt-4">
          <OtpInputField
            id="danger-zone-otp"
            label="Código de confirmação"
            value={otp}
            onChange={(value) => {
              setOtp(value.replace(/\D/g, "").slice(0, 6));
              if (otpError) setOtpError(null);
            }}
            error={otpError}
            description={`Enviamos um código para ${email || "seu e-mail"}. Confirme para excluir a conta.`}
            disabled={busy}
            resending={requestingOtp}
            onResend={() => void requestOtp()}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Sem senha na conta (login Google ou SSO)? Enviamos um código de 6 dígitos para o seu e-mail para confirmar a exclusão.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {mode === "otp" && !otpStage && (
          <Button type="button" variant="outline" className="rounded-full" onClick={() => void requestOtp()} disabled={requestingOtp || busy}>
            {requestingOtp ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
            {requestingOtp ? "Enviando código…" : "Enviar código por e-mail"}
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          className="rounded-full"
          onClick={() => void performDelete()}
          disabled={busy || !canConfirm || !hasCredential || (mode === "otp" && !otpStage)}
          data-testid="danger-zone-confirm"
        >
          {busy ? "Apagando conta…" : "Apagar minha conta"}
        </Button>
      </div>
    </SettingsCard>
  );
}
