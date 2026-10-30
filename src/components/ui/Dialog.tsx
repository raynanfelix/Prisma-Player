"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
};

export default function Dialog({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  size = "md",
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Store the previously focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Focus the dialog or first focusable element
    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements?.[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      dialogRef.current?.focus();
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      
      // Focus trap: Tab/Shift+Tab cycling within dialog
      if (event.key === "Tab") {
        const focusableElements = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ) ?? []
        ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
        
        if (focusableElements.length === 0) return;
        
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      // Restore focus to previously focused element
      previousActiveElement.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[80] flex animate-dialog-backdrop items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-6"
      onMouseDown={(event) => {
        // Only close on backdrop click, not on dialog content
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-description" : undefined}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        ref={dialogRef}
        className={`flex max-h-[92dvh] w-full animate-dialog-panel flex-col overflow-hidden rounded-t-[18px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-card shadow-2xl sm:rounded-[18px] ${sizes[size]}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 px-5 py-4 sm:px-6">
          <div>
            <h2 id="dialog-title" className="text-lg font-bold tracking-tight text-[#191A23] dark:text-white">{title}</h2>
            {description && <p id="dialog-description" className="mt-1 text-xs font-medium text-slate-500 dark:text-zinc-400">{description}</p>}
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            aria-label="Fechar" 
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-card text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-[#B9FF66] focus-visible:ring-2"
          >
            <X size={16} />
          </button>
        </header>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-100 dark:border-zinc-800 px-5 py-4 sm:px-6">{footer}</footer>}
      </section>
    </div>
  );
}
