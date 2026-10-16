import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { billingPlans } = schema;

/**
 * Contexto legível por IAs (convenção llms.txt): lido do catálogo vigente,
 * nunca hardcodado — o preço aqui é sempre o preço real.
 */
export async function GET() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://prisma-player.vercel.app").replace(/\/$/, "");
  let plans: Array<{ slug: string; name: string; description: string; amount_cents: number; included_plays: number; storage_gb: number; prisma_ai_analyses: number; team_seats: number }> = [];
  try {
    const rows = await db
      .select({
        slug: billingPlans.slug,
        name: billingPlans.name,
        description: billingPlans.description,
        amountCents: billingPlans.amountCents,
        includedPlays: billingPlans.includedPlays,
        storageGb: billingPlans.storageGb,
        prismaAiAnalyses: billingPlans.prismaAiAnalyses,
        teamSeats: billingPlans.teamSeats,
      })
      .from(billingPlans)
      .where(eq(billingPlans.isActive, true))
      .orderBy(asc(billingPlans.displayOrder));
    plans = rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      amount_cents: row.amountCents,
      included_plays: row.includedPlays,
      storage_gb: row.storageGb,
      prisma_ai_analyses: row.prismaAiAnalyses,
      team_seats: row.teamSeats,
    }));
  } catch {
    plans = [];
  }

  const formatBRL = (cents: number) =>
    `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

  const lines = [
    "# Prisma Player",
    "",
    "> Player de vídeo para VSL e marketing com analytics de conversão,",
    "> testes A/B e inteligência artificial. Hospedagem de vídeo no R2.",
    "",
    "## Planos (valores reais do catálogo)",
    "",
    ...plans.map(
      (plan) =>
        `- ${plan.name} (${plan.slug}): ${formatBRL(plan.amount_cents)}/mês — ${plan.description}; ${plan.included_plays} plays, ${plan.storage_gb} GB, ${plan.prisma_ai_analyses} análises de IA, ${plan.team_seats} assento(s).`,
    ),
    "",
    "## Links",
    "",
    `- Site: ${base}`,
    `- Preços: ${base}/pricing`,
    `- Serviços: ${base}/services`,
    `- Sobre: ${base}/about`,
    "",
  ];

  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
