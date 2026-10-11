import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default async function AdminBillingPage() {
  const admin = createAdminClient();
  const result = await admin.from("billing_checkouts").select("id,user_id,amount_cents,checkout_type,status,paid_at,created_at,plan:billing_plans(name)").order("created_at", { ascending: false }).limit(200);
  return <div><AdminHeader title="Receita e planos" description="Histórico operacional dos checkouts, pagamentos e ativações da AbacatePay." />
    <AdminPanel title="Checkouts recentes" description="Até 200 cobranças, ordenadas da mais recente para a mais antiga."><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Plano</th><th className="px-5 py-3 font-medium">Valor</th><th className="px-5 py-3 font-medium">Método</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Criado</th><th className="px-5 py-3 font-medium">Confirmado</th></tr></thead><tbody>{(result.data ?? []).map((checkout) => { const plan = Array.isArray(checkout.plan) ? checkout.plan[0] : checkout.plan; return <tr key={checkout.id} className="border-t themeable-border-hairline"><td className="px-5 py-4 font-semibold themeable-text-ink">{plan?.name ?? "Plano removido"}</td><td className="px-5 py-4 themeable-text-ink">{money(checkout.amount_cents)}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{checkout.checkout_type === "pix" ? "Pix" : "Cartão recorrente"}</td><td className="px-5 py-4"><StatusPill value={checkout.status} /></td><td className="px-5 py-4 themeable-text-ink-muted-48">{new Date(checkout.created_at).toLocaleString("pt-BR")}</td><td className="px-5 py-4 themeable-text-ink-muted-48">{checkout.paid_at ? new Date(checkout.paid_at).toLocaleString("pt-BR") : "—"}</td></tr>; })}</tbody></table></div></AdminPanel>
  </div>;
}
