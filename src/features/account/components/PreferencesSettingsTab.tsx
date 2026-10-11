"use client";

import { useEffect, useState } from "react";
import { Moon, Globe, Bell, Volume2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminSelect from "@/components/ui/custom/AdminSelect";

export function PreferencesSettingsTab() {
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState("pt-BR");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    // Sincronização client-only (evita mismatch de hidratação): resolve após o paint.
    Promise.resolve().then(() => {
      const isDark = document.documentElement.classList.contains("dark");
      setDarkMode(isDark);
    });
  }, []);

  const toggleDarkMode = (enabled: boolean) => {
    setDarkMode(enabled);
    if (enabled) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="space-y-6">
      {savedNotice && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-3.5 text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>Preferências salvas com sucesso!</span>
        </div>
      )}

      {/* Personalization Section */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 sm:p-7 shadow-xs space-y-5">
        <div>
          <h2 className="text-lg font-bold text-[#191A23] dark:text-white">Personalização & Aparência</h2>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
            Ajuste o tema visual e idioma da sua conta Prisma Player.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          {/* Dark Mode Row */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-card">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card">
                <Moon className="h-4 w-4 text-[#191A23] dark:text-[#B9FF66]" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#191A23] dark:text-white">Modo Escuro / Tema Dark</p>
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Ativar contraste escuro e elegante no painel</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => toggleDarkMode(!darkMode)}
              className={`relative h-6 w-11 rounded-full p-0.5 transition-colors cursor-pointer ${
                darkMode ? "bg-[#B9FF66]" : "bg-slate-300 dark:bg-zinc-700"
              }`}
            >
              <div
                className={`h-5 w-5 rounded-full bg-[#191A23] transition-transform ${
                  darkMode ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Language Row */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-card">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card">
                <Globe className="h-4 w-4 text-[#191A23] dark:text-[#B9FF66]" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#191A23] dark:text-white">Idioma do Painel</p>
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Selecione o idioma da interface</p>
              </div>
            </div>

            <AdminSelect label="Idioma do painel" value={language} onChange={setLanguage} className="w-full sm:w-56" options={[{ value: "pt-BR", label: "Português (Brasil)" }, { value: "en-US", label: "English (US)" }, { value: "es-ES", label: "Español" }]} />
          </div>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-card p-6 sm:p-7 shadow-xs space-y-5">
        <div>
          <h2 className="text-lg font-bold text-[#191A23] dark:text-white">Notificações & Alertas</h2>
          <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 mt-0.5">
            Gerencie como a Prisma Player se comunica com você.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-card">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card">
                <Bell className="h-4 w-4 text-[#191A23] dark:text-[#B9FF66]" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#191A23] dark:text-white">Relatórios por E-mail</p>
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Receber resumo semanal de métricas das VSLs</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEmailAlerts(!emailAlerts)}
              className={`relative h-6 w-11 rounded-full p-0.5 transition-colors cursor-pointer ${
                emailAlerts ? "bg-[#B9FF66]" : "bg-slate-300 dark:bg-zinc-700"
              }`}
            >
              <div
                className={`h-5 w-5 rounded-full bg-[#191A23] transition-transform ${
                  emailAlerts ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-card">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card">
                <Volume2 className="h-4 w-4 text-[#191A23] dark:text-[#B9FF66]" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#191A23] dark:text-white">Efeitos Sonoros no Player</p>
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Sons sutis de clique na biblioteca</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSoundEffects(!soundEffects)}
              className={`relative h-6 w-11 rounded-full p-0.5 transition-colors cursor-pointer ${
                soundEffects ? "bg-[#B9FF66]" : "bg-slate-300 dark:bg-zinc-700"
              }`}
            >
              <div
                className={`h-5 w-5 rounded-full bg-[#191A23] transition-transform ${
                  soundEffects ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button onClick={handleSave} className="h-10 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] text-[#191A23] font-bold text-xs shadow-xs cursor-pointer">
          Salvar Preferências
        </Button>
      </div>
    </div>
  );
}
