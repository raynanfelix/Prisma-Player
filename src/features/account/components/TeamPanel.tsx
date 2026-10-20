"use client";

import { MailPlus, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import AdminSelect from "@/components/ui/custom/AdminSelect";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { AccountTeam, TeamInvitation } from "@/features/account/model/types";
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

const roleOptions = Object.entries(roleLabels)
  .filter(([key]) => key !== "owner")
  .map(([key, label]) => ({ value: key, label }));

type PanelStatus = "loading" | "ready" | "no_team" | "failed";

/** Mensagens honestas do limite por plano — com o número REAL de assentos. */
function seatMessage(seats: number): string {
  return seats <= 1
    ? "Seu plano permite 1 assento (só você) — faça upgrade para o Pro ou Escala para convidar."
    : `Seu plano permite ${seats} assentos — faça upgrade para convidar mais pessoas.`;
}

function inviteErrorMessage(code: string, seats: number): string {
  if (code === "seat_limit_reached") return seatMessage(seats);
  if (code === "team_not_in_plan") return seatMessage(1);
  if (code === "invalid_invite") return "Informe um e-mail válido e um nível de acesso.";
  if (code === "invite_create_failed") return "Não foi possível criar o convite agora — tente novamente.";
  return "Não foi possível criar o convite.";
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

export function TeamPanel({ notify }: { notify: (message: string) => void }) {
  const [team, setTeam] = useState<AccountTeam | null>(null);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [confirmDialog, confirm] = useConfirm();

  const load = useCallback(async () => {
    try {
      const data = await accountSettingsService.getTeam();
      setTeam(data);
      setInvitations(data.invitations ?? []);
      setStatus("ready");
    } catch (error) {
      // Conta sem equipe (legado pré-trigger): a resposta 404 ainda carrega os
      // convites endereçados a este usuário — eles precisam de um lugar para
      // aceitar, senão o convite (que não vai por e-mail) nunca é visto.
      if (error instanceof ApiError && error.code === "team_not_found") {
        setTeam(null);
        setInvitations((error.payload?.invitations as TeamInvitation[] | undefined) ?? []);
        setStatus("no_team");
        return;
      }
      setStatus("failed");
      notify("Não foi possível carregar a equipe.");
    }
  }, [notify]);

  useEffect(() => {
    // load é async: todo setState acontece APÓS o primeiro await (nenhum setState
    // síncrono no corpo do efeito) — a regra não atravessa a chamada de função.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function invite() {
    if (busy) return;
    setBusy(true);
    try {
      await accountSettingsService.inviteMember(email, role);
      setEmail("");
      // HONESTO: o Neon Auth gerenciado não expõe API de convite por e-mail —
      // nada sai pela caixa de entrada. A pessoa entra ao criar conta com o
      // e-mail convidado; o convite vale 7 dias (lib/account/team.ts).
      notify("Convite criado — a pessoa entra ao criar conta com este e-mail (vale 7 dias).");
      await load();
    } catch (error) {
      notify(inviteErrorMessage(error instanceof ApiError ? error.code : "", team?.seats ?? 1));
    } finally {
      setBusy(false);
    }
  }

  async function acceptInvite(inviteId: string) {
    if (accepting) return;
    setAccepting(inviteId);
    try {
      await accountSettingsService.acceptInvitation(inviteId);
      notify("Você entrou na equipe.");
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      notify(
        code === "seat_limit_reached"
          ? "A equipe está com os assentos cheios neste momento."
          : code === "invite_not_available" || code === "invalid_invite"
            ? "Este convite expirou ou não está mais disponível."
            : "Não foi possível aceitar o convite agora.",
      );
    } finally {
      setAccepting(null);
      await load();
    }
  }

  async function changeRole(memberId: string, nextRole: string) {
    try {
      await accountSettingsService.updateMemberRole(memberId, nextRole);
      notify("Papel atualizado.");
      await load();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      notify(
        code === "owner_required_for_admin_role"
          ? "Somente o proprietário promove ou altera administradores."
          : code === "member_not_editable"
            ? "O proprietário não pode ter o papel alterado."
            : "Não foi possível atualizar o papel.",
      );
    }
  }

  async function remove(payload: { memberId?: string; inviteId?: string }) {
    if (!(await confirm({ title: "Remover acesso", description: "Deseja realmente remover este acesso?" }))) return;
    try {
      await accountSettingsService.removeTeamAccess(payload);
      notify("Acesso removido.");
      await load();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      notify(
        code === "owner_required_for_admin_role"
          ? "Somente o proprietário remove administradores."
          : "Não foi possível remover o acesso agora.",
      );
    }
  }

  if (status === "loading") return <SettingsSkeleton />;

  if (status === "failed") {
    return (
      <SettingsCard title="Equipe" description="Não foi possível carregar a equipe agora.">
        <Button variant="outline" className="h-10 rounded-xl" onClick={() => void load()}>
          Tentar de novo
        </Button>
      </SettingsCard>
    );
  }

  const invitationsCard = invitations.length > 0 && (
    <SettingsCard
      title="Convites para você"
      description="Aceite para entrar na equipe do convidante com o papel escolhido por ele."
    >
      <div className="space-y-2">
        {invitations.map((invitation) => (
          <div key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <MailPlus className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{invitation.team.name}</p>
              <p className="text-xs text-muted-foreground">
                Papel: {roleLabels[invitation.role] ?? invitation.role}
                {invitation.expires_at ? ` · expira em ${formatDate(invitation.expires_at)}` : ""}
              </p>
            </div>
            <Button className="h-9 rounded-full" disabled={accepting !== null} onClick={() => void acceptInvite(invitation.id)}>
              {accepting === invitation.id ? "Entrando…" : "Aceitar e entrar"}
            </Button>
          </div>
        ))}
      </div>
    </SettingsCard>
  );

  if (status === "no_team" || !team) {
    return (
      <div className="space-y-5">
        {invitationsCard}
        {!invitations.length && (
          <SettingsCard title="Equipe" description="Nenhuma equipe vinculada a esta conta no momento." >
            <p className="text-sm text-muted-foreground">Convites que chegarem para o seu e-mail aparecem aqui.</p>
          </SettingsCard>
        )}
      </div>
    );
  }

  const used = team.members.length + team.invites.length;
  const canManage = ["owner", "admin"].includes(team.currentRole);
  const teamEnabled = team.seats > 1;
  const seatsFull = used >= team.seats;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Colaboração</p>
            <h2 className="mt-1 text-xl font-semibold">{team.team.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{used} de {team.seats} acessos utilizados.</p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            {Math.max(team.seats - used, 0)} vagas livres
          </span>
        </div>
        <div className="p-5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((used / team.seats) * 100, 100)}%` }} />
          </div>
          {seatsFull && <p className="mt-2 text-xs font-medium text-muted-foreground">{seatMessage(team.seats)}</p>}
        </div>
      </section>

      {invitationsCard}

      {canManage && (
        <SettingsCard
          title="Convidar membro"
          description={
            !teamEnabled
              ? seatMessage(team.seats)
              : seatsFull
                ? seatMessage(team.seats)
                : "O convite fica pendente por 7 dias: a pessoa entra ao criar conta com o e-mail convidado (ainda não há envio por e-mail)."
          }
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <Input
              className="h-11 rounded-xl"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="pessoa@empresa.com"
              disabled={!teamEnabled || seatsFull}
              type="email"
            />
            <AdminSelect
              label="Nível de acesso"
              value={role}
              onChange={setRole}
              disabled={!teamEnabled || seatsFull}
              className="h-11"
              options={roleOptions}
            />
            <Button
              className="h-11 rounded-full"
              onClick={() => void invite()}
              disabled={!teamEnabled || seatsFull || !email || busy}
            >
              <UserPlus className="size-4" />{busy ? "Criando…" : "Convidar"}
            </Button>
          </div>
        </SettingsCard>
      )}

      <SettingsCard title="Membros" description="Controle quem pode editar, analisar ou visualizar a operação.">
        <div className="space-y-2">
          {team.members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                {(member.profile?.full_name || member.profile?.email || "U").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.profile?.full_name || member.profile?.email || "Membro"}</p>
                <p className="truncate text-xs text-muted-foreground">{member.profile?.email}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  member.status === "active" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600"
                }`}
              >
                {member.status === "active" ? "Ativo" : "Inativo"}
              </span>
              {member.role === "owner" ? (
                <span className="text-xs text-muted-foreground">Proprietário</span>
              ) : (
                <>
                  <AdminSelect
                    label={`Papel de ${member.profile?.full_name || member.profile?.email || "membro"}`}
                    value={member.role}
                    onChange={(value) => void changeRole(member.id, value)}
                    disabled={!canManage}
                    options={roleOptions}
                  />
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover membro"
                      onClick={() => void remove({ memberId: member.id })}
                      className="rounded-full text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
          {team.invites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-600"><UserPlus className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{invite.email}</p>
                <p className="text-xs text-muted-foreground">
                  Convite {invite.status === "pending" ? "pendente" : invite.status} · {roleLabels[invite.role] ?? invite.role}
                  {invite.expires_at ? ` · expira em ${formatDate(invite.expires_at)}` : ""}
                </p>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Cancelar convite"
                  onClick={() => void remove({ inviteId: invite.id })}
                  className="rounded-full text-destructive"
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
        </div>
      </SettingsCard>
      {confirmDialog}
    </div>
  );
}
