"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  lines: Array<{ label: string; value: string }>;
  consequence: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  reasonRequired?: boolean;
  reason?: string;
  onReason?: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

/** Confirmação acessível p/ ações sensíveis. Sem window.confirm. */
export default function AdminConfirm({ open, title, lines, consequence, confirmLabel, danger, busy, reasonRequired, reason = "", onReason, onConfirm, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const reasonOk = !reasonRequired || reason.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-label={title} tabIndex={-1} className="w-full max-w-md rounded-[20px] border bg-white shadow-2xl outline-none themeable-border-hairline dark:bg-card">
        <div className="border-b px-5 py-4 themeable-border-hairline">
          <h2 className="text-[16px] font-semibold themeable-text-ink">{title}</h2>
          <p className="mt-1 text-[12px] themeable-text-ink-muted-48">{consequence}</p>
        </div>
        <dl className="space-y-2 px-5 py-4">
          {lines.map((line) => <div key={line.label} className="flex justify-between gap-3 text-[12px]"><dt className="themeable-text-ink-muted-48">{line.label}</dt><dd className="max-w-[60%] truncate text-right font-semibold themeable-text-ink">{line.value}</dd></div>)}
        </dl>
        {reasonRequired && (
          <div className="px-5 pb-2">
            <label className="mb-1 block text-[11px] font-semibold themeable-text-ink-muted-48" htmlFor="admin-confirm-reason">Motivo (obrigatório, vai para a auditoria)</label>
            <input id="admin-confirm-reason" value={reason} onChange={(event) => onReason?.(event.target.value)} maxLength={280} placeholder="Ex.: solicitação do cliente por email" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[12px] dark:border-zinc-800 dark:bg-black" />
          </div>
        )}
        <div className="flex gap-2 px-5 py-4">
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded-xl border border-slate-200 text-[13px] font-semibold dark:border-zinc-800">Cancelar</button>
          <button type="button" disabled={busy || !reasonOk} onClick={onConfirm} className={`h-10 flex-1 rounded-xl text-[13px] font-bold disabled:opacity-40 ${danger ? "bg-red-600 text-white" : "bg-selected text-selected-foreground"}`}>{busy ? "Enviando…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
