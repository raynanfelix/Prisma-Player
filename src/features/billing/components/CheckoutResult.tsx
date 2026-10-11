"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, LoaderCircle, XCircle } from "lucide-react";

type Status = { checkout?: { status: string; checkout_type: string }; subscription?: { status: string; current_period_end: string | null } | null };

export default function CheckoutResult({ checkoutId }: { checkoutId: string }) {
  const [data, setData] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let attempts = 0;
    async function refresh() {
      const response = await fetch(`/api/billing/status?checkout=${encodeURIComponent(checkoutId)}`, { cache: "no-store" });
      if (!active) return;
      if (response.ok) setData(await response.json()); else setFailed(true);
      attempts += 1;
      if (active && attempts < 30 && response.ok) window.setTimeout(refresh, 3000);
    }
    void refresh();
    return () => { active = false; };
  }, [checkoutId]);

  const paid = data?.checkout?.status === "paid" && data.subscription?.status === "active";
  const bad = failed || ["failed", "refunded", "disputed", "cancelled"].includes(data?.checkout?.status ?? "");
  return <div className="mx-auto max-w-md rounded-[24px] border p-7 text-center themeable-bg-canvas themeable-border-hairline">{paid ? <CheckCircle2 size={44} className="mx-auto text-green-500" /> : bad ? <XCircle size={44} className="mx-auto text-red-500" /> : data ? <Clock3 size={44} className="mx-auto text-prisma-blue" /> : <LoaderCircle size={44} className="mx-auto animate-spin text-prisma-blue" />}<h1 className="mt-5 text-[26px] font-semibold themeable-text-ink">{paid ? "Plano ativado" : bad ? "Pagamento nao concluido" : "Confirmando pagamento"}</h1><p className="mt-2 text-[14px] leading-relaxed themeable-text-ink-muted-48">{paid ? "Seu acesso ja foi atualizado e esta pronto para uso." : bad ? "Nenhuma assinatura foi ativada. Voce pode tentar novamente sem cobranca duplicada." : "Estamos validando o pagamento com a AbacatePay. Normalmente isso leva apenas alguns segundos."}</p><Link href={paid ? "/dashboard/videos" : "/dashboard/billing"} className="mt-6 inline-flex min-h-11 items-center rounded-full bg-prisma-blue px-6 text-[14px] font-semibold text-white">{paid ? "Ir para meus videos" : "Voltar aos planos"}</Link></div>;
}
