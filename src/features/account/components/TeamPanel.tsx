"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AccountTeam } from "@/features/account/model/types";
import { ApiError } from "@/services/http/client";
import { accountSettingsService } from "@/services/account/settings";
import { SettingsCard, SettingsSkeleton } from "./SettingsUi";

const roleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Editor",
  analyst: "Analista",
  viewer: "Visualizador",
};

export function TeamPanel({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<AccountTeam | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [confirmDialog, confirm] = useConfirm();

  const load = useCallback(async () => {
    try {
      setData(await accountSettingsService.getTeam());
    } catch {
      notify("Não foi possível carregar a equipe.");
    }
  }, [notify]);

  useEffect(() => {
    void accountSettingsService
      .getTeam()
      .then((team) => setData(team))
      .catch(() => notify("Não foi possível carregar a equipe."));
  }, [notify]);

  async function invite() {
    setBusy(true);
    try {
      const result = await accountSettingsService.inviteMember(email, role);
      setEmail("");
      notify(result.joined ? "Membro adicionado à equipe." : "Convite enviado por e-mail.");
      await load();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      notify(
        code === "seat_limit_reached"
          ? "O limite de membros do seu plano foi atingido."
          : code === "team_not_in_plan"
            ? "Equipes estão disponíveis a partir do Prime Growth."
            : "Não foi possível enviar o convite.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(memberId: string, nextRole: string) {
    await accountSettingsService.updateMemberRole(memberId, nextRole);
    await load();
  }

  async function remove(payload: { memberId?: string; inviteId?: string }) {
    if (!(await confirm({ title: "Remover acesso", description: "Deseja realmente remover este acesso?" }))) return;
    await accountSettingsService.removeTeamAccess(payload);
    notify("Acesso removido.");
    await load();
  }

  if (!data) return <SettingsSkeleton />;
  const used = data.members.length + data.invites.length;
  const canManage = ["owner", "admin"].includes(data.currentRole);
  const teamEnabled = data.seats > 1;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Colaboração</p>
            <h2 className="mt-1 text-xl font-semibold">{data.team.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{used} de {data.seats} acessos utilizados.</p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            {Math.max(data.seats - used, 0)} vagas livres
          </span>
        </div>
        <div className="p-5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((used / data.seats) * 100, 100)}%` }} />
          </div>
        </div>
      </section>
      {canManage && (
        <SettingsCard
          title="Convidar membro"
          description={teamEnabled ? "Escolha o nível de acesso. O convite expira em sete dias." : "Disponível no Prime Growth e Prime Scale."}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <Input className="h-11 rounded-xl" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@empresa.com" disabled={!teamEnabled} />
            <select className="h-11 rounded-xl border border-input bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value)} disabled={!teamEnabled}>
              {Object.entries(roleLabels).filter(([key]) => key !== "owner").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <Button className="h-11 rounded-full" onClick={() => void invite()} disabled={!teamEnabled || !email || busy}>
              <UserPlus className="size-4" />{busy ? "Enviando…" : "Convidar"}
            </Button>
          </div>
        </SettingsCard>
      )}
      <SettingsCard title="Membros" description="Controle quem pode editar, analisar ou visualizar a operação.">
        <div className="space-y-2">
          {data.members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-4">
              <span className="grid size-10 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                {(member.profile?.full_name || member.profile?.email || "U").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.profile?.full_name || member.profile?.email || "Membro"}</p>
                <p className="truncate text-xs text-muted-foreground">{member.profile?.email}</p>
              </div>
              {member.role === "owner" ? (
                <span className="text-xs text-muted-foreground">Proprietário</span>
              ) : (
                <>
                  <select className="h-9 rounded-xl border border-input bg-background px-3 text-xs" value={member.role} onChange={(event) => void changeRole(member.id, event.target.value)} disabled={!canManage}>
                    {Object.entries(roleLabels).filter(([key]) => key !== "owner").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  {canManage && <Button variant="ghost" size="icon" aria-label="Remover membro" onClick={() => void remove({ memberId: member.id })} className="rounded-full text-destructive"><Trash2 /></Button>}
                </>
              )}
            </div>
          ))}
          {data.invites.map((invite) => (
            <div key={invite.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4">
              <span className="grid size-10 place-items-center rounded-full bg-amber-500/10 text-amber-600"><UserPlus className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{invite.email}</p>
                <p className="text-xs text-muted-foreground">Convite pendente · {roleLabels[invite.role]}</p>
              </div>
              {canManage && <Button variant="ghost" size="icon" aria-label="Cancelar convite" onClick={() => void remove({ inviteId: invite.id })} className="rounded-full text-destructive"><Trash2 /></Button>}
            </div>
          ))}
        </div>
      </SettingsCard>
      {confirmDialog}
    </div>
  );
}
