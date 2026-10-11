import type { Metadata } from "next";
import CheckoutResult from "@/features/billing/components/CheckoutResult";
import { requireUser } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Resultado do pagamento", robots: { index: false, follow: false } };

export default async function CheckoutResultPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  await requireUser("/checkout/result");
  const checkout = (await searchParams).checkout;
  return <main className="flex min-h-screen items-center justify-center themeable-bg-canvas-parchment px-5 py-16">{checkout ? <CheckoutResult checkoutId={checkout} /> : <p className="themeable-text-ink">Checkout nao informado.</p>}</main>;
}
