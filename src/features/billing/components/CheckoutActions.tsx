"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, LoaderCircle, QrCode } from "lucide-react";
import posthog from "posthog-js";

export default function CheckoutActions({ plan, change = "subscribe" }: { plan: string; change?: "subscribe" | "upgrade" | "downgrade" }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"pix" | "card" | null>(null);
  const [error, setError] = useState("");

  async function checkout(method: "pix" | "card") {
    posthog.capture("checkout_initiated", { plan, method, change });
    setLoading(method);
    setError("");
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan, method }),
    });
    if (response.status === 401) {
      // Sessão expirada: volta ao login com retorno para o billing.
      router.replace(`/login?next=${encodeURIComponent("/dashboard/billing")}`);
      return;
    }
    const data = await response.json().catch(() => null) as { url?: string; message?: string } | null;
    if (!response.ok || !data?.url) {
      setError(data?.message || "Nao foi possivel abrir o pagamento. Tente novamente em instantes.");
      setLoading(null);
      return;
    }
    // URL do provedor de pagamento (AbacatePay): navegação externa fora do app
    // Next.js — window.location.assign é o mecanismo correto aqui.
    window.location.assign(data.url);
  }

  return <div className="mt-6 space-y-2">
    <button type="button" onClick={() => checkout("card")} disabled={Boolean(loading)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-prisma-blue px-5 text-[14px] font-semibold text-white transition active:scale-[.98] disabled:opacity-60">
      {loading === "card" ? <LoaderCircle size={17} className="animate-spin" /> : <CreditCard size={17} />} {change === "upgrade" ? "Fazer upgrade" : change === "downgrade" ? "Mudar para este plano" : "Assinar com cartao"}
    </button>
    <button type="button" onClick={() => checkout("pix")} disabled={Boolean(loading)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-5 text-[14px] font-semibold themeable-border-hairline themeable-text-ink transition active:scale-[.98] disabled:opacity-60">
      {loading === "pix" ? <LoaderCircle size={17} className="animate-spin" /> : <QrCode size={17} />} {change === "subscribe" ? "Pagar 30 dias com Pix" : "Trocar via Pix"}
    </button>
    <p className="pt-1 text-center text-[11px] leading-relaxed themeable-text-ink-muted-48">Cartao renova automaticamente. Pix exige uma nova cobranca ao fim de 30 dias.</p>
    {error && <p role="alert" className="text-center text-[12px] text-red-500">{error}</p>}
  </div>;
}
