"use client";

import type { ReactNode } from "react";
import { AuthBrandHeader } from "./AuthBrandHeader";

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ eyebrow, title, description, children, footer }: AuthLayoutProps) {
  return (
    <main className="min-h-screen bg-[#F8F9FA] text-[#191A23] font-sans antialiased flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">

        {/* Logo Header - mesmo componente de marca da sidebar do app */}
        <AuthBrandHeader />

        {/* Clean Auth Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-7 sm:p-8 shadow-xs space-y-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {eyebrow}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#191A23]">
              {title}
            </h1>
            <p className="text-xs font-medium text-slate-500 leading-relaxed">
              {description}
            </p>
          </div>

          <div>{children}</div>

          <div className="pt-4 border-t border-slate-100 text-center text-xs font-semibold text-slate-600">
            {footer}
          </div>
        </div>

      </div>
    </main>
  );
}
