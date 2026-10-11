"use client";

import type { ReactNode } from "react";

interface Action {
  label: string;
  icon?: ReactNode;
  primary?: boolean;
  onClick: () => void;
}

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
  actions?: Action[];
  children?: ReactNode;
}

export default function PageHeader({
  icon,
  title,
  actions = [],
  children,
}: PageHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-[#B9FF66] text-[#191A23] shadow-xs flex items-center justify-center">
            {icon}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#191A23] dark:text-white">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              className={`
                flex min-h-9 items-center justify-center gap-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer
                ${
                  action.primary
                    ? "bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] text-[#191A23] font-bold shadow-xs px-4 py-2"
                    : "bg-white dark:bg-card text-[#191A23] dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 font-semibold shadow-xs px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-transparent"
                }
              `}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
