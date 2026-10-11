"use client";

import { useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BillingSettingsTab() {
  const [cardName, setCardName] = useState("Akib Ahmad");
  const [cardExpiry, setCardExpiry] = useState("08 / 2028");
  const [cardNumber, setCardNumber] = useState("•••• •••• •••• 4242");
  const [cardCvv, setCardCvv] = useState("•••");
  const [savedNotice, setSavedNotice] = useState(false);

  const billingHistory = [
    {
      id: "INV-2026-003",
      title: "Plano Pro Scale (Mensal)",
      date: "02 de Agosto, 2026",
      amount: "R$ 197,00",
      statusText: "Pago",
    },
    {
      id: "INV-2026-002",
      title: "Plano Pro Scale (Mensal)",
      date: "02 de Julho, 2026",
      amount: "R$ 197,00",
      statusText: "Pago",
    },
    {
      id: "INV-2026-001",
      title: "Plano Iniciante (Teste)",
      date: "02 de Junho, 2026",
      amount: "R$ 97,00",
      statusText: "Pago",
    },
  ];

  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Payment Method Card */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 sm:p-7 shadow-xs space-y-5">
        <div>
          <h2 className="text-lg font-bold text-[#191A23] dark:text-white">Método de Pagamento</h2>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
            Atualize os detalhes do seu cartão de crédito para renovações automáticas do seu plano.
          </p>
        </div>

        {savedNotice && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-3.5 text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Dados de pagamento atualizados com sucesso!</span>
          </div>
        )}

        <form onSubmit={handleSaveCard} className="space-y-4 max-w-xl">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#191A23] dark:text-zinc-200">Nome no Cartão</label>
            <input
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#191A23] dark:text-zinc-200">Número do Cartão</label>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#191A23] dark:text-zinc-200">Validade</label>
                <input
                  type="text"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#191A23] dark:text-zinc-200">CVV</label>
                <input
                  type="password"
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3 text-xs font-medium text-[#191A23] dark:text-white outline-none focus:border-[#B9FF66]"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" className="h-10 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] text-[#191A23] font-bold text-xs shadow-xs cursor-pointer">
              Salvar Novo Cartão
            </Button>
          </div>
        </form>
      </div>

      {/* Invoice History Section */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 sm:p-7 shadow-xs space-y-5">
        <div>
          <h2 className="text-lg font-bold text-[#191A23] dark:text-white">Histórico de Faturas</h2>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
            Baixe seus comprovantes e acompanhe os pagamentos efetuados.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs font-medium text-[#191A23] dark:text-zinc-200">
            <thead className="bg-slate-50 dark:bg-card uppercase text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800 font-semibold">
              <tr>
                <th className="p-3.5">Fatura / Plano</th>
                <th className="p-3.5">Data</th>
                <th className="p-3.5">Valor</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {billingHistory.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-transparent">
                  <td className="p-3.5 font-bold text-[#191A23] dark:text-white">
                    {item.title}
                    <span className="block text-[10px] font-normal text-slate-400 dark:text-zinc-500">{item.id}</span>
                  </td>
                  <td className="p-3.5 text-slate-600 dark:text-zinc-400">{item.date}</td>
                  <td className="p-3.5 font-bold text-[#191A23] dark:text-white">{item.amount}</td>
                  <td className="p-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#B9FF66] px-2.5 py-0.5 text-xs font-bold text-[#191A23]">
                      <CheckCircle2 size={12} />
                      {item.statusText}
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button type="button" className="inline-flex items-center gap-1 text-slate-600 dark:text-zinc-400 hover:text-[#191A23] dark:hover:text-white font-semibold cursor-pointer">
                      <Download size={14} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
