import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-svh max-h-svh flex-col overflow-hidden bg-background">
      <SidebarProvider className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <AppSidebar />
        <SidebarInset className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
          <AppHeader />
          <main
            id="main-content"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-3 sm:p-5 lg:p-6"
          >
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
