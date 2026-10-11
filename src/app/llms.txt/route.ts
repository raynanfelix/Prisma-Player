import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Contexto legível por IAs (convenção llms.txt): lido do catálogo vigente,
 * nunca hardcodado — o preço aqui é sempre o preço real.
 */
export async function GET() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://prisma-player.vercel.app").replace(/\/$/, "");
  let plans: Array<{ slug: string; name: string; description: string; amount_cents: number; included_plays: number; storage_gb: number; prisma_ai_analyses: number; team_seats: number }> = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("billing_plans")
      .select("slug,name,description,amount_cents,included_plays,storage_gb,prisma_ai_analyses,team_seats")
      .eq("is_active", true).order("display_order");
    plans = data ?? [];
  } catch {
    plans = [];
  }

  const lines = [
    "# Prisma Player",
    "",
    "> Player de VSL (video sales letter) com embeds, analytics de retenção, testes A/B, pixels de conversão e Prisma IA.",
    "",
    "## Páginas",
    `- Site: ${base}/`,
    `- Planos e preços: ${base}/pricing`,
    `- Sitemap: ${base}/sitemap.xml`,
    "",
    "## Planos (BRL, mensais)",
    "",
  ];
  for (const plan of plans) {
    lines.push(`### ${plan.name} (${plan.slug})`);
    lines.push(`- Preço: R$ ${(plan.amount_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por mês`);
    lines.push(`- Plays incluídos por mês: ${plan.included_plays.toLocaleString("pt-BR")} (excedente cobrado à parte)`);
    lines.push(`- Armazenamento: ${plan.storage_gb} GB`);
    lines.push(`- Análises Prisma IA por mês: ${plan.prisma_ai_analyses}`);
    lines.push(`- Membros na equipe: ${plan.team_seats}`);
    lines.push(`- Descrição: ${plan.description}`);
    lines.push("");
  }
  lines.push("## Contato comercial");
  lines.push(`- Planos e teste gratuito: ${base}/pricing`);
  return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
