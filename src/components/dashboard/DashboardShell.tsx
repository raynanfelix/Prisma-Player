"use client";

import { AppShell } from "@/components/app-shell";
import PageTransition from "@/components/motion/page-transition";
import AccessGate from "@/features/access/components/AccessGate";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AccessGate>
        <PageTransition>{children}</PageTransition>
      </AccessGate>
    </AppShell>
  );
}
