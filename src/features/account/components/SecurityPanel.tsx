"use client";

import { KeyRound, Shield, Smartphone, Trash2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { MfaFactor } from "@/features/account/model/types";
import { apiRequest, ApiError } from "@/services/http/client";
import { InfoRow, SettingsCard } from "./SettingsUi";

interface SecurityState {
  factors: MfaFactor[];
  events: { id: string; event_type: string; metadata: unknown; created_at: string }[];
}

export function SecurityPanel({
  notify,
  adminMfaRequired,
}: {
  notify: (message: string) => void;
  adminMfaRequired: boolean;
}) {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDialog, confirm] = useConfirm();

  const refresh = useCallback(async () => {
    try {
      const data = await apiRequest<SecurityState>("/api/account/security", { cache: "no-store" });
      const current = data.factors.filter((factor) => factor.status === "verified");
      const stale = data.factors.filter((factor) => factor.status === "unverified" && factor.friendly_name === "Prisma Player");
      const verified = current.length > 0 ? current : (stale.length > 0 ? [] : data.factors);
      setFactors(verified.length > 0 ? verified : data.factors);
    } catch {
    }
    return null;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function enroll() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await apiRequest<{ factorId: string; qr: string; secret: string }>("/api/account/security", {
        method: "POST",
        body: { action: "enroll" },
      });
      setFactorId(data.factorId);
      setQr(data.qr);
      setSecret(data.secret);
      notify("Escaneie o QR Code e informe o código de seis dígitos.");
    } catch (error) {
      const msg = error instanceof ApiError && error.code === "mfa_already_active" ? "O MFA já está ativo nesta conta." : "Não foi possível iniciar o MFA. Entre novamente e tente outra vez.";
      notify(msg);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy || code.length !== 6 || !factorId) return;
    setBusy(true);
    try {
      const challengeResp = await apiRequest<{ challengeId: string }>("/api/account/security", {
        method: "POST",
        body: { action: "challenge", factorId },
      });
      await apiRequest("/api/account/security", {
        method: "POST",
        body: { action: "verify", factorId, challengeId: challengeResp.challengeId, code },
      });
      setQr("");
      setSecret("");
      setCode("");
      setFactorId("");
      await refresh();
      notify("Autenticação em dois fatores ativada.");
    } catch {
      notify("Código inválido, desafio expirado ou verificação falhou. Aguarde o próximo código.");
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa() {
    if (adminMfaRequired) {
      notify("Administradores precisam manter o MFA ativo.");
      return;
    }
    const factor = factors.find((item) => item.status === "verified");
    if (!factor || busy || !(await confirm({ title: "Desativar MFA", description: "Desativar a autenticação em dois fatores?" }))) return;
    setBusy(true);
    try {
      await apiRequest("/api/account/security", {
        method: "POST",
        body: { action: "unenroll", factorId: factor.id },
      });
      await refresh();
      notify("Autenticação em dois fatores desativada.");
    } catch (error) {
      const msg = error instanceof ApiError && error.code === "aal2_required"
        ? "Confirme o segundo fator nesta sessão antes de desativar o MFA."
        : "Não foi possível desativar o MFA.";
      notify(msg);
    } finally {
      setBusy(false);
    }
  }

  const verified = factors.some((factor) => factor.status === "verified");
  return (
    <div className="space-y-5">
      {adminMfaRequired && !verified && (
        <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          <strong className="block">MFA obrigatório para administradores</strong>
          Confirme um aplicativo autenticador para liberar o painel administrativo.
        </div>
      )}
      <SettingsCard title="Autenticação em dois fatores" description="Proteja sua conta com um aplicativo autenticador TOTP.">
        {verified ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-green-500/25 bg-green-500/5 p-4">
            <div className="flex items-center gap-3 text-sm text-green-600"><Shield className="size-5" />MFA ativo nesta conta</div>
            {adminMfaRequired ? (
              <span className="text-xs font-medium text-amber-600">Obrigatório para administradores</span>
            ) : (
              <Button variant="outline" onClick={() => void disableMfa()} disabled={busy} className="rounded-full text-destructive">
                <Trash2 className="size-4" />{busy ? "Desativando…" : "Desativar MFA"}
              </Button>
            )}
          </div>
        ) : qr ? (
          <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
            <div className="overflow-hidden rounded-xl bg-white p-3"><Image src={qr} alt="QR Code para configurar o autenticador" width={156} height={156} unoptimized className="h-auto w-full" /></div>
            <div>
              <label className="text-sm font-medium">Código de 6 dígitos
                <Input className="mt-2 h-11 rounded-xl" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
              </label>
              <Button className="mt-4 rounded-full" onClick={() => void verify()} disabled={busy || code.length !== 6}>{busy ? "Confirmando…" : "Confirmar e ativar"}</Button>
              {secret && <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">Não consigo escanear</summary><code className="mt-2 block break-all rounded-xl bg-muted p-3">{secret}</code></details>}
            </div>
          </div>
        ) : (
          <Button className="rounded-full" onClick={() => void enroll()} disabled={busy}><Smartphone className="size-4" />{busy ? "Preparando…" : "Configurar aplicativo"}</Button>
        )}
      </SettingsCard>
      <SettingsCard title="Sessão e privacidade">
        <div className="space-y-3">
          <InfoRow icon={KeyRound} title="Sessão protegida" detail="Suas credenciais permanecem protegidas durante a navegação." />
          <InfoRow icon={Shield} title="Conta isolada" detail="Seus vídeos e métricas não ficam acessíveis a outras contas." />
        </div>
      </SettingsCard>
      {confirmDialog}
    </div>
  );
}
