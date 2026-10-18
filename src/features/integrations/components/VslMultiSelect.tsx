"use client";

import { useMemo, useState } from "react";

import { ChevronDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { VslOption } from "./store-data";

interface VslMultiSelectProps {
  options: VslOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Nome do controle para leitores de tela (o rótulo visível fica na tela). */
  label?: string;
  /** Texto do trigger quando nenhuma VSL está selecionada. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-select de VSLs do Marketplace: trigger com badge de contagem
 * ("3 VSLs"), popover com busca, checkboxes verdes (token de marca) e rodapé
 * "Selecionar todas / Limpar". Reutiliza o Popover do shadcn (Base UI) —
 * sem estado de foco manual.
 */
export default function VslMultiSelect({
  options,
  selected,
  onChange,
  label = "Selecionar VSLs",
  placeholder = "Todas as VSLs",
  disabled,
  className,
}: VslMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? options.filter((vsl) => vsl.title.toLowerCase().includes(term)) : options;
  }, [options, search]);

  const allIds = useMemo(() => options.map((vsl) => vsl.id), [options]);
  const allSelected = options.length > 0 && selected.length >= allIds.length;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={label}
              className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-medium themeable-text-ink transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prisma-blue disabled:opacity-50 dark:border-zinc-800 dark:bg-card"
            >
              {selected.length > 0 ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-[#B9FF66] px-2.5 py-1 text-[11px] font-bold text-[#191A23]">
                  {selected.length} VSL{selected.length === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="truncate text-muted-foreground">{placeholder}</span>
              )}
              <ChevronDown size={14} aria-hidden className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
          }
        />
        <PopoverContent align="start" className="w-[min(340px,calc(100vw-32px))] gap-0 p-2">
          <div className="relative mb-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar VSL…"
              aria-label="Buscar VSL"
              className="h-9 pl-8 text-xs"
            />
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          </div>

          {options.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">Crie uma VSL primeiro em Meus vídeos.</p>
          ) : filtered.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nenhuma VSL encontrada.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto p-1">
              <div className="flex flex-col gap-1.5">
                {filtered.map((vsl) => {
                  const checked = selected.includes(vsl.id);
                  return (
                    <label
                      key={vsl.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 text-[13px] transition-colors",
                        checked ? "border-[#B9FF66]/60 bg-[#B9FF66]/10" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="truncate font-medium text-foreground">{vsl.title}</span>
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-[#B9FF66]"
                        checked={checked}
                        onChange={() => toggle(vsl.id)}
                        aria-label={`Selecionar ${vsl.title}`}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {options.length > 0 && (
            <div className="mt-2 flex items-center justify-between border-t pt-2 themeable-border-divider-soft">
              <button
                type="button"
                onClick={() => onChange(allIds)}
                disabled={disabled || allSelected}
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 cursor-pointer"
              >
                Selecionar todas
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={disabled || selected.length === 0}
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 cursor-pointer"
              >
                Limpar
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
