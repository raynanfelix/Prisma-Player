"use client";
// Origem: componente próprio da Prisma (ui/custom) — dropdown acessível com
// tokens do tema para substituir o <select> nativo no admin e no produto.

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminOption = { value: string; label: string };

type Props = {
  value: string;
  options: AdminOption[];
  onChange: (value: string) => void;
  label: string;
  className?: string;
};

/**
 * Dropdown próprio do admin (sem o nativo do navegador): botão + listbox,
 * teclado (setas/Enter/Escape), foco visível e tokens do tema.
 */
export default function AdminSelect({ value, options, onChange, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((item) => item.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open ]);

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? Math.min(focus + 1, options.length - 1) : Math.max(focus - 1, 0);
      setFocus(next);
      document.getElementById(`${listId}-${next}`)?.focus();
    } else if (event.key === "Enter" && focus >= 0) {
      event.preventDefault();
      onChange(options[focus].value);
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => { setOpen((item) => !item); setFocus(options.findIndex((item) => item.value === value)); }}
        onKeyDown={(event) => { if ((event.key === "ArrowDown" || event.key === "Enter") && !open) { event.preventDefault(); setOpen(true); } }}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-medium themeable-text-ink transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prisma-blue dark:border-zinc-800 dark:bg-card"
      >
        <span className="truncate">{selected?.label ?? "—"}</span>
        <ChevronDown size={14} aria-hidden className={cn("shrink-0 transition-transform themeable-text-ink-muted-48", open && "rotate-180")} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={onKey}
          className="absolute inset-x-0 top-11 z-50 max-h-60 overflow-y-auto rounded-xl border bg-white p-1 shadow-2xl themeable-border-hairline dark:bg-card"
        >
          {options.map((item, index) => {
            const isSelected = item.value === value;
            return (
              <li
                key={item.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => { onChange(item.value); setOpen(false); buttonRef.current?.focus(); }}
                onMouseEnter={() => setFocus(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-[12px] outline-none",
                  isSelected ? "bg-selected font-bold text-selected-foreground" : "themeable-text-ink hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-transparent dark:focus-visible:bg-transparent dark:hover:text-white dark:focus-visible:text-white",
                )}
              >
                <span className="truncate">{item.label}</span>
                {isSelected && <Check size={14} aria-hidden className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
