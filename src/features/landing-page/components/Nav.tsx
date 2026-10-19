"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X, Play } from "lucide-react";

interface NavProps {
  account?: { firstName: string } | null;
}

export default function Nav({ account }: NavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Navbar aberta por padrão: esconde com efeito ao rolar para baixo e
  // volta compacta ao rolar para cima.
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const lastYRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    lastYRef.current = window.scrollY;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const delta = y - lastYRef.current;
        lastYRef.current = y;
        setScrolled(y > 40);
        if (y <= 80) setHidden(false);
        else if (delta > 8) setHidden(true);
        else if (delta < -8) setHidden(false);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const navLinks = [
    { name: "Serviços", href: "/services" },
    { name: "Sobre Nós", href: "/about" },
    { name: "Casos de Uso", href: "/#casos-de-uso" },
    { name: "Preços", href: "/#precos" },
    { name: "Como Funciona", href: "/#processo" },
    { name: "Depoimentos", href: "/#depoimentos" },
  ];

  return (
    <header
      className={`sticky top-3 z-50 mx-auto -mb-[52px] w-full max-w-5xl px-4 sm:px-6 transition duration-300 ease-out will-change-transform ${
        hidden
          ? "-translate-y-[130%] opacity-0 pointer-events-none"
          : "translate-y-0 opacity-100"
      }`}
    >
      {/* Pill flutuante translúcida sobre o céu do hero */}
      <div
        className={`flex items-center justify-between rounded-full border border-white/70 bg-white/75 px-2.5 py-2 backdrop-blur-xl transition duration-300 ${
          scrolled
            ? "shadow-[0_8px_30px_-16px_rgba(25,26,35,0.35)]"
            : "shadow-[0_10px_40px_-20px_rgba(25,26,35,0.3)]"
        }`}
      >
        <Link href="/" className="group flex items-center gap-2.5 pl-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#191A23] text-[#B9FF66] transition-transform duration-300 group-hover:scale-105">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-[#B9FF66]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-[#191A23]">
            Prisma<span className="font-light text-[#191A23]/70">Player</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Principal">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-[13px] font-medium text-[#191A23]/70 transition-colors hover:bg-[#191A23]/[0.04] hover:text-[#191A23]"
            >
              {link.name}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          {account ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-[#191A23] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#191A23]/90"
            >
              Painel ({account.firstName})
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3.5 py-2 text-[13px] font-medium text-[#191A23]/70 transition-colors hover:bg-[#191A23]/[0.04] hover:text-[#191A23]"
              >
                Entrar
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full bg-[#191A23] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#191A23]/90 active:scale-[0.98]"
              >
                Testar Grátis
              </Link>
            </>
          )}
        </div>

        <div className="flex lg:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#191A23] transition-colors hover:bg-[#191A23]/[0.05]"
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Drawer mobile */}
      {mobileMenuOpen && (
        <div className="mt-3 space-y-1 rounded-[28px] border border-white/70 bg-white/90 p-3 shadow-[0_24px_60px_-30px_rgba(25,26,35,0.45)] backdrop-blur-xl lg:hidden">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-2xl px-4 py-2.5 text-sm font-medium text-[#191A23]/80 transition-colors hover:bg-[#191A23]/[0.04] hover:text-[#191A23]"
            >
              {link.name}
            </a>
          ))}
          <div className="space-y-2 pt-2">
            {account ? (
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center justify-center rounded-full bg-[#191A23] py-3 text-sm font-medium text-white"
              >
                Acessar Painel ({account.firstName})
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-center rounded-full bg-[#191A23] py-3 text-sm font-medium text-white"
                >
                  Testar 14 Dias Grátis
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-center rounded-full border border-[#191A23]/10 bg-white py-3 text-sm font-medium text-[#191A23]"
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
