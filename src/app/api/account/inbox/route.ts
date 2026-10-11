import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUserId } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const defaultMessages = [
  {
    kind: "welcome",
    title: "Bem-vindo à Prisma Player!",
    message: "Sua conta está configurada com sucesso. Aproveite a tecnologia de VSL com CDN ultra rápida, controle de velocidade e player personalizável.",
    action_label: "Explorar Meus Vídeos",
    action_url: "/dashboard/videos",
  },
  {
    kind: "trial",
    title: "Teste Gratuito de 14 Dias Ativo",
    message: "Você possui acesso completo a todas as funcionalidades Pro do Prisma Player. Nenhuma cobrança automática será realizada após os 14 dias.",
    action_label: "Ver Planos",
    action_url: "/dashboard/billing",
  },
  {
    kind: "tip",
    title: "Dica: Aumente sua Retenção com Pitch Delay",
    message: "Programe o aparecimento do botão de compra para o segundo exato da sua oferta no vídeo. VSLs com Pitch Delay aumentam a conversão em até 34%.",
    action_label: "Personalizar VSL",
    action_url: "/dashboard/videos",
  },
  {
    kind: "alert",
    title: "Proteção de Domínios Recomendada",
    message: "Proteja seus vídeos contra pirataria e cópias não autorizadas especificando seus domínios permitidos na aba de Segurança.",
    action_label: "Configurar Segurança",
    action_url: "/dashboard/security",
  },
];

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("user_inbox")
    .select("id,kind,title,message,action_label,action_url,read_at,created_at")
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: "inbox_failed" }, { status: 500 });

  // Seed default messages if empty
  if (!data || data.length === 0) {
    const toInsert = defaultMessages.map((item) => ({
      user_id: userId,
      ...item,
    }));
    await admin.from("user_inbox").insert(toInsert);

    const { data: fresh } = await admin
      .from("user_inbox")
      .select("id,kind,title,message,action_label,action_url,read_at,created_at")
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false });

    return NextResponse.json({ items: fresh ?? [] }, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json({ items: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `account-inbox:${userId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ id?: unknown; markAll?: boolean }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const admin = createAdminClient();

  if (body?.markAll) {
    const { error } = await admin
      .from("user_inbox")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    return error ? NextResponse.json({ error: "inbox_update_failed" }, { status: 500 }) : NextResponse.json({ ok: true });
  }

  if (typeof body?.id !== "string") return NextResponse.json({ error: "invalid_notification" }, { status: 400 });

  const { error } = await admin
    .from("user_inbox")
    .update({ read_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("user_id", userId);

  return error ? NextResponse.json({ error: "inbox_update_failed" }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `account-inbox:${userId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ id?: unknown; clearAll?: boolean }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const admin = createAdminClient();

  if (body?.clearAll) {
    const { error } = await admin
      .from("user_inbox")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("dismissed_at", null);
    return error ? NextResponse.json({ error: "inbox_delete_failed" }, { status: 500 }) : NextResponse.json({ ok: true });
  }

  if (typeof body?.id !== "string") return NextResponse.json({ error: "invalid_notification" }, { status: 400 });

  const { error } = await admin
    .from("user_inbox")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("user_id", userId);

  return error ? NextResponse.json({ error: "inbox_delete_failed" }, { status: 500 }) : NextResponse.json({ ok: true });
}
