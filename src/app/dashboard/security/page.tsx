"use client";

import { useEffect, useState } from "react";
import { Globe2, Plus, Shield, Trash2, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";

export default function SecurityPage() {
  const [domains, setDomains] = useState<string[]>([]);
  const [domain, setDomain] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/dashboard-security", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setDomains(data.domains ?? []));
  }, []);

  function addDomain() {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!clean || domains.includes(clean)) return;
    setDomains((items) => [...items, clean]);
    setDomain("");
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    const response = await fetch("/api/dashboard-security", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domains }),
    });
    setSaving(false);
    setSaved(response.ok);
    if (response.ok) setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section className="dashboard-content flex flex-1 flex-col space-y-5">
      <PageHeader
        icon={<Shield size={20} />}
        title="Segurança & Proteção de Domínios"
      />

      <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 sm:p-8 shadow-xs">
        <div className="max-w-3xl space-y-6">
          <div>
            <h3 className="text-xl font-bold text-[#191A23] dark:text-white">Lista de Domínios Autorizados</h3>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-zinc-400 leading-relaxed">
              Cadastre domínios sem protocolo (ex: <code className="rounded bg-[#B9FF66]/30 px-1.5 py-0.5 font-semibold text-[#191A23]">checkout.seudominio.com</code>).
              Use <code className="rounded bg-slate-100 dark:bg-card px-1.5 py-0.5 font-semibold text-slate-700 dark:text-zinc-300">*.exemplo.com</code> para autorizar todos os subdomínios.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <label className="relative flex min-h-10 flex-1 items-center gap-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card px-3.5 shadow-none">
              <Globe2 size={16} className="text-slate-400 dark:text-zinc-500" />
              <input
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addDomain()}
                placeholder="checkout.seudominio.com"
                className="min-w-0 flex-1 bg-transparent text-xs font-medium text-[#191A23] dark:text-white outline-none"
              />
            </label>
            <button
              type="button"
              onClick={addDomain}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs transition-all cursor-pointer"
            >
              <Plus size={15} />
              Adicionar domínio
            </button>
          </div>

          <div className="space-y-2 pt-1">
            {domains.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 p-6 text-center text-xs font-medium text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-card">
                Nenhum domínio cadastrado. Enquanto a lista estiver vazia, seus players podem ser reproduzidos em qualquer site.
              </div>
            ) : (
              domains.map((item) => (
                <div
                  key={item}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-card px-3.5 shadow-none"
                >
                  <div className="flex items-center gap-2.5">
                    <Globe2 size={15} className="text-slate-500 dark:text-zinc-400" />
                    <span className="font-semibold text-xs text-[#191A23] dark:text-zinc-100">{item}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDomains((values) => values.filter((value) => value !== item))}
                    aria-label={`Remover ${item}`}
                    className="flex h-8 w-8 items-center justify-center text-slate-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>

          {saved && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-3.5 text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Regras de proteção atualizadas com sucesso!</span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="h-10 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] text-[#191A23] font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50"
            >
              {saving ? "Salvando alterações..." : saved ? "Salvo com sucesso!" : "Salvar Configurações de Segurança"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
