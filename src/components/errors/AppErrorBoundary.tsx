"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureClientError } from "@/lib/errors/capture-client";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Global Error Boundary for React render errors.
 * Captures to the error ingestion pipeline and shows a safe fallback.
 * Does NOT reset automatically — user must reload or navigate away.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureClientError(error, {
      component: info.componentStack?.split("\n")[1]?.trim() ?? "Unknown",
      severity: "critical",
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Algo deu errado nesta seção.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-[#B9FF66] px-4 py-2 text-xs font-bold text-[#191A23] transition-opacity hover:opacity-90"
            >
              Recarregar página
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}