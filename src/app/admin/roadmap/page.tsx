import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import RoadmapBoard, { type RoadmapTask } from "@/components/admin/RoadmapBoard";
import { AdminHeader } from "@/components/admin/AdminUi";

export const metadata: Metadata = {
  title: "Roadmap",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Roadmap kanban: o que os admins querem que os agentes façam, triado por estágio. */
export default async function AdminRoadmapPage() {
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
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <AdminHeader
        title="Roadmap"
        description="Kanban de tarefas e pedidos: arraste os cartões entre Backlog, Faremos, Estamos preparando e Pronto."
      />
      <RoadmapBoard initialTasks={tasks} />
    </div>
  );
}
