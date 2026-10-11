"use client";

import { Check, Inbox, Languages, LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocaleFlag } from "@/i18n/flags";
import { useI18n } from "@/i18n/I18nProvider";
import type { AppLocale } from "@/i18n/types";
import { authService } from "@/services/auth/client";
import { accountService, type AccountIdentity } from "@/services/account/client";

const languages = [
  { code: "pt-BR", label: "Português" },
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Español" },
] satisfies Array<{ code: AppLocale; label: string }>;

export default function AccountMenu() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const [profile, setProfile] = useState<AccountIdentity>({
    name: "Conta Prisma",
    email: "",
  });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void Promise.allSettled([
      accountService.getIdentity(),
      accountService.getAccess(),
    ]).then(([identity, access]) => {
      if (identity.status === "fulfilled") setProfile(identity.value);
      if (access.status === "fulfilled") setIsAdmin(access.value.isAdmin);
    });
  }, []);

  async function logout() {
    await authService.signOut();
    // Logout encerra a sessão e precisa limpar o estado do servidor (cache de
    // dados do usuário) — replace + refresh reproduzem isso sem recarregar o
    // documento inteiro.
    router.replace("/login");
    router.refresh();
  }

  const initials =
    profile.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "PP";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-10 rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground cursor-pointer"
            aria-label="Abrir menu da conta"
          />
        }
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(320px,calc(100vw-24px))] rounded-2xl p-2 shadow-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {profile.name}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {profile.email}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="min-h-10 rounded-xl px-2.5 cursor-pointer"
            render={<Link href="/dashboard/inbox" />}
          >
            <Inbox className="text-primary" />
            <span>Inbox & Notificações</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="min-h-10 rounded-xl px-2.5 cursor-pointer"
            render={<Link href="/dashboard/settings" />}
          >
            <Settings />
            <span>{t("account")}</span>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="min-h-10 rounded-xl px-2.5 cursor-pointer">
              <Languages className="text-primary" />
              <span>{t("language")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52 rounded-xl p-1.5">
              {languages.map((item) => (
                <DropdownMenuItem
                  key={item.code}
                  className="min-h-10 rounded-lg px-2.5 cursor-pointer"
                  onClick={() => setLocale(item.code)}
                >
                  <LocaleFlag locale={item.code} className="size-6" />
                  <span className="flex-1">{item.label}</span>
                  {locale === item.code && <Check className="text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {isAdmin && (
            <DropdownMenuItem
              className="min-h-10 rounded-xl px-2.5 cursor-pointer"
              render={<Link href="/admin" />}
            >
              <ShieldCheck className="text-primary" />
              <span>{t("administration")}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="min-h-10 rounded-xl px-2.5 cursor-pointer"
          onClick={() => void logout()}
        >
          <LogOut />
          <span>{t("logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
