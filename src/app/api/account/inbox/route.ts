import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getCurrentUserId } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";

const { userInbox } = schema;

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

const inboxColumns = {
  id: userInbox.id,
  kind: userInbox.kind,
  title: userInbox.title,
  message: userInbox.message,
  actionLabel: userInbox.actionLabel,
  actionUrl: userInbox.actionUrl,
  readAt: userInbox.readAt,
  createdAt: userInbox.createdAt,
};

type InboxRow = {
  id: string;
  kind: string;
  title: string;
  message: string;
  actionLabel: string | null;
  actionUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function toInboxItem(row: InboxRow) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    message: row.message,
    action_label: row.actionLabel,
    action_url: row.actionUrl,
    read_at: isoOrNull(row.readAt),
    created_at: row.createdAt.toISOString(),
  };
}

async function fetchInbox(userId: string) {
  return db.select(inboxColumns)
    .from(userInbox)
    .where(and(eq(userInbox.userId, userId), isNull(userInbox.dismissedAt)))
    .orderBy(desc(userInbox.createdAt));
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await fetchInbox(userId);

  // Seed uma única vez na vida da conta: se só olhássemos as não-dispensadas,
  // dispensar as 4 padrões ressuscitava todas no próximo GET.
  if (data.length === 0) {
    // Caminho quente: conta já tem QUALQUER linha (inclusive dispensada) =>
    // nunca re-semeia. O count fora do lock evita pagar lock por GET.
    const [everRow] = await db.select({ total: sql<number>`count(*)::int` }).from(userInbox).where(eq(userInbox.userId, userId));
    if ((everRow?.total ?? 0) > 0) return NextResponse.json({ items: [] }, { headers: { "cache-control": "no-store" } });
    // Race real do mount: o sino e a página do inbox disparam GET juntos no
    // primeiro acesso => ambos viam count=0 e ambos inseriam os 4 defaults
    // (só 'welcome' tem índice único parcial; trial/tip/alert duplicavam).
    // O pg_advisory_xact_lock serializa os seeds: o segundo GET espera, o
    // re-count dentro da transação vê as linhas do primeiro e não insere.
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"inbox-seed:" + userId}))`);
        const [locked] = await tx.select({ total: sql<number>`count(*)::int` }).from(userInbox).where(eq(userInbox.userId, userId));
        if ((locked?.total ?? 0) > 0) return;
        await tx.insert(userInbox).values(defaultMessages.map((item) => ({ userId, ...item })));
      });
    } catch {
      // Seed é melhor-esforço: falhou (ex.: lock indisponível), o próximo GET
      // tenta de novo — sem duplicar, pois o re-count acima é a guarda.
    }
    const fresh = await fetchInbox(userId);
    return NextResponse.json({ items: fresh.map(toInboxItem) }, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json({ items: data.map(toInboxItem) }, { headers: { "cache-control": "no-store" } });
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

  try {
    if (body?.markAll) {
      await db.update(userInbox).set({ readAt: new Date() })
        .where(and(eq(userInbox.userId, userId), isNull(userInbox.readAt)));
      return NextResponse.json({ ok: true });
    }

    if (typeof body?.id !== "string") return NextResponse.json({ error: "invalid_notification" }, { status: 400 });
    await db.update(userInbox).set({ readAt: new Date() })
      .where(and(eq(userInbox.id, body.id), eq(userInbox.userId, userId)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "inbox_update_failed" }, { status: 500 });
  }
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

  try {
    if (body?.clearAll) {
      await db.update(userInbox).set({ dismissedAt: new Date() })
        .where(and(eq(userInbox.userId, userId), isNull(userInbox.dismissedAt)));
      return NextResponse.json({ ok: true });
    }

    if (typeof body?.id !== "string") return NextResponse.json({ error: "invalid_notification" }, { status: 400 });
    await db.update(userInbox).set({ dismissedAt: new Date() })
      .where(and(eq(userInbox.id, body.id), eq(userInbox.userId, userId)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "inbox_delete_failed" }, { status: 500 });
  }
}
