"use client";

import { useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface AuthFieldProps extends ComponentProps<typeof Input> {
  label: string;
  hint?: string;
  /** Mensagem de erro exibida sob o campo e ligada via aria-invalid/describedby. */
  error?: string;
  trailing?: ReactNode;
  /** Exibe o botão mostrar/ocultar senha (usar com type="password"). */
  revealPassword?: boolean;
}

export function AuthField({
  label,
  hint,
  error,
  trailing,
  className,
  id,
  type = "text",
  revealPassword,
  ...props
}: AuthFieldProps) {
  const [visible, setVisible] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const isPassword = type === "password";
  const inputType = isPassword && revealPassword && visible ? "text" : type;

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-4">
        <label htmlFor={id} className="text-xs font-semibold text-[#191A23]">
          {label}
        </label>
        {trailing}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={inputType}
          className={cn(
            "h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#191A23] transition-all focus-visible:outline-none focus-visible:border-[#B9FF66] focus-visible:ring-2 focus-visible:ring-[#B9FF66]/50 placeholder:text-slate-400 shadow-none",
            revealPassword && isPassword && "pr-11",
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {isPassword && revealPassword && (
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={visible}
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#191A23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FF66]/50"
          >
            {visible ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
          </button>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs font-medium text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
