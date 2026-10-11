"use client";

import { Layers } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/dashboard/PageHeader";
import Tabs from "@/components/dashboard/Tabs";
import { BillingSettingsTab } from "@/features/account/components/BillingSettingsTab";
import { OverviewPanel } from "@/features/account/components/OverviewPanel";
import { PasswordPanel } from "@/features/account/components/PasswordPanel";
import { PreferencesSettingsTab } from "@/features/account/components/PreferencesSettingsTab";
import { ProfilePanel } from "@/features/account/components/ProfilePanel";
import { SecurityPanel } from "@/features/account/components/SecurityPanel";
import { SettingsSkeleton } from "@/features/account/components/SettingsUi";
import { TeamPanel } from "@/features/account/components/TeamPanel";
import type { AccountOverview, AccountProfile } from "@/features/account/model/types";
import { accountSettingsService } from "@/services/account/settings";

const tabs = [
  { id: "overview", label: "Visão Geral" },
  { id: "profile", label: "Perfil" },
  { id: "password", label: "Senha" },
  { id: "team", label: "Equipe" },
  { id: "billing", label: "Faturamento & Planos" },
  { id: "preferences", label: "Preferências & Notificações" },
  { id: "security", label: "Segurança" },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section");
  const adminMfaRequired = searchParams.get("adminMfa") === "required";

  const [activeTab, setActiveTab] = useState(() => {
    if (section && tabs.some((tab) => tab.id === section)) return section;
    if (adminMfaRequired) return "security";
    return "overview";
  });
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void accountSettingsService
      .getProfile()
      .then((data) => setProfile(data.profile))
      .catch(() => null);
    void accountSettingsService
      .getOverview()
      .then(setOverview)
      .catch(() => null);
  }, []);

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  }

  return (
    <main className="dashboard-content space-y-5 pb-16">
      <PageHeader icon={<Layers size={20} />} title="Configurações da Conta SaaS">
        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </PageHeader>

      {notice && (
        <div role="status" className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
          {notice}
        </div>
      )}

      {activeTab === "overview" && <OverviewPanel overview={overview} profile={profile} />}

      {activeTab === "profile" &&
        (profile ? <ProfilePanel profile={profile} onUpdated={setProfile} notify={notify} /> : <SettingsSkeleton />)}

      {activeTab === "password" && <PasswordPanel notify={notify} />}

      {activeTab === "team" && <TeamPanel notify={notify} />}

      {activeTab === "billing" && <BillingSettingsTab />}

      {activeTab === "preferences" && <PreferencesSettingsTab />}

      {activeTab === "security" && <SecurityPanel notify={notify} adminMfaRequired={adminMfaRequired} />}
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="dashboard-content space-y-5 pb-16">
          <PageHeader icon={<Layers size={20} />} title="Configurações da Conta SaaS" />
          <SettingsSkeleton />
        </main>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
