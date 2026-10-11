import type { ReactNode } from "react";
import {
  CreditCard,
  FlaskConical,
  Inbox,
  LifeBuoy,
  Settings,
  Shield,
  Target,
  Video,
} from "lucide-react";

export type NavigationMessageKey =
  | "videos"
  | "abTests"
  | "security"
  | "conversions"
  | "settings"
  | "plan"
  | "help";

export type SidebarNavItem = {
  title: string;
  messageKey?: NavigationMessageKey;
  path?: string;
  icon?: ReactNode;
  subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
  label?: string;
  items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [{
  items: [
    { title: "Meus vídeos", messageKey: "videos", path: "/dashboard/videos", icon: <Video className="size-4" /> },
    { title: "Testes A/B", messageKey: "abTests", path: "/dashboard/ab-tests", icon: <FlaskConical className="size-4" /> },
    { title: "Inbox & Notificações", path: "/dashboard/inbox", icon: <Inbox className="size-4" /> },
    { title: "Segurança", messageKey: "security", path: "/dashboard/security", icon: <Shield className="size-4" /> },
    { title: "Conversões", messageKey: "conversions", path: "/dashboard/conversions", icon: <Target className="size-4" /> },
    { title: "Configurações", messageKey: "settings", path: "/dashboard/settings", icon: <Settings className="size-4" /> },
    { title: "Plano", messageKey: "plan", path: "/dashboard/billing", icon: <CreditCard className="size-4" /> },
  ],
}];

export const footerNavLinks: SidebarNavItem[] = [
  { title: "Ajuda", messageKey: "help", path: "#", icon: <LifeBuoy className="size-4" /> },
];

export const navLinks = [
  ...navGroups.flatMap((group) => group.items.flatMap((item) => item.subItems?.length ? [item, ...item.subItems] : [item])),
  ...footerNavLinks,
];
