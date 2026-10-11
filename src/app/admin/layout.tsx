import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/server";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Administração", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <AdminShell email={user.email ?? "Administrador"}>{children}</AdminShell>;
}
