import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function Nav() {
  const userId = await getCurrentUserId();
  const profile = userId ? (await createAdminClient().from("profiles").select("full_name").eq("id", userId).maybeSingle()).data : null;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Minha conta";
  return <nav className="fixed inset-x-0 top-0 z-50 h-11 bg-surface-black"><div className="container-section mx-auto flex h-full max-w-[1440px] items-center justify-between px-5"><div className="flex items-center gap-6"><Link href="/" className="flex shrink-0 items-center" aria-label="Prisma Player"><BrandLogo className="h-[26px] w-[132px]" priority darkSurface /></Link><div className="hidden items-center gap-5 md:flex">{[["Funcionalidades", "/#features"], ["Planos", "/pricing"], ["Parcerias", "#"], ["Ajuda", "#"]].map(([label, href]) => <a key={label} href={href} className="text-xs tracking-[-0.12px] text-white/80 transition-colors hover:text-white">{label}</a>)}</div></div><div className="flex items-center gap-1.5"><ThemeToggle onDarkSurface />{!userId && <Link href="/login" className="hidden text-xs text-white/80 hover:text-white sm:block">Entrar</Link>}<Link href={userId ? "/dashboard/videos" : "/signup"} className="rounded-sm bg-prisma-blue px-3.5 py-2 text-xs text-white transition-all hover:opacity-90 active:scale-95">{userId ? `${firstName} · Dashboard` : "Criar conta grátis"}</Link></div></div></nav>;
}
