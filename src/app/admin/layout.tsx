import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/server";
import AdminSidebar from "./admin-sidebar";

export const metadata: Metadata = { title: "Administração", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <div className="min-h-dvh themeable-bg-canvas-parchment themeable-text-ink">
    <AdminSidebar email={user.email ?? "Administrador"} />
    <main className="min-w-0 md:pl-[248px]">
      <div className="mx-auto min-h-dvh w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">{children}</div>
    </main>
  </div>;
}
