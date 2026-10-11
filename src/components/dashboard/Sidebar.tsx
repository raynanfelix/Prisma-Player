"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { usePathname } from "next/navigation";
import {
  Video,
  FlaskConical,
  Shield,
  Target,
  Settings,
  CreditCard,
  BrainCircuit,
  LifeBuoy,
  Menu,
  X,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

const menuItems = [
  { label: "Meus vídeos", href: "/dashboard/videos", icon: Video },
  { label: "Testes A/B", href: "/dashboard/ab-tests", icon: FlaskConical },
  { label: "Segurança", href: "/dashboard/security", icon: Shield },
  { label: "Conversões", href: "/dashboard/conversions", icon: Target },
  { label: "Inteligência", href: "/dashboard/intelligence", icon: BrainCircuit },
  { label: "Configurações", href: "/dashboard/settings", icon: Settings },
  { label: "Plano", href: "/dashboard/billing", icon: CreditCard },
];

export default function Sidebar({ collapsed = false, onCollapsedChange }: { collapsed?: boolean; onCollapsedChange?: (collapsed: boolean) => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState(true);

  useEffect(() => {
    fetch("/api/account/access", { cache: "no-store" }).then((response) => response.json()).then((data) => setHasAccess(Boolean(data.hasAccess))).catch(() => setHasAccess(false));
  }, []);

  function isActive(href: string) {
    return pathname.startsWith(href);
  }

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
        className="fixed left-4 top-3 z-50 flex h-11 w-11 items-center justify-center rounded-full border themeable-bg-surface-pearl themeable-border-hairline themeable-text-ink transition-transform active:scale-95 lg:hidden"
      >
        <Menu size={18} />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-40 h-dvh w-64
          themeable-bg-canvas border-r themeable-border-hairline
          flex flex-col transition-[width,transform] duration-300 ease-out
          ${collapsed ? "lg:w-16" : "lg:w-64"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className={`flex h-16 items-center border-b themeable-border-hairline ${collapsed ? "lg:justify-center lg:px-2" : "justify-between px-4"}`}>
          <Link
            href="/dashboard/videos"
            className={`min-w-0 items-center ${collapsed ? "flex lg:hidden" : "flex"}`}
            aria-label="Prisma Player"
            onClick={() => setMobileOpen(false)}
          >
            <BrandLogo className="h-8 w-[154px]" priority />
          </Link>
          <button
            type="button"
            onClick={() => onCollapsedChange?.(!collapsed)}
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            title={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            className={`hidden h-10 w-10 items-center justify-center rounded-[12px] themeable-text-ink-muted-48 transition hover:bg-prisma-blue/10 hover:text-prisma-blue lg:flex ${collapsed ? "" : "ml-2"}`}
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="flex h-11 w-11 items-center justify-center rounded-full themeable-text-ink-muted-48 transition-transform active:scale-95 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const active = isActive(item.href);
            const locked = !hasAccess && !item.href.startsWith("/dashboard/settings") && !item.href.startsWith("/dashboard/billing");
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
                className={`
                  relative flex items-center gap-3 rounded-lg transition-all active:scale-[0.98]
                  min-h-11 px-3 py-2.5
                  ${collapsed ? "lg:justify-center lg:px-0" : ""}
                  ${
                    active
                      ? "bg-prisma-blue text-white"
                      : "themeable-text-ink-muted-48 hover:themeable-bg-surface-pearl hover:themeable-text-ink"
                  }
                `}
              >
                <item.icon
                  size={20}
                  className={`flex-shrink-0 ${active ? "text-white" : ""}`}
                />
                <span className={`text-[15px] font-semibold tracking-[-0.2px] ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                {locked && <LockKeyhole size={14} className={`${collapsed ? "absolute right-1 top-1 lg:block" : "ml-auto"} opacity-60`} aria-label="Recurso bloqueado" />}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t themeable-border-hairline">
          <Link
            href="#"
            title={collapsed ? "Ajuda" : undefined}
            className={`
              flex items-center gap-3 rounded-lg transition-all active:scale-[0.98]
              themeable-text-ink-muted-48 hover:themeable-bg-surface-pearl hover:themeable-text-ink
              min-h-11 px-3 py-2.5
              ${collapsed ? "lg:justify-center lg:px-0" : ""}
            `}
          >
            <LifeBuoy size={20} className="flex-shrink-0" />
            <span className={`text-[15px] font-semibold tracking-[-0.2px] ${collapsed ? "lg:hidden" : ""}`}>{t("help")}</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
