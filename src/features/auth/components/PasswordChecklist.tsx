"use client";

import { Circle, CircleCheck } from "lucide-react";
import { getPasswordChecks, getPasswordStrength } from "@/features/auth/lib/validation";
import { cn } from "@/lib/utils";

const segmentTone = [
  "bg-slate-200",
  "bg-red-400",
  "bg-amber-400",
  "bg-lime-500",
  "bg-[#B9FF66]",
] as const;

const labelTone = [
  "text-red-600",
  "text-red-600",
  "text-amber-600",
  "text-lime-700",
  "text-emerald-700",
] as const;

interface PasswordChecklistProps {
  password: string;
}

/**
 * Medidor de força + checklist ao vivo dos requisitos de senha.
 * Apenas "8+ caracteres" é obrigatório; os demais itens elevam a força.
 */
export function PasswordChecklist({ password }: PasswordChecklistProps) {
  const checks = getPasswordChecks(password);
  const { score, label } = getPasswordStrength(password);
  const isEmpty = password.length === 0;

  return (
    <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-1" aria-hidden>
          {[0, 1, 2, 3].map((segment) => (
            <span
              key={segment}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                segment < score ? segmentTone[score] : "bg-slate-200",
              )}
            />
          ))}
        </div>
        {!isEmpty && (
          <span className={cn("text-[11px] font-semibold", labelTone[score])} role="status">
            {label}
          </span>
        )}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
        {checks.map((check) => (
          <li
            key={check.id}
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-medium",
              check.met
                ? "text-emerald-700"
                : check.required
                  ? "text-slate-600"
                  : "text-slate-400",
            )}
          >
            {check.met ? (
              <CircleCheck size={13} className="shrink-0" aria-hidden />
            ) : (
              <Circle size={13} className="shrink-0 text-slate-300" aria-hidden />
            )}
            {check.label}
            {!check.required && <span className="sr-only">(recomendado)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
