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
    <footer className="bg-[#F3F3F3] pt-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Main Footer Container (Dark Positivus) */}
        <div className="rounded-t-[45px] border-2 border-b-0 border-[#191A23] bg-[#191A23] p-8 sm:p-14 text-white shadow-[8px_-4px_0px_#191A23]">
          
          {/* Top Row: Logo & Nav Links */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-12 border-b border-white/20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B9FF66] text-[#191A23]">
                <Play className="h-5 w-5 fill-[#191A23] ml-0.5" />
              </div>
              <span className="text-2xl font-black tracking-tight text-white">
                Prisma<span className="text-[#B9FF66] font-light">Player</span>
              </span>
            </Link>

            {/* Nav Links */}
            <div className="flex flex-wrap items-center gap-6 text-sm font-bold">
              <Link href="/services" className="hover:text-[#B9FF66] transition-colors">
                Serviços
              </Link>
              <Link href="/about" className="hover:text-[#B9FF66] transition-colors">
                Sobre Nós
              </Link>
              <Link href="/pricing" className="hover:text-[#B9FF66] transition-colors">
                Preços
              </Link>
              <Link href="/#casos-de-uso" className="hover:text-[#B9FF66] transition-colors">
                Casos de Uso
              </Link>
              <Link href="/#processo" className="hover:text-[#B9FF66] transition-colors">
                Como Funciona
              </Link>
            </div>
          </div>

          {/* Middle Row: Contact Info & Newsletter Form */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 py-12 border-b border-white/20 items-center">
            
            {/* Contact Info Box */}
            <div className="lg:col-span-6 space-y-4">
              <span className="inline-block rounded-lg bg-[#B9FF66] px-3 py-1 text-xs font-black text-[#191A23]">
                Contato & Suporte
              </span>
              <p className="text-sm font-medium text-white/80 leading-relaxed">
                E-mail: suporte@prismaplayer.com.br
              </p>
              <p className="text-sm font-medium text-white/80 leading-relaxed">
                WhatsApp: +55 (11) 98765-4321
              </p>
              <p className="text-sm font-medium text-white/80 leading-relaxed">
                Atendimento de Segunda a Domingo — Suporte Técnico 24/7
              </p>
            </div>

            {/* Newsletter Box */}
            <div className="lg:col-span-6 rounded-3xl border-2 border-white/20 bg-[#292A32] p-6 sm:p-8">
              {subscribed ? (
                <div className="flex items-center gap-3 text-[#B9FF66] font-bold text-sm">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Cadastrado com sucesso! Enviaremos as melhores dicas de retenção.</span>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row items-stretch gap-3">
                  <input
                    type="email"
                    required
                    placeholder="Digite seu melhor e-mail..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-medium text-white placeholder-white/50 focus:outline-none focus:border-[#B9FF66]"
                  />
                  <button
                    type="submit"
                    className="rounded-xl border-2 border-[#191A23] bg-[#B9FF66] px-6 py-3 text-sm font-black text-[#191A23] shadow-[2px_2px_0px_#191A23] hover:bg-[#B9FF66]/90 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Inscrever-se
                  </button>
                </form>
              )}
            </div>

          </div>

          {/* Bottom Row: Copyright & Legal */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-white/60">
            <p>© {new Date().getFullYear()} Prisma Player. Todos os direitos reservados.</p>
            <div className="flex items-center gap-6">
              <Link href="/privacy" className="hover:text-white transition-colors">
                Política de Privacidade
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Termos de Uso
              </Link>
            </div>
          </div>

        </div>

      </div>
    </footer>
  );
}
