"use client"

import * as React from "react"
import { AlertTriangle, Trash2 } from "lucide-react"
import Dialog from "@/components/ui/Dialog"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/I18nProvider"

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  confirmVariant?: "danger" | "default"
  danger?: boolean
}

interface State extends ConfirmOptions {
  title: string
  confirmLabel: string
  danger: boolean
}

function ConfirmDialog({
  open,
  options,
  onClose,
  onConfirm,
}: {
  open: boolean;
  options: State;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={options.title}
      description={options.description}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant={options.danger ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {options.danger ? <Trash2 size={15} /> : null}
            {options.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${options.danger ? "bg-red-50 dark:bg-red-950/40 text-red-600" : "bg-slate-100 dark:bg-card text-slate-600 dark:text-zinc-300"}`}>
          <AlertTriangle size={18} aria-hidden />
        </span>
        <p className="text-xs leading-5 text-slate-600 dark:text-zinc-400">
          {t("confirm.irreversible")}
          <strong className="font-bold text-slate-900 dark:text-white">
            {options.confirmLabel}
          </strong>{" "}
          {t("confirm.toProceedOr")}&nbsp;
          <strong className="font-bold text-slate-900 dark:text-white">{t("cancel")}</strong>{" "}
          {t("confirm.toGoBack")}
        </p>
      </div>
    </Dialog>
  )
}

export function useConfirm() {
  const [state, setState] = React.useState<State | null>(null)
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null)

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel ?? (options.danger ? "Excluir" : "Confirmar"),
        danger: options.danger ?? true,
      });
    });
  }, []);

  const close = React.useCallback(() => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setState(null);
  }, []);

  const resolve = React.useCallback(() => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setState(null);
  }, []);

  const dialog = state ? (
    <ConfirmDialog open options={state} onClose={close} onConfirm={resolve} />
  ) : null;

  return [dialog, confirm] as const;
}