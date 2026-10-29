"use client";

import {
  Bell,
  Check,
  CreditCard,
  Globe,
  Inbox,
  LogOut,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LocaleFlag } from "@/i18n/flags";
import { useI18n } from "@/i18n/I18nProvider";
import type { AppLocale } from "@/i18n/types";
import { authService } from "@/services/auth/client";
import { accountSettingsService } from "@/services/account/settings";
import type { AccountOverview } from "@/features/account/model/types";
import ProfileDropdown, {
  type Account,
  type AccountTheme,
  type ProfileMenuItem,
} from "./ProfileDropdown";

const languages = [
  { code: "pt-BR", label: "Português" },
  { code: "en-US", label: "English" },
  { code: "es-ES", label: "Español" },
] satisfies Array<{ code: AppLocale; label: string }>;

function formatCurrency(cents: number, currency: string): string {
  if (!currency) return "";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function AccountMenu() {
  const router = useRouter();
  const { locale, setLocale, t } = useI18n();
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setThemeState] = useState<AccountTheme>("system");

  useEffect(() => {
    // Load initial theme preference
    const stored = localStorage.getItem("theme") as AccountTheme | null;
    if (stored === "dark" || stored === "light" || stored === "system") {
      setThemeState(stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setThemeState("dark");
    }

    void Promise.allSettled([
      accountSettingsService.getOverview(),
      accountSettingsService.getProfile().then((r) => r.profile),
    ]).then(([ovResult]) => {
      if (ovResult.status === "fulfilled") {
        setOverview(ovResult.value);
        // Admin check is embedded in overview.access or separate call
        // For now, we rely on the existing access check pattern if needed,
        // but Overview usually contains enough for the menu header.
        // If specific admin flag is needed separately:
        import("@/services/account/client").then(({ accountService }) => {
          void accountService.getAccess().then((acc) => setIsAdmin(acc.isAdmin));
        });
      }
    });
  }, []);

  function handleThemeChange(next: AccountTheme) {
    setThemeState(next);
    const isDark =
      next === "dark" ||
      (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", next);
    window.dispatchEvent(new Event("prisma-theme-change"));
  }

  async function handleSignOut() {
    await authService.signOut();
    router.replace("/login");
    router.refresh();
  }

  const profileName = overview?.plan?.name ?? "Conta Prisma";
  const profileEmail = ""; // Email comes from identity, but overview doesn't have it directly.
  // We'll fetch identity separately or assume the menu can show just name/plan.
  // Actually, let's fetch identity to be safe.
  const [identity, setIdentity] = useState<{ name: string; email: string }>({
    name: "Carregando...",
    email: "",
  });

  useEffect(() => {
    void import("@/services/account/client").then(({ accountService }) => {
      void accountService.getIdentity().then(setIdentity);
    });
  }, []);

  const account: Account = {
    id: "current",
    name: identity.name,
    email: identity.email,
    plan: overview?.plan?.name ?? (overview?.access.trialStatus === "active" ? "Trial" : "Free"),
  };

  const items: ProfileMenuItem[] = [
    {
      label: "Inbox & Notificações",
      icon: <Inbox className="size-4" />,
      href: "/dashboard/inbox",
    },
    {
      label: t("account"), // Configurações
      icon: <Settings className="size-4" />,
      href: "/dashboard/settings",
    },
    {
      label: "Integrações",
      icon: <Webhook className="size-4" />,
      href: "/dashboard/integracoes",
    },
    {
      label: "Faturamento",
      icon: <CreditCard className="size-4" />,
      href: "/dashboard/billing",
      value: overview?.subscription
        ? formatCurrency(0, overview.subscription.billingMethod === "pix" ? "BRL" : "USD") // Placeholder logic; real price needs catalog lookup
        : undefined,
    },
  ];

  if (isAdmin) {
    items.push({
      label: t("administration"),
      icon: <ShieldCheck className="size-4" />,
      href: "/admin",
    });
  }

  // Language selector is handled via custom item or separate mechanism in KokonutUI?
  // The provided ProfileDropdown doesn't have a built-in language selector row,
  // but we can add it as a custom item that opens a submenu or just list languages.
  // Since the original had a submenu, and ProfileDropdown uses flat items mostly,
  // let's add a "Language" item that cycles or we can just rely on the fact that
  // the user asked for "mudar idioma" inside the menu.
  // For simplicity with the provided ProfileDropdown API, we'll add it as an item
  // that could trigger a modal or we can extend the items array.
  // However, the provided code snippet for ProfileDropdown supports `items` which are simple links/buttons.
  // To properly support language switching like the original, we might need to customize
  // or just accept that the provided ProfileDropdown is a base.
  // Let's assume we can just add a placeholder or the user accepts the standard items.
  // BUT, the user explicitly asked for "mudar idioma".
  // I will add a custom render or just use the onSelect callback to cycle languages for now
  // or better, since we control the wrapper, we can't easily inject complex submenus into `items`.
  // Wait, the provided ProfileDropdown code DOES NOT support submenus in `items`.
  // It only supports `href` or `onSelect`.
  // So I will implement language switching as a cyclic button or just list the current one.
  // Actually, looking at the user request again: "dentro do acconte menu voce poem o thema, configuraçoes, integraçoes, inbox e notificaçoes, admin, mudar idioma".
  // The provided ProfileDropdown HAS a ThemeRow built-in.
  // It does NOT have a LanguageRow.
  // I will add a Language item that cycles through available locales on click for simplicity,
  // or just displays the current one and opens a link to settings? No, settings is already there.
  // Let's make it cycle: PT -> EN -> ES -> PT.
  const currentLangIndex = languages.findIndex((l) => l.code === locale);
  const nextLang = languages[(currentLangIndex + 1) % languages.length];

  items.push({
    label: t("language"),
    icon: <Globe className="size-4" />,
    value: languages.find((l) => l.code === locale)?.label ?? locale,
    onSelect: () => setLocale(nextLang.code),
  });

  return (
    <ProfileDropdown
      accounts={[account]}
      items={items}
      theme={theme}
      onThemeChange={handleThemeChange}
      onSignOut={handleSignOut}
      holdDuration={800}
      className="shrink-0"
    />
  );
}