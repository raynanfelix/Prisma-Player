"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Marca das telas de autenticação.
 *
 * Renderiza o MESMO componente de logo usado pela sidebar do app
 * (src/components/app-sidebar.tsx → `Logo`/`LogoIcon` de @/components/logo),
 * garantindo a mesma identidade visual dentro e fora do dashboard.
 */
export function AuthBrandHeader() {
  return (
    <div className="flex justify-center">
      <Link
        href="/"
        aria-label="Prisma Player - página inicial"
        className="inline-flex transition-transform hover:scale-[1.02]"
      >
        <Logo />
      </Link>
    </div>
  );
}
