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

type PopoverPos = { top: number; left: number; width: number };

/**
 * Dropdown próprio (sem o nativo do navegador): botão + listbox em posição
 * fixa calculada do botão. Fixa escapa de qualquer ancestral com
 * overflow-hidden (painéis, tabelas, drawers), que cortava a lista.
 */
export default function AdminSelect({ value, options, onChange, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(-1);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((item) => item.value === value);

  function measure(): PopoverPos | null {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const height = Math.min(240, options.length * 36 + 8);
    const below = window.innerHeight - rect.bottom;
    const top = below >= height + 8 || rect.top < height + 8
      ? rect.bottom + 4
      : Math.max(8, rect.top - height - 4);
    return { top, left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: Math.max(rect.width, 140) };
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setPos(measure());
    setFocus(options.findIndex((item) => item.value === value));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
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
        onClick={toggle}
        onKeyDown={(event) => { if ((event.key === "ArrowDown" || event.key === "Enter") && !open) { event.preventDefault(); toggle(); } }}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-medium themeable-text-ink transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prisma-blue dark:border-zinc-800 dark:bg-card"
      >
        <span className="truncate">{selected?.label ?? "—"}</span>
        <ChevronDown size={14} aria-hidden className={cn("shrink-0 transition-transform themeable-text-ink-muted-48", open && "rotate-180")} />
      </button>
      {open && pos && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={onKey}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="fixed z-[100] max-h-60 overflow-y-auto rounded-xl border bg-white p-1 shadow-2xl themeable-border-hairline dark:bg-card"
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
