"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel = "Adicionar primeiro vídeo",
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-6 sm:py-16">
      <div className="mb-4 flex justify-center">
        {icon ? (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#B9FF66]/20 dark:bg-[#B9FF66]/10 text-[#191A23] dark:text-[#B9FF66]">
            {icon}
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-card text-slate-500 dark:text-zinc-400">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )}
      </div>
      <h3 className="text-center text-xl font-bold tracking-tight text-[#191A23] dark:text-white mb-1.5">
        {title}
      </h3>
      <p className="text-xs font-medium text-slate-500 dark:text-zinc-400 text-center max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex min-h-10 items-center gap-2 rounded-xl bg-[#B9FF66] hover:bg-[#a6ee50] dark:hover:bg-[#B9FF66] px-5 text-xs font-bold text-[#191A23] shadow-xs transition-transform active:scale-95 cursor-pointer"
        >
          <Plus size={15} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}
