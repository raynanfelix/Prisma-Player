"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Activity, AlertTriangle, Bell, BrainCircuit, ChevronDown, CircleDollarSign,
  CreditCard, Globe, HelpCircle, LayoutDashboard, LifeBuoy, LogOut, Menu,
  Moon, ShieldCheck, Sun, TrendingUp, Users, Video, X,
} from "lucide-react";
import { Logo, LogoIcon } from "@/components/logo";
import AdminTopbarSearch from "@/components/admin/AdminTopbarSearch";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type NavItem = { href: string; label: string; icon: typeof Users };

const NAV_MAIN: NavItem[] = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin/users", label: "Contas", icon: Users },
  { href: "/admin/finance", label: "Financeiro", icon: CircleDollarSign },
  { href: "/admin/support", label: "Suporte", icon: LifeBuoy },
  { href: "/admin/content", label: "Conteúdo", icon: Video },
  { href: "/admin/system", label: "Sistema", icon: Activity },
];

const NAV_MORE: NavItem[] = [
  { href: "/admin/growth", label: "Crescimento", icon: TrendingUp },
  { href: "/admin/credits", label: "Prisma IA e créditos", icon: BrainCircuit },
  { href: "/admin/billing", label: "Receita e planos", icon: CreditCard },
  { href: "/admin/team", label: "Equipe", icon: ShieldCheck },
  { href: "/admin/seo", label: "SEO e IA", icon: Globe },
  { href: "/admin/errors", label: "Monitor de erros", icon: AlertTriangle },
];

const NAV_ALL = [...NAV_MAIN, ...NAV_MORE];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

function applyTheme(next: "light" | "dark") {
  document.documentElement.classList.toggle("dark", next === "dark");
  localStorage.setItem("theme", next);
  window.dispatchEvent(new Event("prisma-theme-change"));
}

function initialsOf(email: string) {
  return email.slice(0, 2).toUpperCase() || "AD";
}

