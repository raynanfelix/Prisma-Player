"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, BrainCircuit, CircleDollarSign, Globe, LayoutDashboard,
  LifeBuoy, LogOut, Menu, PanelLeftClose, PanelLeftOpen, TrendingUp,
  Users, Video, CreditCard, ShieldCheck, X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import AdminTopbarSearch from "@/components/admin/AdminTopbarSearch";

const groups: Array<{ label: string; items: Array<{ href: string; label: string; icon: typeof Users }> }> = [
  { label: "Command center", items: [{ href: "/admin", label: "Visão geral", icon: LayoutDashboard }] },
  { label: "Clientes", items: [
    { href: "/admin/users", label: "Contas", icon: Users },
    { href: "/admin/support", label: "Suporte", icon: LifeBuoy },
  ] },
  { label: "Negócio", items: [
    { href: "/admin/growth", label: "Crescimento", icon: TrendingUp },
    { href: "/admin/finance", label: "Receita e financeiro", icon: CircleDollarSign },
  ] },
  { label: "Produto", items: [
    { href: "/admin/content", label: "Vídeos e storage", icon: Video },
    { href: "/admin/credits", label: "Prisma IA e créditos", icon: BrainCircuit },
  ] },
  { label: "Plataforma", items: [
    { href: "/admin/system", label: "Saúde do sistema", icon: BarChart3 },
    { href: "/admin/seo", label: "SEO e IA", icon: Globe },
    { href: "/admin/team", label: "Equipe", icon: ShieldCheck },
  ] },
];

const titles: Record<string, string> = {
  "/admin": "Visão geral", "/admin/users": "Contas", "/admin/support": "Suporte",
  "/admin/growth": "Crescimento", "/admin/finance": "Receita e financeiro",
  "/admin/billing": "Receita e planos", "/admin/content": "Vídeos e storage",
  "/admin/credits": "Prisma IA e créditos", "/admin/system": "Saúde do sistema",
  "/admin/seo": "SEO e IA", "/admin/team": "Equipe",
};

function NavList({ collapsed, onNavigate, active }: { collapsed?: boolean; onNavigate?: () => void; active: (href: string) => boolean }) {
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Administração">
      {groups.map((group) => (
        <div key={group.label} className="mb-5">
          {!collapsed && <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.15em] themeable-text-ink-muted-48">{group.label}</p>}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = active(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  onClick={onNavigate}
                  className={`flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prisma-blue ${collapsed ? "justify-center" : ""} ${isActive ? "bg-selected text-selected-foreground font-semibold data-active:bg-selected" : "themeable-text-ink hover:bg-black/5 dark:hover:bg-transparent dark:hover:text-white"}`}
                >
                  <Icon size={18} className="shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Shell do Control Center: sidebar colapsível + topbar com busca + drawer mobile. */
export default function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const active = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(href));
  const title = titles[pathname] ?? (pathname.startsWith("/admin/users/") ? "Conta" : pathname.startsWith("/admin/support/") ? "Caso" : "Administração");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh themeable-bg-canvas-parchment themeable-text-ink">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-selected focus:px-3 focus:py-2 focus:text-selected-foreground">Pular para o conteúdo</a>
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r bg-white themeable-border-hairline dark:bg-sidebar md:flex ${collapsed ? "w-16" : "w-[248px]"}`} aria-label="Navegação administrativa">
        <div className={`flex h-16 items-center border-b themeable-border-hairline ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          {collapsed ? <Link href="/admin" title="Prisma Player" aria-label="Visão geral"><Logo /></Link> : <Link href="/admin" aria-label="Prisma Player — Administração"><Logo /></Link>}
          {!collapsed && (
            <button type="button" onClick={() => setCollapsed(true)} aria-label="Recolher barra lateral" className="grid h-9 w-9 place-items-center rounded-lg themeable-text-ink-muted-48 hover:bg-black/5 dark:hover:bg-transparent"><PanelLeftClose size={18} /></button>
          )}
        </div>
        {collapsed && <button type="button" onClick={() => setCollapsed(false)} aria-label="Expandir barra lateral" className="mx-auto mt-2 grid h-9 w-9 place-items-center rounded-lg themeable-text-ink-muted-48 hover:bg-black/5 dark:hover:bg-transparent"><PanelLeftOpen size={18} /></button>}
        <NavList collapsed={collapsed} active={active} />
        <div className={`border-t px-4 py-4 themeable-border-hairline ${collapsed ? "px-2 text-center" : ""}`}>
          {!collapsed && <p className="text-[11px] font-semibold uppercase tracking-[.12em] themeable-text-ink-muted-48">Administrador</p>}
          <p className="mt-1 truncate text-[12px] themeable-text-ink" title={email}>{collapsed ? email.slice(0, 1).toUpperCase() : email}</p>
          <Link href="/dashboard/videos" className={`mt-2 flex min-h-9 items-center gap-2 rounded-[10px] px-2 text-[12px] font-medium themeable-text-ink-muted-48 hover:bg-black/5 dark:hover:bg-transparent ${collapsed ? "justify-center" : ""}`} title="Voltar ao produto"><CreditCard size={15} className="shrink-0" aria-hidden />{!collapsed && "Voltar ao produto"}</Link>
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/45" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r bg-white themeable-border-hairline dark:bg-sidebar" aria-label="Menu administrativo">
            <div className="flex h-16 items-center justify-between border-b px-4 themeable-border-hairline">
              <Link href="/admin" onClick={() => setDrawer(false)} aria-label="Visão geral"><Logo /></Link>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Fechar menu" className="grid h-10 w-10 place-items-center rounded-full themeable-text-ink"><X size={20} /></button>
            </div>
            <NavList active={active} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className={`${collapsed ? "md:pl-16" : "md:pl-[248px]"}`}>
        <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur-xl themeable-border-hairline dark:bg-black/85">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button type="button" onClick={() => setDrawer(true)} aria-label="Abrir menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-full themeable-text-ink md:hidden"><Menu size={19} /></button>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[15px] font-semibold themeable-text-ink">{title}</p>
              <p className="text-[11px] themeable-text-ink-muted-48">Prisma Control Center</p>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
              <AdminTopbarSearch />
              <button type="button" onClick={() => void logout()} className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[12px] font-semibold themeable-text-ink-muted-48 hover:themeable-text-ink dark:border-zinc-800" title={`Sair (${email})`}><LogOut size={15} aria-hidden /><span className="hidden lg:inline">Sair</span></button>
            </div>
          </div>
        </header>
        <main id="admin-main" className="mx-auto min-h-dvh w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
