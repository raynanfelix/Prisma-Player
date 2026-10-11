"use client";

import Link from "next/link";
import { footerNavLinks, navGroups } from "@/components/app-shared";
import { Logo, LogoIcon } from "@/components/logo";
import { NavGroup } from "@/components/nav-group";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/i18n/I18nProvider";

export function AppSidebar() {
  const { t } = useI18n();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar
      data-i18n-managed
      collapsible="icon"
      variant="sidebar"
      className="border-r border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-sidebar text-[#191A23] dark:text-zinc-100"
    >
      <SidebarHeader className="h-16 items-center justify-center border-b border-slate-200/80 dark:border-zinc-800 px-4 bg-white dark:bg-sidebar">
        {isCollapsed ? (
          <Link href="/dashboard/videos" title="Prisma Player">
            <LogoIcon className="size-8" />
          </Link>
        ) : (
          <Logo />
        )}
      </SidebarHeader>
      <SidebarContent className="py-3 px-2 bg-white dark:bg-sidebar">
        {navGroups.map((group, index) => (
          <NavGroup key={`sidebar-group-${index}`} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-slate-200/80 dark:border-zinc-800 p-3 bg-white dark:bg-sidebar">
        <SidebarMenu className="gap-1">
          {footerNavLinks.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.messageKey ? t(item.messageKey) : item.title}
                className="min-h-10 rounded-xl border border-transparent px-3 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:border-slate-200 dark:hover:border-zinc-800 hover:bg-[#B9FF66]/15 dark:hover:bg-transparent hover:text-[#191A23] dark:hover:text-white transition-all cursor-pointer"
                render={<Link href={item.path ?? "#"} />}
              >
                {item.icon}
                <span className="font-semibold">{item.messageKey ? t(item.messageKey) : item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
