import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { OpenIssueButton } from "@/components/errors/OpenIssueButton";
import { requireAdmin } from "@/lib/auth/server";
import { db, schema } from "@/lib/db";

export const metadata: Metadata = { title: "Error Monitor" };
export const dynamic = "force-dynamic";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  low: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  investigating: "Investigando",
  fixed: "Corrigido",
  validated: "Validado",
  reopened: "Reaberto",
};

export default async function AdminErrorsPage() {
  await requireAdmin();
  const { errorEvents } = schema;

  const rows = await db
    .select()
    .from(errorEvents)
    .orderBy(desc(errorEvents.lastSeen))
    .limit(100);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<AlertTriangle className="size-5" />}
        title="Monitor de Erros"
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nenhum erro capturado ainda. O sistema está ativo e monitorando.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-300">Severidade</th>
                <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-300">Mensagem</th>
                <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-300">Rota</th>
                <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-300">Ocorrências</th>
                <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-300">Última</th>
                <th className="px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-300">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((row) => {
                const sample = row.sample as Record<string, unknown>;
                const severityClass = SEVERITY_COLORS[row.severity] ?? SEVERITY_COLORS.low;
                return (
                  <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold uppercase ${severityClass}`}>
                        {row.severity}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                      {String(sample?.message ?? "Unknown")}
                    </td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {String(sample?.route ?? "—")}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {row.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                      {STATUS_LABELS[row.status] ?? row.status}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(row.lastSeen).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      {row.issueUrl ? (
                        <a
                          href={row.issueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-[#B9FF66] px-2.5 py-1 text-xs font-bold text-[#191A23] transition-opacity hover:opacity-90"
                        >
                          Ver Issue
                        </a>
                      ) : (
                        <OpenIssueButton fingerprint={row.fingerprint} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}