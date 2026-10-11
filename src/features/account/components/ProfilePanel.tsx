"use client";

import { Bell, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountProfile } from "@/features/account/model/types";
import { accountSettingsService } from "@/services/account/settings";
import { SettingsCard, SettingsSwitch } from "./SettingsUi";

export function ProfilePanel({
  profile,
  onUpdated,
  notify,
}: {
  profile: AccountProfile;
  onUpdated: (profile: AccountProfile) => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [locale, setLocale] = useState(profile.locale);
  const [emailNotifications, setEmailNotifications] = useState(profile.email_notifications);
  const [securityNotifications, setSecurityNotifications] = useState(profile.security_notifications);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await accountSettingsService.updateProfile({
        fullName: name,
        phone,
        locale,
        emailNotifications,
        securityNotifications,
      });
      onUpdated(result.profile);
      notify("Perfil e preferências atualizados.");
    } catch {
      notify("Não foi possível atualizar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "mt-2 h-11 rounded-xl";
  return (
    <div className="space-y-5">
      <SettingsCard title="Dados pessoais" description="Informações usadas na sua conta.">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Nome completo
            <Input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="text-sm font-medium">
            Telefone
            <Input className={fieldClass} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label className="text-sm font-medium">
            E-mail
            <Input className={fieldClass} value={profile.email} readOnly />
          </label>
          <label className="text-sm font-medium">
            Idioma
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="pt-BR">Português</option>
              <option value="es-ES">Español</option>
              <option value="en-US">English</option>
            </select>
          </label>
        </div>
      </SettingsCard>
      <SettingsCard title="Notificações" description="Escolha quais atualizações deseja receber.">
        <div className="space-y-3">
          <Preference
            icon={Bell}
            title="E-mails do produto"
            detail="Processamento, limites e novidades importantes"
            checked={emailNotifications}
            onChange={setEmailNotifications}
          />
          <Preference
            icon={Shield}
            title="Alertas de segurança"
            detail="Senha, MFA e acessos importantes"
            checked={securityNotifications}
            onChange={setSecurityNotifications}
          />
        </div>
        <Button className="mt-5 rounded-full" onClick={() => void save()} disabled={saving}>
          {saving ? "Salvando…" : "Salvar alterações"}
        </Button>
      </SettingsCard>
    </div>
  );
}

function Preference({
  icon: Icon,
  title,
  detail,
  checked,
  onChange,
}: {
  icon: typeof Bell;
  title: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 p-4">
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-4 text-primary" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
      </div>
      <SettingsSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
