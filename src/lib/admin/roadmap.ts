/**
 * Roadmap admin: helpers puros de validação (testáveis sem banco).
 * Espelha o padrão de src/lib/admin/support.ts.
 */

export const ROADMAP_STAGES = ["backlog", "faremos", "preparando", "pronto"] as const;

export type RoadmapStage = (typeof ROADMAP_STAGES)[number];

export const ROADMAP_STAGE_LABELS: Record<RoadmapStage, string> = {
  backlog: "Backlog",
  faremos: "Faremos",
  preparando: "Estamos preparando",
  pronto: "Pronto",
};

export type RoadmapTaskInput = {
  title: string;
  description: string | null;
  requesterName: string | null;
  stage: RoadmapStage;
};

const TITLE_MIN = 3;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const REQUESTER_MAX = 80;

export function isRoadmapStage(value: unknown): value is RoadmapStage {
  return typeof value === "string" && (ROADMAP_STAGES as readonly string[]).includes(value);
}

/** Valida o payload de criação. Retorna o código de erro ou null se válido. */
export function validateRoadmapTask(input: {
  title: unknown;
  description: unknown;
  requesterName: unknown;
  stage: unknown;
}): string | null {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) return "invalid_title";
  const description = input.description == null ? null : String(input.description).trim();
  if (description !== null && description.length > DESCRIPTION_MAX) return "invalid_description";
  const requesterName = input.requesterName == null ? null : String(input.requesterName).trim();
  if (requesterName !== null && requesterName.length > REQUESTER_MAX) return "invalid_requester";
  if (!isRoadmapStage(input.stage)) return "invalid_stage";
  return null;
}

/** Valida o payload de movimentação/edição (ao menos um campo presente). */
export function validateRoadmapPatch(input: {
  stage?: unknown;
  title?: unknown;
  description?: unknown;
  requesterName?: unknown;
}): { error: string | null; hasChanges: boolean } {
  const hasStage = input.stage !== undefined;
  const hasTitle = input.title !== undefined;
  const hasDescription = input.description !== undefined;
  const hasRequester = input.requesterName !== undefined;
  const hasChanges = hasStage || hasTitle || hasDescription || hasRequester;
  if (!hasChanges) return { error: "empty_patch", hasChanges: false };
  if (hasStage && !isRoadmapStage(input.stage)) return { error: "invalid_stage", hasChanges: true };
  if (hasTitle) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) return { error: "invalid_title", hasChanges: true };
  }
  if (hasDescription) {
    const description = input.description == null ? null : String(input.description).trim();
    if (description !== null && description.length > DESCRIPTION_MAX) return { error: "invalid_description", hasChanges: true };
  }
  if (hasRequester) {
    const requesterName = input.requesterName == null ? null : String(input.requesterName).trim();
    if (requesterName !== null && requesterName.length > REQUESTER_MAX) return { error: "invalid_requester", hasChanges: true };
  }
  return { error: null, hasChanges: true };
}

/** Normaliza strings para persistência (trim + colapsa espaços do título). */
export function normalizeRoadmapText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
