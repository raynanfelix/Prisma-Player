"use client";

import { useI18n } from "./I18nProvider";

const marketPlanPrices: Record<number, { USD: number; EUR: number }> = {
  9700: { USD: 1900, EUR: 1800 },
  19700: { USD: 3900, EUR: 3600 },
  39700: { USD: 7900, EUR: 7200 },
};

export default function LocalizedMoney({ brlCents, className }: { brlCents: number; className?: string }) {
  const { locale, currency } = useI18n();
  const localizedCents = currency === "BRL" ? brlCents : marketPlanPrices[brlCents]?.[currency] ?? Math.round(brlCents * (currency === "USD" ? .19 : .17));
  return <span className={className}>{new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(localizedCents / 100)}</span>;
}
