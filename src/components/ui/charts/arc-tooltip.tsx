"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface ArcTooltipProps {
  children: React.ReactNode;
  value: number;
  label: string;
  color: string;
  className?: string;
}

export function ArcTooltip({ children, value, label, color, className }: ArcTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <g onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, {
              onMouseEnter: () => setIsHovered(true),
              onMouseLeave: () => setIsHovered(false),
            })
          : child
      )}
      {isHovered && (
        <>
          <div
            className={cn(
              "absolute z-10 pointer-events-none rounded-lg border border-black/10 bg-white p-2 text-xs shadow-lg dark:border-white/10 dark:bg-zinc-900",
              className,
            )}
            style={{
              top: -40,
              left: 100,
              transform: "translateX(-50%)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="font-medium text-[#191A23] dark:text-white">{label}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[#191A23] dark:text-white">
              {value.toLocaleString("pt-BR")}
            </div>
          </div>
          <line
            x1={100}
            y1={100}
            x2={100}
            y2={60}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            pointerEvents="none"
          />
        </>
      )}
    </g>
  );
}