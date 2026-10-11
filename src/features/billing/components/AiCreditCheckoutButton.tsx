"use client";
import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
export default function AiCreditCheckoutButton({ product }: { product: string }) {
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function buy() { setLoading(true); setError(""); const response = await fetch("/api/billing/ai-credits/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product }) }); const data = await response.json().catch(() => null); if (!response.ok || !data?.url) { setError(data?.message || "Nao foi possivel abrir o pagamento."); setLoading(false); return; } window.location.assign(data.url); }
  return <><button onClick={buy} disabled={loading} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-prisma-blue px-5 text-[13px] font-semibold text-white disabled:opacity-60">{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}Comprar creditos</button>{error && <p className="mt-2 text-center text-[11px] text-red-500">{error}</p>}</>;
}
