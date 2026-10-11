"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { SidebarNavItem } from "@/components/app-shared";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

interface NavGroupProps {
  label?: string;
  items: SidebarNavItem[];
}

function isPathActive(pathname: string, targetPath?: string) {
  if (!targetPath) return false;
  if (targetPath === "/dashboard/videos" && (pathname === "/dashboard" || pathname === "/dashboard/videos")) {
    return true;
  }
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

export function NavGroup({ label, items }: NavGroupProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  const titleFor = (item: SidebarNavItem) => (item.messageKey ? t(item.messageKey) : item.title);

  return (
    <SidebarGroup className="px-1 py-1">
      {label ? (
        <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 px-3 py-1.5">
          {label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const isItemActive = isPathActive(pathname, item.path);
            const hasActiveSubItem = item.subItems?.some((subItem: SidebarNavItem) => isPathActive(pathname, subItem.path));

            return (
              <Collapsible
                className="group/collapsible"
                defaultOpen={isItemActive || hasActiveSubItem}
                key={item.title}
                render={<SidebarMenuItem />}
              >
                {item.subItems?.length ? (
                  <>
                    <CollapsibleTrigger
                      render={<SidebarMenuButton isActive={isItemActive} />}
                      className={cn(
                        "min-h-10 rounded-xl px-3 text-xs font-semibold transition-all cursor-pointer border",
                        isItemActive
                          ? "border-slate-300 dark:border-zinc-700 bg-selected text-selected-foreground font-bold shadow-xs data-active:bg-selected data-active:text-selected-foreground dark:hover:bg-selected"
                          : "border-transparent text-slate-600 dark:text-zinc-400 hover:border-slate-200 dark:hover:border-zinc-800 hover:bg-[#B9FF66]/15 dark:hover:bg-transparent hover:text-[#191A23] dark:hover:text-white"
                      )}
                    >
                      {item.icon}
                      <span>{titleFor(item)}</span>
                      <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="border-l border-slate-200 dark:border-zinc-800 pl-2 my-1 space-y-1">
                        {item.subItems.map((subItem: SidebarNavItem) => {
                          const isSubActive = isPathActive(pathname, subItem.path);
                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                isActive={isSubActive}
                                render={<Link href={subItem.path ?? "#"} />}
                                className={cn(
                                  "min-h-9 rounded-lg border px-3 text-xs transition-all cursor-pointer",
                                  isSubActive
                                    ? "border-slate-300 dark:border-zinc-700 bg-selected text-selected-foreground font-bold shadow-xs data-active:bg-selected data-active:text-selected-foreground dark:hover:bg-selected"
                                    : "border-transparent text-slate-600 dark:text-zinc-400 font-medium hover:bg-[#B9FF66]/15 dark:hover:bg-transparent hover:text-[#191A23] dark:hover:text-white"
                                )}
                              >
                                {subItem.icon}
                                <span>{titleFor(subItem)}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                ) : (
                  <SidebarMenuButton
                    isActive={isItemActive}
                    tooltip={titleFor(item)}
                    render={<Link href={item.path ?? "#"} />}
                    className={cn(
                      "min-h-10 rounded-xl px-3 text-xs transition-all cursor-pointer border",
                      isItemActive
                        ? "border-slate-300 dark:border-zinc-700 bg-selected text-selected-foreground font-bold shadow-xs data-active:bg-selected data-active:text-selected-foreground dark:hover:bg-selected"
                        : "border-transparent text-slate-600 dark:text-zinc-400 font-semibold hover:border-slate-200 dark:hover:border-zinc-800 hover:bg-[#B9FF66]/15 dark:hover:bg-transparent hover:text-[#191A23] dark:hover:text-white",
                    )}
                  >
                    {item.icon}
                    <span>{titleFor(item)}</span>
                  </SidebarMenuButton>
                )}
              </Collapsible>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
