"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockKeyhole, LoaderCircle, Sparkles } from "lucide-react";

const FREE_ROUTES = ["/dashboard/billing", "/dashboard/settings"];

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const unrestricted = FREE_ROUTES.some((route) => pathname.startsWith(route));
  const [state, setState] = useState<{ checkedPath: string | null; access: boolean; trial: boolean }>({
    checkedPath: null, access: false, trial: false,
  });

  const checkAccess = useCallback(async () => {
    try {
      const response = await fetch("/api/account/access", { cache: "no-store" });
      if (!response.ok) {
        setState({ checkedPath: pathname, access: false, trial: false });
        return;
      }
      const data = await response.json();
      setState({ checkedPath: pathname, access: Boolean(data.hasAccess), trial: data.trialStatus === "available" });
    } catch {
      setState({ checkedPath: pathname, access: false, trial: false });
    }
  }, [pathname]);

  useEffect(() => {
    if (unrestricted) return;
    const timer = window.setTimeout(() => void checkAccess(), 0);
    return () => window.clearTimeout(timer);
  }, [checkAccess, unrestricted]);

  if (unrestricted) return children;
  if (state.checkedPath !== pathname) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <LoaderCircle className="animate-spin text-prisma-blue" />
      </div>
    );
  }
  if (!state.access) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center p-5">
        <section className="max-w-md rounded-[24px] border p-7 text-center themeable-bg-canvas themeable-border-hairline">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-prisma-blue/10 text-prisma-blue">
            <LockKeyhole size={26} />
          </div>
          <h1 className="mt-5 text-[26px] font-semibold themeable-text-ink">
            Ative seu acesso para continuar
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed themeable-text-ink-muted-48">
            Seu projeto continua seguro. Ative os 14 dias gratis ou escolha um plano para liberar esta area.
          </p>
          <Link
            href={state.trial ? "/welcome" : "/dashboard/billing"}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-prisma-blue px-6 text-[14px] font-semibold text-white"
          >
            <Sparkles size={17} />
            {state.trial ? "Ativar teste gratis" : "Ver planos"}
          </Link>
        </section>
      </div>
    );
  }
  return children;
}
