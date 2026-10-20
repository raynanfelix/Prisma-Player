"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, CreditCard, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accountSettingsService } from "@/services/account/settings";
import { ApiError } from "@/services/http/client";

/**
 * Cancelamento com pesquisa de churn (spec Billing Completo, item 4 — skill
 * churn-prevention: 1 pergunta, oferta honesta, SEM dark pattern).
 *
 * Fluxo: botão "Cancelar assinatura" → pesquisa (radio + textos livres) →
 * POST /api/billing/churn-survey → oferta honesta ("Mudar plano" ou
 * "Continuar com cancelamento", ambas pelo Customer Portal — o Stripe é o
 * dono do cancelamento de verdade; a pesquisa NUNCA bloqueia).
 */

const REASONS: Array<{ value: string; label: string }> = [
  { value: "preco", label: "Preço alto / não cabe no orçamento" },
  { value: "nao_uso", label: "Não uso o suficiente" },
  { value: "problemas_tecnicos", label: "Problemas técnicos" },
  { value: "migrei_ferramenta", label: "Migrei para outra ferramenta" },
  { value: "outro", label: "Outro motivo" },
];

const TEXT_LIMIT = 500;

type Step = "idle" | "survey" | "offer";

export function CancelSurvey({ active, notify }: { active: boolean; notify: (message: string) => void }) {
  const [step, setStep] = useState<Step>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [improvement, setImprovement] = useState("");
  const [sending, setSending] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  if (!active) return null;

  const isOther = reason === "outro";
  const canContinue = reason !== null && (!isOther || detail.trim().length > 0);

  async function submitSurvey() {
    if (!canContinue || sending) return;
    setSending(true);
    try {
      await accountSettingsService.submitChurnSurvey({
        reason: reason ?? "outro",
        ...(detail.trim() ? { feedback: detail.trim().slice(0, TEXT_LIMIT) } : {}),
        ...(improvement.trim() ? { improvement: improvement.trim().slice(0, TEXT_LIMIT) } : {}),
      });
    } catch {
      // Transparência (spec): a pesquisa é 1 clique — falha nela NUNCA
      // bloqueia o cancelamento. Segue para a oferta do mesmo jeito.
      notify("Não foi possível registrar sua resposta — pode continuar com o cancelamento.");
    } finally {
      setSending(false);
      setStep("offer");
    }
  }

  async function openPortal() {
    if (openingPortal) return;
    setOpeningPortal(true);
    try {
      const { url } = await accountSettingsService.openBillingPortal();
      window.location.assign(url);
    } catch (error) {
      setOpeningPortal(false);
      notify(error instanceof ApiError ? error.message : "Não foi possível abrir o portal de cobrança agora.");
    }
  }

  if (step === "idle") {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-9 rounded-xl border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
        onClick={() => setStep("survey")}
      >
        Cancelar assinatura
      </Button>
    );
  }

  if (step === "survey") {
    return (
      <div className="space-y-4 rounded-xl border border-red-200 bg-red-50/40 p-4 dark:border-red-900/40 dark:bg-red-950/20">
        <div>
          <p className="text-sm font-bold text-[#191A23] dark:text-white">Por que está cancelando?</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
            Uma pergunta rápida — sua resposta nos ajuda a melhorar. O cancelamento segue disponível logo em seguida.
          </p>
        </div>
        <fieldset className="space-y-1.5">
          {REASONS.map((item) => (
            <label key={item.value} className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-[#191A23] dark:text-zinc-200">
              <input
                type="radio"
                name="churn-reason"
                value={item.value}
                checked={reason === item.value}
                onChange={() => setReason(item.value)}
                className="size-3.5 accent-[#191A23] dark:accent-[#B9FF66]"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#191A23] dark:text-zinc-200">
            {isOther ? "Conte um pouco mais (obrigatório)" : "Quer detalhar? (opcional)"}
          </label>
          <textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value.slice(0, TEXT_LIMIT))}
            maxLength={TEXT_LIMIT}
            rows={2}
            placeholder={isOther ? "Qual era o motivo?" : "O que aconteceu?"}
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-[#191A23] outline-none focus:border-[#B9FF66] dark:border-zinc-800 dark:bg-card dark:text-white"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#191A23] dark:text-zinc-200">O que podemos melhorar? (opcional)</label>
          <textarea
            value={improvement}
            onChange={(event) => setImprovement(event.target.value.slice(0, TEXT_LIMIT))}
            maxLength={TEXT_LIMIT}
            rows={2}
            placeholder="Sugestões, recursos que faltaram, qualquer coisa…"
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-[#191A23] outline-none focus:border-[#B9FF66] dark:border-zinc-800 dark:bg-card dark:text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            className="h-9 rounded-xl bg-[#B9FF66] text-xs font-bold text-[#191A23] hover:bg-[#a6ee50]"
            disabled={!canContinue || sending}
            onClick={() => void submitSurvey()}
          >
            {sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            {sending ? "Enviando…" : "Continuar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl text-xs font-semibold"
            disabled={sending}
            onClick={() => setStep("idle")}
          >
            Manter minha assinatura
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-[#B9FF66]/40 bg-[#B9FF66]/10 p-4 dark:bg-[#B9FF66]/5">
      <div>
        <p className="text-sm font-bold text-[#191A23] dark:text-white">Antes de concluir: prefere mudar de plano?</p>
        <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-zinc-300">
          Um plano menor pode resolver — e você mantém tudo como está. Se preferir, o cancelamento está logo abaixo,
          sem enrolação.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          className="h-9 rounded-xl bg-[#B9FF66] text-xs font-bold text-[#191A23] hover:bg-[#a6ee50]"
          disabled={openingPortal}
          onClick={() => void openPortal()}
        >
          {openingPortal ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <CreditCard className="size-4" aria-hidden />}
          Mudar plano
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-xl text-xs font-semibold"
          disabled={openingPortal}
          onClick={() => void openPortal()}
        >
          Continuar com cancelamento <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
        <AlertCircle className="size-3.5 shrink-0" aria-hidden />
        O cancelamento é concluído no portal seguro do Stripe — sem ligação, sem e-mail, sem obstáculo.
      </p>
    </div>
  );
}
