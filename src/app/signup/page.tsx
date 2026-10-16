"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowBigUpDash, Check, CircleCheck, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/features/auth/components/AuthField";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { AuthNotice } from "@/features/auth/components/AuthNotice";
import { PasswordChecklist } from "@/features/auth/components/PasswordChecklist";
import type { AuthNoticeState } from "@/features/auth/model/types";
import { useCapsLock } from "@/features/auth/hooks/use-caps-lock";
import { isValidEmail, suggestEmailCorrection } from "@/features/auth/lib/validation";
import { clientRateMessage, consumeClientAttempt } from "@/lib/security/client-rate-limit";
import { authService } from "@/services/auth/client";

const EMAIL_ALREADY_USED = /já possui uma conta|already registered|already been registered/i;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [termsError, setTermsError] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);
  const submittingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { capsLockOn, detectCapsLock } = useCapsLock();

  function handleEmailBlur() {
    setEmailSuggestion(suggestEmailCorrection(email));
  }

  function applyEmailSuggestion() {
    if (!emailSuggestion) return;
    setEmail(emailSuggestion);
    setEmailSuggestion(null);
    setEmailError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current || submitted) return;

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const nameOk = trimmedName.length >= 2;
    const emailOk = isValidEmail(normalizedEmail);
    const passwordOk = password.length >= 8;

    setNameError(nameOk ? null : "Digite seu nome.");
    setEmailError(emailOk ? null : normalizedEmail ? "Digite um e-mail válido, como voce@empresa.com." : "Digite seu e-mail.");
    setPasswordError(passwordOk ? null : "A senha precisa de pelo menos 8 caracteres.");
    setTermsError(!agreed);

    if (!nameOk) {
      nameRef.current?.focus();
      return;
    }
    if (!emailOk) {
      emailRef.current?.focus();
      return;
    }
    if (!passwordOk) {
      passwordRef.current?.focus();
      return;
    }
    if (!agreed) return;

    const attempt = consumeClientAttempt({
      key: `signup:${normalizedEmail}`,
      maxAttempts: 5,
      windowMs: 15 * 60_000,
    });
    if (!attempt.allowed) {
      setNotice({ tone: "error", message: clientRateMessage(attempt.retryAfterSeconds) });
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setNotice(null);
    try {
      const data = await authService.signUpWithEmail({ name: trimmedName, email: normalizedEmail, password });
      if (data.session) {
        setNotice({ tone: "success", message: "Conta criada. Preparando seu espaço…" });
        // Mesmo padrao da pagina de login: navegação via router (Client Component).
        router.replace("/welcome");
        router.refresh();
      } else {
        setSubmitted(true);
        setNotice({
          tone: "success",
          message: `Enviamos um link de confirmação para ${normalizedEmail}. Não chegou? Verifique o spam e aguarde alguns minutos.`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar a conta.";
      setNotice({
        tone: "error",
        message,
        action: EMAIL_ALREADY_USED.test(message) ? { label: "Fazer login", href: "/login" } : undefined,
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="14 dias grátis sem cartão"
      title="Crie sua conta no Prisma"
      description="Teste a operação completa, sem cartão e sem cobrança automática."
      footer={<>Já possui uma conta? <Link href="/login" className="font-bold text-[#191A23] hover:underline">Fazer login</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthField
          ref={nameRef}
          id="name"
          name="name"
          label="Nome completo"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(null);
          }}
          placeholder="Como podemos chamar você?"
          autoComplete="name"
          maxLength={120}
          required
          error={nameError ?? undefined}
        />
        <div className="space-y-1">
          <AuthField
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            label="E-mail profissional"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailError) setEmailError(null);
            }}
            onBlur={handleEmailBlur}
            placeholder="voce@empresa.com"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            maxLength={254}
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
        <div className="space-y-1.5">
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
            placeholder="Crie uma senha segura"
            autoComplete="new-password"
            minLength={8}
            required
            revealPassword
            error={passwordError ?? undefined}
          />
          <PasswordChecklist password={password} />
          {capsLockOn && (
            <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <ArrowBigUpDash size={13} aria-hidden /> Caps Lock ativado
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="group flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs font-medium text-slate-700">
            <span className="relative mt-0.5 grid size-4 shrink-0 place-items-center">
              <input
                type="checkbox"
                name="terms"
                checked={agreed}
                onChange={(event) => {
                  setAgreed(event.target.checked);
                  if (termsError) setTermsError(false);
                }}
                aria-invalid={termsError || undefined}
                className="peer size-4 cursor-pointer appearance-none rounded border border-slate-300 bg-white outline-none transition checked:border-[#191A23] checked:bg-[#B9FF66] focus-visible:ring-2 focus-visible:ring-[#B9FF66]/50 focus-visible:border-[#191A23]"
              />
              <Check aria-hidden size={12} className="pointer-events-none absolute text-[#191A23] opacity-0 peer-checked:opacity-100 font-bold" />
            </span>
            <span>
              Concordo com os <Link href="/terms" target="_blank" className="font-semibold text-[#191A23] underline">Termos de Uso</Link> e a{" "}
              <Link href="/privacy" target="_blank" className="font-semibold text-[#191A23] underline">Política de Privacidade</Link>.
            </span>
          </label>
          {termsError && (
            <p id="terms-error" className="text-xs font-medium text-red-600">
              Aceite os Termos de Uso para criar sua conta.
            </p>
          )}
        </div>

        <AuthNotice notice={notice} />
        <Button
          type="submit"
          disabled={loading || submitted}
          className="h-11 w-full rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] text-[#191A23] font-bold text-sm shadow-xs border border-black/5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><LoaderCircle className="animate-spin h-4 w-4 mr-2 text-[#191A23]" /> Criando conta...</>
          ) : submitted ? (
            "Verifique seu e-mail"
          ) : (
            "Começar meus 14 dias grátis"
          )}
        </Button>
        <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500">
          <li className="flex items-center gap-1"><CircleCheck size={12} className="text-emerald-600" aria-hidden /> Sem cartão de crédito</li>
          <li className="flex items-center gap-1"><CircleCheck size={12} className="text-emerald-600" aria-hidden /> Cancele quando quiser</li>
          <li className="flex items-center gap-1"><CircleCheck size={12} className="text-emerald-600" aria-hidden /> Dados criptografados</li>
        </ul>
      </form>
    </AuthLayout>
  );
}
