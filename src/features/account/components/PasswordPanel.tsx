"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/services/http/client";
import { accountSettingsService } from "@/services/account/settings";
import { SettingsCard } from "./SettingsUi";

const messages: Record<string, string> = {
  invalid_current_password: "A senha atual não confere.",
  current_password_required: "Informe sua senha atual.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
};

export function PasswordPanel({ notify }: { notify: (message: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  async function update() {
    if (password !== confirmation) {
      notify("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    try {
      await accountSettingsService.updatePassword(currentPassword, password);
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      notify("Senha atualizada com sucesso.");
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      notify(messages[code] ?? "Use pelo menos 10 caracteres, com letras e números.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard title="Alterar senha" description="Crie uma senha exclusiva para sua conta.">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Senha atual
          <Input
            className="mt-2 h-11 rounded-xl"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="text-sm font-medium">
          Nova senha
          <Input className="mt-2 h-11 rounded-xl" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
        </label>
        <label className="text-sm font-medium">
          Confirmar senha
          <Input className="mt-2 h-11 rounded-xl" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><CheckCircle2 className="size-4" />10 caracteres</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="size-4" />Letras e números</span>
      </div>
      <Button
        className="mt-5 rounded-full"
        onClick={() => void update()}
        disabled={saving || !currentPassword || !password || !confirmation}
      >
        {saving ? "Atualizando…" : "Atualizar senha"}
      </Button>
    </SettingsCard>
  );
}
