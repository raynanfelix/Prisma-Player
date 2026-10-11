"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthField } from "@/features/auth/components/AuthField";
import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { AuthNotice } from "@/features/auth/components/AuthNotice";
import type { AuthNoticeState } from "@/features/auth/model/types";
import { authService } from "@/services/auth/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<AuthNoticeState | null>(null);
  const submittingRef = useRef(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current || !agreed) return;
    submittingRef.current = true;
    setLoading(true);
    setNotice(null);
    try {
      const data = await authService.signUpWithEmail({ name, email, password });
      if (data.session) {
        setNotice({ tone: "success", message: "Conta criada. Preparando seu espaço…" });
        // Mesmo padrao da pagina de login: navegação via router (Client Component).
        router.replace("/welcome");
        router.refresh();
      } else {
        setNotice({
          tone: "success",
          message: "Cadastro recebido. Confira seu e-mail para confirmar a conta.",
        });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível criar a conta.",
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          id="name"
          label="Nome completo"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Como podemos chamar você?"
          autoComplete="name"
          maxLength={120}
          required
        />
        <AuthField
          id="email"
          type="email"
          label="E-mail profissional"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@empresa.com"
          autoComplete="email"
          required
        />
        <AuthField
          id="password"
          type="password"
          label="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Crie uma senha segura"
          autoComplete="new-password"
          minLength={8}
          required
          hint="Use pelo menos 8 caracteres."
        />

        <label className="group flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs font-medium text-slate-700">
          <span className="relative mt-0.5 grid size-4 shrink-0 place-items-center">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              required
              className="peer size-4 appearance-none rounded border border-slate-300 bg-white outline-none transition checked:border-[#191A23] checked:bg-[#B9FF66]"
            />
            <Check aria-hidden size={12} className="pointer-events-none absolute text-[#191A23] opacity-0 peer-checked:opacity-100 font-bold" />
          </span>
          <span>
            Concordo com os <Link href="/terms" target="_blank" className="font-semibold text-[#191A23] underline">Termos de Uso</Link> e a{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-[#191A23] underline">Política de Privacidade</Link>.
          </span>
        </label>

        <AuthNotice notice={notice} />
        <Button
          type="submit"
          disabled={loading || !agreed}
          className="h-11 w-full rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] text-[#191A23] font-bold text-sm shadow-xs border border-black/5 transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? <><LoaderCircle className="animate-spin h-4 w-4 mr-2 text-[#191A23]" /> Criando conta...</> : "Começar meus 14 dias grátis"}
        </Button>
      </form>
    </AuthLayout>
  );
}
