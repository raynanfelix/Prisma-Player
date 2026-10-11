import type { Metadata } from "next";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { VideoUploadProvider } from "@/features/videos/components/VideoUploadProvider";
import { requireUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser("/dashboard/videos");
  return <VideoUploadProvider><DashboardShell>{children}</DashboardShell></VideoUploadProvider>;
}
