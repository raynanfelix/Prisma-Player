"use client";

// Date Picker da Prisma - composição do Calendar/Popover do shadcn com copy
// PT-BR ("Escolha um período", presets Hoje/Últimos N dias/Este mês) e tokens
// da marca: bordas slate-200/zinc-800, card branco (preto no escuro),
// seleção via bg-selected e range verde translúcido (calibrados no calendar).

import { useState } from "react";

import { CalendarDays, ChevronDown } from "lucide-react";
import { format, isSameDay, startOfDay, startOfMonth, startOfToday, subDays } from "date-fns";
import { ptBR } from "react-day-picker/locale";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PickerDateRange = { from: Date; to: Date };

function formatShort(date: Date) {
  return format(date, "d 'de' MMM", { locale: ptBR });
}

function formatLong(date: Date) {
  return format(date, "d 'de' MMM 'de' yyyy", { locale: ptBR });
}

function rangeLabel(value: PickerDateRange) {
  return isSameDay(value.from, value.to) ? formatLong(value.from) : `${formatShort(value.from)} - ${formatShort(value.to)}`;
}

/** Painel lateral de atalhos de período (range picker). */
const RANGE_PRESETS = [
  { label: "Hoje", build: () => ({ from: startOfToday(), to: startOfToday() }) },
  { label: "Últimos 7 dias", build: () => ({ from: startOfDay(subDays(startOfToday(), 6)), to: startOfToday() }) },
  { label: "Últimos 30 dias", build: () => ({ from: startOfDay(subDays(startOfToday(), 29)), to: startOfToday() }) },
  { label: "Últimos 90 dias", build: () => ({ from: startOfDay(subDays(startOfToday(), 89)), to: startOfToday() }) },
  { label: "Este mês", build: () => ({ from: startOfMonth(startOfToday()), to: startOfToday() }) },
];

function PickerTrigger({
  open,
  disabled,
  label,
  className,
  children,
}: {
  open: boolean;
  disabled?: boolean;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={label}
      className={cn(
        "flex h-9 min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-prisma-blue disabled:opacity-50 dark:border-zinc-800 dark:bg-card dark:text-zinc-200",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <ChevronDown size={14} aria-hidden className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />;
}

/** Picker de data única (single). */
export function DatePicker({
  value,
  onChange,
  label = "Escolha uma data",
  placeholder = "Escolha uma data",
  disabled,
  className,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <PickerTrigger open={open} disabled={disabled} label={label} className={className}>
            <CalendarDays size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="truncate">{value ? formatLong(value) : <span className="text-muted-foreground">{placeholder}</span>}</span>
            <Chevron open={open} />
          </PickerTrigger>
        }
      />
      <PopoverContent align="start" className="w-auto rounded-2xl border border-slate-200 p-2 dark:border-zinc-800">
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <Calendar
          mode="single"
          locale={ptBR}
          selected={value}
          onSelect={(date) => {
            onChange(date ? startOfDay(date) : undefined);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Picker de período (from-to) com painel lateral de presets. */
export function DateRangePicker({
  value,
  onChange,
  label = "Escolha um período",
  placeholder = "Escolha um período",
  disabled,
  className,
}: {
  value: PickerDateRange | undefined;
  onChange: (range: PickerDateRange | undefined) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const activePreset = value
    ? RANGE_PRESETS.findIndex((preset) => {
        const presetRange = preset.build();
        return isSameDay(presetRange.from, value.from) && isSameDay(presetRange.to, value.to);
      })
    : -1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <PickerTrigger open={open} disabled={disabled} label={label} className={className}>
            <CalendarDays size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="truncate">
              {value ? rangeLabel(value) : <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            <Chevron open={open} />
          </PickerTrigger>
        }
      />
      <PopoverContent
        align="start"
        className="flex w-[min(600px,calc(100vw-24px))] flex-row gap-0 overflow-hidden rounded-2xl border border-slate-200 p-0 dark:border-zinc-800"
      >
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <div className="flex w-32 shrink-0 flex-col gap-1 border-r border-slate-200 p-2 dark:border-zinc-800">
          <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Períodos</p>
          {RANGE_PRESETS.map((preset, index) => (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(preset.build());
                setOpen(false);
              }}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40",
                activePreset === index
                  ? "border border-[#B9FF66]/60 bg-[#B9FF66]/10 text-foreground"
                  : "border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-2">
          <Calendar
            mode="range"
            locale={ptBR}
            numberOfMonths={1}
            selected={value}
            onSelect={(range) => {
              if (!range?.from) {
                onChange(undefined);
                return;
              }
              if (!range.to) return; // aguardando o segundo clique do período
              const from = startOfDay(range.from <= range.to ? range.from : range.to);
              const to = startOfDay(range.from <= range.to ? range.to : range.from);
              onChange({ from, to });
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
