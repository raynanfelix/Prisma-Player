"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { AuthNoticeState } from "@/features/auth/model/types";
import { cn } from "@/lib/utils";

const toneStyles = {
  error: "border border-red-200 bg-red-50 text-red-800",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border border-slate-200 bg-slate-50 text-slate-800",
};

const toneIcons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

export function AuthNotice({ notice }: { notice: AuthNoticeState | null }) {
  return (
    <AnimatePresence mode="wait">
      {notice && (
        <motion.div
          key={`${notice.tone}:${notice.message}`}
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn("flex items-start gap-3 overflow-hidden rounded-xl p-3.5 text-xs font-medium leading-relaxed shadow-xs", toneStyles[notice.tone])}
        >
          {(() => {
            const Icon = toneIcons[notice.tone];
            return <Icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />;
          })()}
          <span>{notice.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
