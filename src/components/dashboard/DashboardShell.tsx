"use client";

import { AppShell } from "@/components/app-shell";
import AccessGate from "@/features/access/components/AccessGate";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AccessGate>{children}</AccessGate>
    </AppShell>
  );
}
