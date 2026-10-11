import { AdminHeader, AdminPanel } from "@/components/admin/AdminUi";
import TeamPromoteForm from "@/components/admin/TeamPromoteForm";
import TeamRoleButtons from "@/components/admin/TeamRoleButtons";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Equipe: quem tem papel administrativo. Papéis granulares (suporte,
 * financeiro, somente-leitura) não existem: hoje é admin ou usuário comum.
 * Promover/rebaixar exige confirmação e nunca vale para si mesmo.
 */
export default async function AdminTeamPage() {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const admins = (data?.users ?? []).filter((user) => user.app_metadata?.role === "admin");
  return <div><AdminHeader title="Equipe" description="Administradores com acesso total ao painel. Papel granular por área ainda não existe: é admin ou usuário." />
    {error && <p className="mb-4 text-[13px] text-red-500" role="alert">Falha ao listar: tente novamente.</p>}
    <AdminPanel title={`${admins.length} administradores`} description="Remover o papel tira o acesso ao /admin e às APIs imediatamente."><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Email</th><th className="px-5 py-3 font-medium">ID</th><th className="px-5 py-3 font-medium">Desde</th><th className="px-5 py-3 font-medium">Acesso</th></tr></thead><tbody>{admins.map((user) => <tr key={user.id} className="border-t themeable-border-hairline"><td className="px-5 py-4 font-semibold themeable-text-ink">{user.email ?? "—"}</td><td className="max-w-[180px] truncate px-5 py-4 themeable-text-ink-muted-48">{user.id}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{user.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "—"}</td><td className="px-5 py-4"><TeamRoleButtons userId={user.id} email={user.email ?? user.id} /></td></tr>)}
      {admins.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center themeable-text-ink-muted-48">Nenhum administrador encontrado.</td></tr>}</tbody></table></div></AdminPanel>
    <div className="mt-6"><AdminPanel title="Promover conta" description="Informe o UUID da conta para dar papel administrativo."><TeamPromoteForm /></AdminPanel></div>
  </div>;
}
