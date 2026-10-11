"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, Play } from "lucide-react";

interface NavProps {
  account?: { firstName: string } | null;
}

export default function Nav({ account }: NavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Serviços", href: "/services" },
    { name: "Sobre Nós", href: "/about" },
    { name: "Casos de Uso", href: "/#casos-de-uso" },
    { name: "Preços", href: "/#precos" },
    { name: "Como Funciona", href: "/#processo" },
    { name: "Depoimentos", href: "/#depoimentos" },
  ];

  return (
    <header className="sticky top-4 z-50 mx-auto max-w-7xl px-4 sm:px-6 transition-all">
      {/* Floating Pill Container */}
      <div className="rounded-full border-2 border-[#191A23] bg-white/95 backdrop-blur-md px-4 sm:px-6 py-2.5 shadow-[4px_4px_0px_#191A23] flex items-center justify-between">
        
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#191A23] text-[#B9FF66] shadow-[2px_2px_0px_#191A23] group-hover:scale-105 transition-transform">
            <Play className="h-4 w-4 fill-[#B9FF66] ml-0.5" />
          </div>
          <span className="text-lg font-black tracking-tight text-[#191A23]">
            Prisma<span className="font-light">Player</span>
          </span>
        </Link>

        {/* Center Desktop Links */}
        <nav className="hidden lg:flex items-center gap-6">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-xs sm:text-sm font-bold text-[#191A23]/80 hover:text-[#191A23] hover:bg-[#B9FF66] px-3 py-1.5 rounded-full transition-colors"
            >
              {link.name}
            </a>
          ))}
        </nav>

        {/* Right Action CTAs */}
        <div className="hidden md:flex items-center gap-3">
          {account ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full border-2 border-[#191A23] bg-[#B9FF66] px-5 py-2 text-xs font-black text-[#191A23] shadow-[2px_2px_0px_#191A23] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            >
              Painel ({account.firstName})
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full border-2 border-[#191A23] bg-[#B9FF66] px-5 py-2 text-xs font-black text-[#191A23] shadow-[2px_2px_0px_#191A23] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                Testar Grátis
              </Link>

              <span className="text-[#191A23]/30 font-light">|</span>

              <Link
                href="/login"
                className="text-xs font-bold text-[#191A23] hover:underline underline-offset-4 px-2"
              >
                Entrar
              </Link>
            </>
          )}
        </div>

        {/* Mobile Toggle Button */}
        <div className="flex lg:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-full border-2 border-[#191A23] bg-white p-2 text-[#191A23] shadow-[2px_2px_0px_#191A23]"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="mt-3 lg:hidden rounded-3xl border-2 border-[#191A23] bg-white p-5 shadow-[6px_6px_0px_#191A23] space-y-2">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-2xl border border-[#191A23]/10 bg-[#F3F3F3] px-4 py-2.5 text-sm font-bold text-[#191A23]"
            >
              {link.name}
            </a>
          ))}
          <div className="pt-2 space-y-2">
            {account ? (
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center justify-center rounded-full border-2 border-[#191A23] bg-[#B9FF66] py-3 text-sm font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]"
              >
                Acessar Painel ({account.firstName})
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-center rounded-full border-2 border-[#191A23] bg-[#B9FF66] py-3 text-sm font-black text-[#191A23] shadow-[3px_3px_0px_#191A23]"
                >
                  Testar 14 Dias Grátis
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-center rounded-full border-2 border-[#191A23] bg-white py-2.5 text-sm font-bold text-[#191A23] shadow-[2px_2px_0px_#191A23]"
                >
                  Fazer Login
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
