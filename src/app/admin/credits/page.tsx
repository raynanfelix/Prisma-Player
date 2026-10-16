import Image from "next/image";
import { asc, desc, eq } from "drizzle-orm";
import { AdminHeader, AdminPanel, StatusPill } from "@/components/admin/AdminUi";
import { db, schema } from "@/lib/db";
import { formatBrlFromCents as money } from "@/lib/format/money";

const { aiCreditCheckouts, aiCreditProducts, aiCreditWallets } = schema;

export const dynamic = "force-dynamic";
export default async function AdminCreditsPage() {
  const [productRows, walletRows, checkoutRows] = await Promise.all([
    db.select({ id: aiCreditProducts.id, name: aiCreditProducts.name, credits: aiCreditProducts.credits, bonusCredits: aiCreditProducts.bonusCredits, amountCents: aiCreditProducts.amountCents, isActive: aiCreditProducts.isActive })
      .from(aiCreditProducts).orderBy(asc(aiCreditProducts.displayOrder)),
    db.select({ balance: aiCreditWallets.balance, lifetimePurchased: aiCreditWallets.lifetimePurchased, lifetimeUsed: aiCreditWallets.lifetimeUsed })
      .from(aiCreditWallets).limit(5000),
    db.select({
      id: aiCreditCheckouts.id,
      amountCents: aiCreditCheckouts.amountCents,
      status: aiCreditCheckouts.status,
      createdAt: aiCreditCheckouts.createdAt,
      productName: aiCreditProducts.name,
    })
      .from(aiCreditCheckouts)
      .leftJoin(aiCreditProducts, eq(aiCreditProducts.id, aiCreditCheckouts.productId))
      .orderBy(desc(aiCreditCheckouts.createdAt))
      .limit(100),
  ]);
  const products = productRows.map((product) => ({
    id: product.id,
    name: product.name,
    credits: product.credits,
    bonus_credits: product.bonusCredits,
    amount_cents: product.amountCents,
    is_active: product.isActive,
  }));
  const checkouts = checkoutRows.map((checkout) => ({
    id: checkout.id,
    amount_cents: checkout.amountCents,
    status: checkout.status,
    created_at: checkout.createdAt.toISOString(),
    product: checkout.productName ? { name: checkout.productName } : null,
  }));
  const totals = walletRows.reduce((acc, wallet) => ({ balance: acc.balance + wallet.balance, purchased: acc.purchased + wallet.lifetimePurchased, used: acc.used + wallet.lifetimeUsed }), { balance: 0, purchased: 0, used: 0 });
  return <div><AdminHeader title="Prisma IA e créditos" description="Catálogo, circulação de créditos e confirmação das compras da inteligência Prisma." />
    <div className="mb-6 grid gap-4 sm:grid-cols-3">{[{ label: "Saldo em carteiras", value: totals.balance }, { label: "Créditos comprados", value: totals.purchased }, { label: "Créditos utilizados", value: totals.used }].map((item) => <article key={item.label} className="flex items-center gap-4 rounded-[18px] border bg-white p-5 themeable-border-hairline dark:bg-white/[0.035]"><Image src="/prisma-credits.png" width={48} height={48} alt="Créditos Prisma" className="h-12 w-12 object-contain" /><div><p className="text-[11px] themeable-text-ink-muted-48">{item.label}</p><strong className="mt-1 block text-[24px] themeable-text-ink">{item.value.toLocaleString("pt-BR")}</strong></div></article>)}</div>
    <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]"><AdminPanel title="Pacotes ativos"><div className="space-y-3 p-5">{products.map((product) => <div key={product.id} className="flex items-center justify-between gap-3 rounded-[14px] border p-4 themeable-border-hairline"><div><p className="text-[13px] font-semibold themeable-text-ink">{product.name}</p><p className="mt-1 text-[11px] themeable-text-ink-muted-48">{product.credits + product.bonus_credits} créditos · {money(product.amount_cents)}</p></div><StatusPill value={product.is_active ? "active" : "disabled"} /></div>)}</div></AdminPanel>
      <AdminPanel title="Compras recentes"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-[12px]"><thead className="themeable-bg-surface-pearl themeable-text-ink-muted-48"><tr><th className="px-5 py-3 font-medium">Pacote</th><th className="px-5 py-3 font-medium">Valor</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Data</th></tr></thead><tbody>{checkouts.map((checkout) => { const product = checkout.product; return <tr key={checkout.id} className="border-t themeable-border-hairline"><td className="px-5 py-4 font-semibold themeable-text-ink">{product?.name ?? "Pacote"}</td><td className="px-5 py-4">{money(checkout.amount_cents)}</td><td className="px-5 py-4"><StatusPill value={checkout.status} /></td><td className="px-5 py-4 themeable-text-ink-muted-48">{new Date(checkout.created_at).toLocaleString("pt-BR")}</td></tr>; })}</tbody></table></div></AdminPanel></div>
  </div>;
}
