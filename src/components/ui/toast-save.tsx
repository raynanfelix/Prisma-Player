"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface ToastSaveProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"> {
  state: "initial" | "loading" | "success"
  onReset?: () => void
  onSave?: () => void
  loadingText?: string
  successText?: string
  initialText?: string
  resetText?: string
  saveText?: string
}

const InfoIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 18 18"
    className="text-current"
  >
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" stroke="currentColor">
      <circle cx="9" cy="9" r="7.25"></circle>
      <line x1="9" y1="12.819" x2="9" y2="8.25"></line>
      <path d="M9,6.75c-.552,0-1-.449-1-1s.448-1,1-1,1,.449,1,1-.448,1-1,1Z" fill="currentColor" stroke="none"></path>
    </g>
  </svg>
)

const springConfig = {
  type: "spring" as const,
  stiffness: 500,
  damping: 30,
  mass: 1,
}

export function ToastSave({
  state = "initial",
  onReset,
  onSave,
  loadingText = "Salvando",
  successText = "Alterações salvas",
  initialText = "Alterações não salvas",
  resetText = "Descartar",
  saveText = "Salvar",
  className,
  ...props
}: ToastSaveProps) {
  return (
    <motion.div
      className={cn(
        "inline-flex h-10 items-center justify-center overflow-hidden rounded-full",
        "bg-background/95 dark:bg-card backdrop-blur",
        "border border-slate-200 dark:border-zinc-800",
        "shadow-[0_8px_16px_-4px_rgba(25,26,35,0.16)] dark:shadow-[0_8px_16px_-4px_rgba(0,0,0,0.4)]",
        className,
      )}
      initial={false}
      animate={{ width: "auto" }}
      transition={springConfig}
      {...props}
    >
      <div className="flex h-full items-center justify-between px-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={state}
            className="flex items-center gap-2 text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0 }}
          >
            {state === "loading" && (
              <>
                <Spinner size="sm" />
                <span className="text-[13px] font-medium leading-tight whitespace-nowrap">
                  {loadingText}
                </span>
              </>
            )}
            {state === "success" && (
              <>
                <span className="grid size-5 place-items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 dark:bg-emerald-500/25">
                  <Check className="size-3.5 text-emerald-600 dark:text-emerald-500" />
                </span>
                <span className="text-[13px] font-medium leading-tight whitespace-nowrap">
                  {successText}
                </span>
              </>
            )}
            {state === "initial" && (
              <>
                <span className="text-[#191A23]/70 dark:text-white/70">
                  <InfoIcon />
                </span>
                <span className="text-[13px] font-medium leading-tight whitespace-nowrap">
                  {initialText}
                </span>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {state === "initial" && (
            <motion.div
              className="ml-2 flex items-center gap-2"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ ...springConfig, opacity: { duration: 0 } }}
            >
              <Button onClick={onReset} type="button" variant="ghost" size="xs" className="rounded-full px-3 text-[13px] font-medium">
                {resetText}
              </Button>
              <Button onClick={onSave} type="button" size="xs" className="rounded-full px-3 text-[13px] font-bold">
                {saveText}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}