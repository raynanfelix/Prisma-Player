"use client";

import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/services/auth/social-client";

/**
 * Botão "Continuar com Google" das telas de auth.
 *
 * Chama o authClient do Neon direto no navegador (signIn.social): o
 * wrapper cuida do redirect/popup do OAuth, então este componente só
 * precisa do estado de espera e de entregar erros em PT-BR para a tela
 * pai exibir no AuthNotice padrão.
 *
 * Estilo: variante outline do Button (bg branco, hairline slate, tinta)
 * com a altura/raio dos botões primários dos formulários — o verde-lima
 * continua reservado para a ação principal (design.md).
 */
export function GoogleSignInButton({ onError, label = "Continuar com Google" }: { onError: (message: string) => void; label?: string }) {
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  async function handleClick() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const result = await signInWithGoogle(`${window.location.origin}/dashboard/videos`);
      if (!result.ok) {
        onError(result.message);
        setLoading(false);
      }
      // ok: o wrapper assume (redirect/popup) — o loading fica até a navegação.
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={loading}
      variant="outline"
      className="h-11 w-full rounded-xl text-sm font-semibold text-[#191A23] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin text-[#191A23]" aria-hidden />
      ) : (
        <GoogleIcon />
      )}
      {loading ? "Abrindo o Google…" : label}
    </Button>
  );
}

/** Ícone oficial "G" multicolorido (SVG inline, sem dependência de lib). */
function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.13-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.88 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
