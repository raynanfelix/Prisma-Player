import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { KanbanSquare } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import Reveal from "@/components/motion/reveal";
import RoadmapBoard, { type RoadmapTask } from "@/components/dashboard/RoadmapBoard";
import { requireUser, getCurrentAdminUser } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";

export const metadata: Metadata = { title: "Roadmap" };

export const dynamic = "force-dynamic";

/**
 * Roadmap do produto: qualquer usuário autenticado vê e sugere tasks.
 * Só admins (role platform "admin") avançam as etapas (drag no board).
 */
export default async function DashboardRoadmapPage() {
  await requireUser("/dashboard/roadmap");
  const admin = await getCurrentAdminUser();
  const { roadmapTasks } = schema;

  const rows = await db.select().from(roadmapTasks).orderBy(desc(roadmapTasks.updatedAt)).limit(500);

  const tasks: RoadmapTask[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    requesterName: row.requesterName,
    stage: row.stage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <Reveal>
      <div className="flex flex-col gap-4">
        <PageHeader
          icon={<KanbanSquare className="size-5" />}
          title="Roadmap"
        />
        <p className="m-0 text-sm text-slate-500 dark:text-zinc-400">
          Sugira o que você quer que a equipe faça. Nossa equipe move cada pedido entre as etapas: Backlog, Faremos, Estamos preparando e Pronto.
        </p>
        <RoadmapBoard initialTasks={tasks} isAdmin={Boolean(admin)} />
      </div>
    </Reveal>
  );
}
