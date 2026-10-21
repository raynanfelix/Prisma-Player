"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

/** Índices dos 3 slots de cada grupo (0-2 e 3-5). */
const OTP_SLOTS = [0, 1, 2] as const;

interface OtpInputFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Mensagem de erro do código (o valor já deve ter sido limpo pelo pai). */
  error?: string | null;
  /** Texto de apoio exibido quando não há erro. */
  description?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Botão de reenvio (variant outline, cooldown controlado pelo pai). */
  resending?: boolean;
  resendCooldown?: number;
  onResend?: () => void;
}

/**
 * Campo de código OTP (6 dígitos) no padrão aprovado: Field + InputOTP com dois
 * grupos de 3 slots (h-9 w-11 text-xl) separados por InputOTPSeparator.
 * Componente token-based - respeita claro/escuro via globals.css.
 */
export function OtpInputField({
  id = "otp",
  label = "Código de verificação",
  value,
  onChange,
  error,
  description,
  disabled,
  autoFocus,
  resending,
  resendCooldown = 0,
  onResend,
}: OtpInputFieldProps) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id} className="text-xs font-semibold">
          {label}
        </FieldLabel>
        {onResend && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onResend}
            disabled={resendCooldown > 0 || resending || disabled}
          >
            <RefreshCw
              data-icon="inline-start"
              className={resending ? "animate-spin" : undefined}
              aria-hidden
            />
            {resending
              ? "Reenviando…"
              : resendCooldown > 0
                ? `Reenviar código em ${resendCooldown}s`
                : "Reenviar código"}
          </Button>
        )}
      </div>
      <InputOTP
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        maxLength={6}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-invalid={error ? true : undefined}
        containerClassName="justify-center gap-2"
      >
        <InputOTPGroup>
          {OTP_SLOTS.map((index) => (
            <InputOTPSlot key={index} index={index} className="h-9 w-11 text-xl" />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {OTP_SLOTS.map((index) => (
            <InputOTPSlot key={index + 3} index={index + 3} className="h-9 w-11 text-xl" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}
