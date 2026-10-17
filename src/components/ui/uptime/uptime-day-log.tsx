"use client";

/**
 * Log de incidentes do dia fixado no UptimeCard (kokonutui, MIT — adaptado
 * Prisma: textos pt-BR, superfícies/hairlines dos tokens do projeto).
 * Subcomponente extraído para respeitar o teto de 350 linhas (quality).
 */

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_TEXT, formatDay, type Incident } from "./uptime-utils";

export interface UptimeDayLogProps {
  /** Millis do dia fixado (meia-noite UTC). */
  dayMs: number;
  incidents: { service: string; incident: Incident }[];
  onClose: () => void;
}

export function UptimeDayLog({ dayMs, incidents, onClose }: UptimeDayLogProps) {
  return (
    <div className="mt-4 rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{formatDay(dayMs)}</p>
        <button
          aria-label="Fechar dia"
          className="rounded-full p-1 text-[#7a7a7a] outline-none transition-colors duration-150 ease-out hover:bg-black/10 hover:text-[#191A23] focus-visible:ring-2 focus-visible:ring-ring dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      {incidents.length === 0 && (
        <p className="mt-1 text-sm text-[#7a7a7a] dark:text-zinc-400">
          Nenhum incidente registrado. Todos os serviços operaram normalmente.
        </p>
      )}
      {incidents.map(({ service, incident }) => (
        <div className="mt-3" key={service}>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                incident.status === "down"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              {STATUS_TEXT[incident.status]}
            </span>
            <span className="font-medium">{service}</span>
            <span className="text-[#7a7a7a] dark:text-zinc-400">
              {incident.title} · {incident.minutes} min
            </span>
          </p>
          <ol className="ml-1 mt-2.5 border-l border-slate-200 dark:border-zinc-800">
            {incident.updates.map((update) => (
              <li
                className="relative pb-2.5 pl-4 text-sm last:pb-0"
                key={`${update.time}-${update.label}`}
              >
                <span className="absolute top-[7px] -left-[3.5px] size-1.5 rounded-full bg-[#7a7a7a] dark:bg-zinc-500" />
                <span className="tabular-nums text-[#7a7a7a] dark:text-zinc-500">
                  {update.time}
                </span>{" "}
                <span className="font-medium">{update.label}</span>
                {update.note && (
                  <span className="text-[#7a7a7a] dark:text-zinc-400">
                    {" "}
                    {update.note}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
