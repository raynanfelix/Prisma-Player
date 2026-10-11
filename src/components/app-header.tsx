"use client";

import { usePathname } from "next/navigation";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { navLinks } from "@/components/app-shared";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import AccountMenu from "@/components/dashboard/AccountMenu";
import ThemeToggle from "@/components/ThemeToggle";
import { Separator } from "@/components/ui/separator";
import InboxButton from "@/features/inbox/components/InboxButton";
import { useI18n } from "@/i18n/I18nProvider";

export function AppHeader() {
  const pathname = usePathname();
  const { t } = useI18n();
  const activeItem = [...navLinks]
    .filter((item) => item.path && pathname.startsWith(item.path))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];

  const page = activeItem
    ? {
        title: activeItem.messageKey ? t(activeItem.messageKey) : activeItem.title,
        icon: activeItem.icon,
      }
    : null;

  return (
    <header data-i18n-managed className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/88 px-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/72 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <CustomSidebarTrigger />
        <Separator orientation="vertical" className="hidden h-5 sm:block" />
        <AppBreadcrumbs page={page} />
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <InboxButton />
        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
        <AccountMenu />
      </div>
    </header>
  );
}
