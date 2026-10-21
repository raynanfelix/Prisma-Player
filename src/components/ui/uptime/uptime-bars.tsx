"use client";

/**
 * Grade de barras diárias do UptimeCard (kokonutui, MIT - adaptado Prisma).
 * Subcomponente extraído para respeitar o teto de 350 linhas (quality).
 */

import { cn } from "@/lib/utils";
import { BAR_COLOR, statusOf, type UptimeService } from "./uptime-utils";

export interface UptimeBarsProps {
  services: UptimeService[];
  days: number;
  /** Uptime por serviço (null = sem dados). */
  uptimes: (number | null)[];
  shownDay: number | null;
}

export function UptimeBars({ services, days, uptimes, shownDay }: UptimeBarsProps) {
  return (
    <>
      {services.map((service, row) => (
        <div className={cn(row > 0 && "mt-3")} key={service.name}>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="font-medium">{service.name}</span>
            <span className="tabular-nums text-[#7a7a7a] dark:text-zinc-400">
              {uptimes[row] === null || uptimes[row] === undefined
                ? "-"
                : `${uptimes[row].toFixed(2)}%`}
            </span>
          </div>
          <div className="flex h-7 gap-px sm:gap-[2px]" data-row>
            {Array.from({ length: days }, (_, day) => {
              const status = statusOf(service, day);
              const lit = day === shownDay;
              return (
                <div
                  className={cn(
                    "min-w-0 basis-0 rounded-[2px] transition-opacity duration-150 ease-out",
                    BAR_COLOR[status],
                    shownDay !== null && !lit && "opacity-60",
                  )}
                  // biome-ignore lint/suspicious/noArrayIndexKey: uma barra por dia, nunca reordenada
                  key={day}
                  style={{ flexGrow: 1 }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
