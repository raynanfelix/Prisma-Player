"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, CheckCircle2 } from "lucide-react";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubscribed(true);
  };

  return (
    <footer className="bg-white px-4 pb-8 pt-4 sm:px-6">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] bg-[#191A23] p-8 text-white sm:p-12">
        <div className="flex flex-col justify-between gap-8 border-b border-white/10 pb-10 md:flex-row md:items-center">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#B9FF66]">
              <Play className="ml-0.5 h-3.5 w-3.5 fill-[#191A23]" />
            </span>
            <span className="text-[17px] font-semibold tracking-tight text-white">
              Prisma<span className="font-light text-white/60">Player</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px] font-medium text-white/60">
            <Link href="/services" className="transition-colors hover:text-[#B9FF66]">
              Serviços
            </Link>
            <Link href="/about" className="transition-colors hover:text-[#B9FF66]">
              Sobre Nós
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-[#B9FF66]">
              Preços
            </Link>
            <Link href="/#casos-de-uso" className="transition-colors hover:text-[#B9FF66]">
              Casos de Uso
            </Link>
            <Link href="/#processo" className="transition-colors hover:text-[#B9FF66]">
              Como Funciona
            </Link>
          </nav>
        </div>

        <div className="grid grid-cols-1 items-center gap-8 py-10 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-6">
            <span className="inline-flex rounded-full bg-[#B9FF66] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#191A23]">
              Contato &amp; Suporte
            </span>
            <p className="text-[13px] text-white/60">E-mail: suporte@prismaplayer.online</p>
            <p className="text-[13px] text-white/60">WhatsApp: +55 (11) 98765-4321</p>
            <p className="text-[13px] text-white/60">
              Atendimento de Segunda a Domingo com Suporte Técnico 24/7
            </p>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-6 lg:col-span-6">
            {subscribed ? (
              <div className="flex items-center gap-2.5 text-[13px] font-medium text-[#B9FF66]">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>Cadastrado com sucesso! Enviaremos as melhores dicas de retenção.</span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col items-stretch gap-2.5 sm:flex-row">
                <label htmlFor="footer-email" className="sr-only">
                  Seu e-mail
                </label>
                <input
                  id="footer-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  placeholder="Digite seu melhor e-mail…"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 rounded-full border border-white/10 bg-white/[0.06] px-4 py-3 text-[13px] text-white outline-none transition placeholder:text-white/35 focus:border-[#B9FF66]/50 focus:bg-white/[0.1]"
                />
                <button
                  type="submit"
                  className="cursor-pointer whitespace-nowrap rounded-full bg-[#B9FF66] px-5 py-3 text-[13px] font-medium text-[#191A23] transition-colors hover:bg-[#a8f052]"
                >
                  Inscrever-se
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-[11.5px] text-white/40 sm:flex-row">
          <p>© {new Date().getFullYear()} Prisma Player. Todos os direitos reservados.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="transition-colors hover:text-white">
              Política de Privacidade
            </Link>
            <Link href="/terms" className="transition-colors hover:text-white">
              Termos de Uso
            </Link>
            <Link href="/cookies" className="transition-colors hover:text-white">
              Cookies
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
