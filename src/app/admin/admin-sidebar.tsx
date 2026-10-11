"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BrainCircuit, ChevronLeft, CreditCard, LayoutDashboard, Users, Video } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

const sections = [
  { label: "Operação", items: [
    { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
    { href: "/admin/users", label: "Contas", icon: Users },
    { href: "/admin/billing", label: "Receita e planos", icon: CreditCard },
  ] },
  { label: "Produto", items: [
    { href: "/admin/credits", label: "Prisma IA e créditos", icon: BrainCircuit },
    { href: "/admin/content", label: "Vídeos e storage", icon: Video },
    { href: "/admin/system", label: "Saúde do sistema", icon: BarChart3 },
  ] },
];

export default function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const items = sections.flatMap((section) => section.items);
  const active = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(href));
  return <>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r bg-white themeable-border-hairline dark:bg-sidebar md:flex">
      <div className="flex h-16 items-center border-b px-4 themeable-border-hairline"><BrandLogo className="h-8 w-[154px]" priority /></div>
      <div className="border-b px-3 py-3 themeable-border-hairline">
        <Link href="/dashboard/videos" className="flex min-h-10 items-center gap-2 rounded-[11px] px-3 text-[13px] font-medium themeable-text-ink-muted-48 transition hover:bg-black/5 hover:text-prisma-blue dark:hover:bg-transparent"><ChevronLeft size={16} />Voltar ao produto</Link>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => <section key={section.label} className="mb-6"><p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.15em] themeable-text-ink-muted-48">{section.label}</p><div className="space-y-1">{section.items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-[13px] font-medium transition ${active(item.href) ? "bg-prisma-blue-on-dark text-prisma-blue" : "themeable-text-ink hover:bg-black/5 dark:hover:bg-transparent"}`}><Icon size={18} />{item.label}</Link>; })}</div></section>)}
      </nav>
      <div className="border-t px-4 py-4 themeable-border-hairline"><p className="text-[11px] font-semibold uppercase tracking-[.12em] themeable-text-ink-muted-48">Administrador</p><p className="mt-1 truncate text-[12px] themeable-text-ink">{email}</p></div>
    </aside>
    <div className="sticky top-0 z-40 border-b bg-white/92 px-3 py-2 backdrop-blur-xl themeable-border-hairline dark:bg-black/82 md:hidden"><div className="flex gap-2 overflow-x-auto">{items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={`flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-[12px] font-medium ${active(item.href) ? "bg-prisma-blue-on-dark text-prisma-blue" : "themeable-text-ink"}`}><Icon size={15} />{item.label}</Link>; })}</div></div>
  </>;
}
