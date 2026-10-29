"use client";

import { useEffect, type ReactNode } from "react";
import { initClientErrorCapture } from "@/lib/errors/capture-client";
import { AppErrorBoundary } from "./AppErrorBoundary";

/**
 * Initializes client-side error capture (global listeners) once on mount
 * and wraps children with the AppErrorBoundary for React render errors.
 * Must be rendered inside the app shell so all pages are covered.
 */
export function ClientErrorCapture({ children }: { children: ReactNode }) {
  useEffect(() => {
    initClientErrorCapture();
  }, []);

  return <AppErrorBoundary>{children}</AppErrorBoundary>;
}