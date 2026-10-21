"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OtpInputField } from "@/components/shared/OtpInputField";
import type { AuthNoticeState } from "@/features/auth/model/types";
import { AuthNotice } from "./AuthNotice";

interface EmailVerificationCardProps {
  /** E-mail destinatário do código, exibido na descrição do Card. */
  email: string;
  /** "Verifique seu e-mail" (signup) ou "Confirme seu login" (deep-link). */
  title: string;
  code: string;
  onCodeChange: (value: string) => void;
  /** Mensagem de erro do código (FieldError) - o InputOTP já foi limpo. */
  error: string | null;
  notice: AuthNoticeState | null;
  verifying: boolean;
  resending: boolean;
  /** Cooldown restante do reenvio em segundos (60s definido na página). */
  resendCooldown: number;
  onVerify: (event: FormEvent<HTMLFormElement>) => void;
  onResend: () => void;
  /** Ação opcional de retorno (voltar ao form de signup ou ao login). */
  onBack?: () => void;
  backLabel?: string;
}

/**
 * Card de verificação por código OTP no padrão aprovado (shadcn Card + Field +
 * InputOTP), com auto-submit ao completar os 6 dígitos. Cores só via tokens
 * (bg-card, ring, border-input) - claro intacto, escuro colapsa para preto.
 */
export function EmailVerificationCard({
  email,
  title,
  code,
  onCodeChange,
  error,
  notice,
  verifying,
  resending,
  resendCooldown,
  onVerify,
  onResend,
  onBack,
  backLabel = "voltar",
}: EmailVerificationCardProps) {
  const codeComplete = code.length === 6;

  return (
    <Card className="gap-6 rounded-2xl [--card-spacing:1.75rem]">
      <CardHeader>
        <CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle>
        <CardDescription>
          Digite o código que enviamos para <span className="font-medium text-foreground">{email}</span>.
        </CardDescription>
        {verifying && (
          <CardAction>
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthNotice notice={notice} />
        <form onSubmit={onVerify} className="flex flex-col gap-4" noValidate>
          <OtpInputField
            id="otp"
            value={code}
            onChange={onCodeChange}
            error={error}
            description="Digite ou cole os 6 dígitos. O código expira em 15 minutos."
            disabled={verifying}
            autoFocus
            resending={resending}
            resendCooldown={resendCooldown}
            onResend={onResend}
          />
          <Button type="submit" size="lg" className="w-full" disabled={verifying || !codeComplete}>
            {verifying ? (
              <>
                <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden />
                Verificando…
              </>
            ) : (
              "Verificar"
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-1.5 rounded-b-2xl bg-transparent text-center text-xs font-semibold text-muted-foreground">
        <p>
          Não recebeu? Verifique o spam ou{" "}
          <Link
            href="/dashboard/support"
            className="font-semibold text-foreground underline underline-offset-2 transition-opacity hover:opacity-80"
          >
            falar com o suporte
          </Link>
          .
        </p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer font-semibold underline underline-offset-2 transition-colors hover:text-foreground"
          >
            {backLabel}
          </button>
        )}
      </CardFooter>
    </Card>
  );
}
