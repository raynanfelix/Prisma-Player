"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n/I18nProvider";

/**
 * Ponto único de composição dos providers globais.
 * Providers de domínio devem permanecer próximos às features que os utilizam.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}