/** Rail vertical de ícones (desktop): tema no topo, nav no meio, sair embaixo. */
function IconRail({ pathname, onLogout }: { pathname: string; onLogout: () => void }) {
  return (
    <aside aria-label="Navegação administrativa" className="fixed inset-y-0 left-0 z-40 hidden w-[68px] flex-col items-center justify-between py-5 lg:flex">
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => applyTheme("light")} aria-label="Tema claro" className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-white hover:text-[#191A23] hover:shadow-xs dark:hover:bg-white/10 dark:hover:text-white">
          <Sun size={18} />
        </button>
        <button type="button" onClick={() => applyTheme("dark")} aria-label="Tema escuro" className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-white hover:text-[#191A23] hover:shadow-xs dark:hover:bg-white/10 dark:hover:text-white">
          <Moon size={18} />
        </button>
      </div>
      <nav className="flex flex-col items-center gap-1.5">
        {NAV_ALL.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`grid h-11 w-11 place-items-center rounded-[14px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FF66] ${active ? "bg-[#191A23] text-[#B9FF66] shadow-sm dark:bg-[#B9FF66] dark:text-[#191A23]" : "text-slate-400 hover:bg-white hover:text-[#191A23] hover:shadow-xs dark:hover:bg-white/10 dark:hover:text-white"}`}
            >
              <Icon size={19} aria-hidden />
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-2">
        <Link href="/dashboard/support" title="Ajuda" aria-label="Ajuda" className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-white hover:text-[#191A23] hover:shadow-xs dark:hover:bg-white/10 dark:hover:text-white">
          <HelpCircle size={18} />
        </Link>
        <button type="button" onClick={onLogout} title="Sair" aria-label="Sair" className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-white hover:text-red-500 hover:shadow-xs dark:hover:bg-white/10">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

function PillLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FF66] ${active ? "bg-[#191A23] text-white dark:bg-[#B9FF66] dark:text-[#191A23]" : "text-slate-500 hover:bg-slate-100 hover:text-[#191A23] dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"}`}
    >
      {item.label}
    </Link>
  );
}

/** Shell v2 (spec: docs/specs/ADMIN_REDESIGN_SPEC.md): rail de ícones + topbar flutuante em pílulas. */
export default function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const moreActive = NAV_MORE.some((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-dvh themeable-bg-canvas-parchment themeable-text-ink">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-selected focus:px-3 focus:py-2 focus:text-selected-foreground">Pular para o conteúdo</a>
      <IconRail pathname={pathname} onLogout={() => void logout()} />

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/45" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r bg-white themeable-border-hairline dark:bg-black" aria-label="Menu administrativo">
            <div className="flex h-16 items-center justify-between border-b px-4 themeable-border-hairline">
              <Link href="/admin" onClick={() => setDrawer(false)} aria-label="Visão geral"><Logo /></Link>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Fechar menu" className="grid h-10 w-10 place-items-center rounded-full themeable-text-ink"><X size={20} /></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3" aria-label="Páginas administrativas">
              {NAV_ALL.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setDrawer(false)} aria-current={active ? "page" : undefined}
                    className={`mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium ${active ? "bg-[#B9FF66] font-bold text-[#191A23]" : "themeable-text-ink hover:bg-[#B9FF66]/10"}`}>
                    <Icon size={17} aria-hidden />{item.label}
                  </Link>
                );
              })}
            </nav>
            <button type="button" onClick={() => void logout()} className="m-3 flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"><LogOut size={17} aria-hidden />Sair</button>
          </aside>
        </div>
      )}

      <div className="lg:pl-[84px]">
        <div className="px-3 pt-4 sm:px-5 lg:px-6">
          <header className="flex h-[68px] items-center gap-3 rounded-[22px] border bg-white px-4 shadow-[0_10px_30px_-18px_rgba(25,26,35,.25)] themeable-border-hairline dark:bg-white/[0.035]">
            <button type="button" onClick={() => setDrawer(true)} aria-label="Abrir menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-full themeable-text-ink lg:hidden"><Menu size={19} /></button>
            <Link href="/admin" className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 themeable-border-hairline" aria-label="Prisma Player - Administração">
              <LogoIcon className="size-6" />
              <span className="hidden text-[14px] font-bold tracking-[-.02em] themeable-text-ink sm:inline">Prisma Admin</span>
            </Link>
            <nav aria-label="Seções administrativas" className="mx-auto hidden items-center gap-1 xl:flex">
              {NAV_MAIN.map((item) => <PillLink key={item.href} item={item} active={isActive(pathname, item.href)} />)}
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <button type="button" aria-label="Mais seções" className={`flex items-center gap-1 rounded-full px-4 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FF66] ${moreActive ? "bg-[#191A23] text-white dark:bg-[#B9FF66] dark:text-[#191A23]" : "text-slate-500 hover:bg-slate-100 hover:text-[#191A23] dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"}`}>
                    Mais <ChevronDown size={14} aria-hidden />
                  </button>
                } />
                <DropdownMenuContent align="end" className="w-56 rounded-2xl border themeable-border-hairline">
                  {NAV_MORE.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} render={<Link href={item.href} />} className="gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium">
                        <Icon size={16} aria-hidden />{item.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <div className="hidden md:block"><AdminTopbarSearch /></div>
              <Link href="/admin/errors" title="Monitor de erros" aria-label="Monitor de erros" className="relative grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#191A23] dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white">
                <Bell size={18} aria-hidden />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <button type="button" aria-label="Menu da conta" className="flex items-center gap-2.5 rounded-full border py-1 pl-1 pr-2 transition hover:bg-slate-50 themeable-border-hairline dark:hover:bg-white/5">
                    <span className="grid size-8 place-items-center rounded-full bg-[#B9FF66] text-[11px] font-bold text-[#191A23]">{initialsOf(email)}</span>
                    <span className="hidden min-w-0 text-left sm:block">
                      <span className="block max-w-[140px] truncate text-[12px] font-bold leading-tight themeable-text-ink">Administrador</span>
                      <span className="block max-w-[140px] truncate text-[10px] leading-tight themeable-text-ink-muted-48">{email}</span>
                    </span>
                    <ChevronDown size={14} aria-hidden className="hidden text-slate-400 sm:inline" />
                  </button>
                } />
                <DropdownMenuContent align="end" className="w-52 rounded-2xl border themeable-border-hairline">
                  <DropdownMenuItem render={<Link href="/dashboard/videos" />} className="gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium"><CreditCard size={16} aria-hidden />Voltar ao produto</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void logout()} className="gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-red-500"><LogOut size={16} aria-hidden />Sair da conta</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
        </div>
        <main id="admin-main" className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
