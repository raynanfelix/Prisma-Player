"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowBigUpDash, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/features/auth/components/AuthField";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { AuthNotice } from "@/features/auth/components/AuthNotice";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";
import type { AuthNoticeState } from "@/features/auth/model/types";
import { useCapsLock } from "@/features/auth/hooks/use-caps-lock";
import { isValidEmail, suggestEmailCorrection } from "@/features/auth/lib/validation";
import { clientRateMessage, consumeClientAttempt } from "@/lib/security/client-rate-limit";
import { GENERIC_ERROR_MESSAGES } from "@/lib/errors";
import { authService, safeAuthRedirect } from "@/services/auth/client";
import { TurnstileWidget } from "@/features/auth/components/TurnstileWidget";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { capsLockOn, detectCapsLock } = useCapsLock();

  function validateEmail(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setEmailError("Digite seu e-mail.");
      return false;
    }
    if (!isValidEmail(trimmed)) {
      setEmailError("Digite um e-mail válido, como voce@empresa.com.");
      return false;
    }
    setEmailError(null);
    return true;
  }

  function handleEmailBlur() {
    const trimmed = email.trim();
    setEmailSuggestion(suggestEmailCorrection(trimmed));
    if (trimmed) validateEmail(trimmed);
  }

  function applyEmailSuggestion() {
    if (!emailSuggestion) return;
    setEmail(emailSuggestion);
    setEmailSuggestion(null);
    setEmailError(null);
  }

  async function recoverPassword() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setNotice({ tone: "info", message: "Informe um e-mail válido acima para recuperar a senha." });
      emailRef.current?.focus();
      return;
    }
    const attempt = consumeClientAttempt({
      key: `recover:${normalizedEmail}`,
      maxAttempts: 3,
      windowMs: 15 * 60_000,
    });
    if (!attempt.allowed) {
      setNotice({ tone: "error", message: clientRateMessage(attempt.retryAfterSeconds) });
      return;
    }
    try {
      await authService.requestPasswordReset(normalizedEmail);
      setNotice({ tone: "success", message: "Enviamos o link de recuperação para seu e-mail." });
    } catch {
      // Mensagem genérica: error.message pode conter detalhes do provedor
      // de e-mail ou do auth que não devem chegar ao navegador.
      setNotice({
        tone: "error",
        message: GENERIC_ERROR_MESSAGES.sendEmail,
      });
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;

    const normalizedEmail = email.trim().toLowerCase();
    const emailOk = validateEmail(normalizedEmail);
    const passwordOk = password.length > 0;
    setPasswordError(passwordOk ? null : "Digite sua senha.");

    if (!emailOk) {
      emailRef.current?.focus();
      return;
    }
    if (!passwordOk) {
      passwordRef.current?.focus();
      return;
    }

    const attempt = consumeClientAttempt({
      key: `login:${normalizedEmail}`,
      maxAttempts: 8,
      windowMs: 10 * 60_000,
    });
    if (!attempt.allowed) {
      setNotice({ tone: "error", message: clientRateMessage(attempt.retryAfterSeconds) });
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setNotice(null);
    try {
      await authService.signInWithEmail(normalizedEmail, password, turnstileToken ?? undefined);
      router.replace(safeAuthRedirect(new URLSearchParams(window.location.search).get("next")));
      router.refresh();
    } catch (error) {
      // Mensagem genérica para o usuário; a mensagem crua do provedor pode
      // conter detalhes internos. A detecção de e-mail não verificado usa a
      // string original apenas como sinalizador interno.
      const raw = error instanceof Error ? error.message : "";
      const needsVerification = /verif/i.test(raw);
      setNotice({
        tone: "error",
        message: needsVerification
          ? "E-mail ainda não verificado. Verifique sua caixa de entrada ou reenvie o código."
          : GENERIC_ERROR_MESSAGES.signIn,
        action: needsVerification
          ? { label: "Verificar e-mail", href: `/signup?verify=1&email=${encodeURIComponent(normalizedEmail)}` }
          : undefined,
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Acesso à plataforma"
      title="Entrar na sua conta"
      description="Gerencie suas VSLs, acompanhe a conversão e otimize seus resultados."
      footer={<>Ainda não tem conta? <Link href="/signup" className="font-bold text-[#191A23] hover:underline">Criar conta grátis</Link></>}
    >
      <GoogleSignInButton onError={(message) => setNotice({ tone: "error", message })} />
      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">ou com e-mail</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1">
          <AuthField
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            label="E-mail"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailError) validateEmail(event.target.value);
            }}
            onBlur={handleEmailBlur}
            placeholder="voce@empresa.com"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            autoFocus
            required
            error={emailError ?? undefined}
          />
          {emailSuggestion && (
            <button
              type="button"
              onClick={applyEmailSuggestion}
              className="cursor-pointer text-xs font-medium text-slate-500 underline underline-offset-2 transition-colors hover:text-[#191A23]"
            >
              Você quis dizer <span className="font-semibold">{emailSuggestion}</span>? Corrigir
            </button>
          )}
        </div>
        <div className="space-y-1">
          <AuthField
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            label="Senha"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (passwordError) setPasswordError(null);
            }}
            onKeyDown={detectCapsLock}
            onKeyUp={detectCapsLock}
            placeholder="Sua senha"
            autoComplete="current-password"
            required
            revealPassword
            error={passwordError ?? undefined}
            trailing={<button type="button" onClick={recoverPassword} className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-[#191A23]">Esqueci a senha</button>}
          />
          {capsLockOn && (
            <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <ArrowBigUpDash size={13} aria-hidden /> Caps Lock ativado
            </p>
          )}
        </div>
        <AuthNotice notice={notice} />
        <TurnstileWidget
          siteKey={process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY ?? ""}
          action="login"
          onTokenChange={setTurnstileToken}
          onError={(err) => setNotice({ tone: "error", message: "Falha na verificação de segurança. Tente novamente." })}
        />
        <Button
          type="submit"
          disabled={loading || !turnstileToken}
          className="h-11 w-full rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] text-[#191A23] font-bold text-sm shadow-xs border border-black/5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <><LoaderCircle className="animate-spin h-4 w-4 mr-2 text-[#191A23]" /> Entrando...</> : "Entrar no Painel"}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
          <LockKeyhole size={12} className="text-emerald-600" aria-hidden />
          Conexão segura - suas credenciais são enviadas por HTTPS.
        </p>
      </form>
    </AuthLayout>
  );
}
