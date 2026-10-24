import { describe, expect, it } from "vitest";
import {
  ROADMAP_STAGES,
  isRoadmapStage,
  normalizeRoadmapText,
  validateRoadmapPatch,
  validateRoadmapTask,
} from "@/lib/roadmap";

describe("roadmap: validação de criação", () => {
  it("aceita task válida com defaults", () => {
    expect(
      validateRoadmapTask({ title: "Exportar métricas em CSV", description: null, requesterName: null, stage: "backlog" }),
    ).toBeNull();
  });

  it("aceita task completa em qualquer estágio", () => {
    for (const stage of ROADMAP_STAGES) {
      expect(
        validateRoadmapTask({ title: "Pedido do dono", description: "Detalhe do pedido", requesterName: "Equipe", stage }),
      ).toBeNull();
    }
  });

  it("rejeita título curto, vazio e longo", () => {
    expect(validateRoadmapTask({ title: "oi", description: null, requesterName: null, stage: "backlog" })).toBe("invalid_title");
    expect(validateRoadmapTask({ title: "   ", description: null, requesterName: null, stage: "backlog" })).toBe("invalid_title");
    expect(validateRoadmapTask({ title: "x".repeat(201), description: null, requesterName: null, stage: "backlog" })).toBe("invalid_title");
  });

  it("rejeita descrição e solicitante fora do limite", () => {
    expect(
      validateRoadmapTask({ title: "Válido", description: "x".repeat(2001), requesterName: null, stage: "faremos" }),
    ).toBe("invalid_description");
    expect(
      validateRoadmapTask({ title: "Válido", description: null, requesterName: "y".repeat(81), stage: "pronto" }),
    ).toBe("invalid_requester");
  });

  it("rejeita estágio fora do kanban", () => {
    expect(validateRoadmapTask({ title: "Válido", description: null, requesterName: null, stage: "cancelado" })).toBe("invalid_stage");
  });
});

describe("roadmap: validação de movimentação/edição", () => {
  it("rejeita patch vazio", () => {
    expect(validateRoadmapPatch({ stage: undefined, title: undefined, description: undefined, requesterName: undefined })).toEqual({
      error: "empty_patch",
      hasChanges: false,
    });
  });

  it("aceita mover entre os quatro estágios", () => {
    for (const stage of ROADMAP_STAGES) {
      expect(validateRoadmapPatch({ stage, title: undefined, description: undefined, requesterName: undefined })).toEqual({
        error: null,
        hasChanges: true,
      });
    }
  });

  it("rejeita estágio inválido na movimentação", () => {
    expect(validateRoadmapPatch({ stage: "arquivo", title: undefined, description: undefined, requesterName: undefined }).error).toBe("invalid_stage");
  });

  it("aceita editar título e limpar campos opcionais", () => {
    expect(validateRoadmapPatch({ stage: undefined, title: "Novo título", description: null, requesterName: null })).toEqual({
      error: null,
      hasChanges: true,
    });
  });

  it("rejeita título inválido na edição", () => {
    expect(validateRoadmapPatch({ stage: undefined, title: "ab", description: undefined, requesterName: undefined }).error).toBe("invalid_title");
  });
});

describe("roadmap: helpers", () => {
  it("isRoadmapStage reconhece os quatro estágios e nada além", () => {
    for (const stage of ROADMAP_STAGES) expect(isRoadmapStage(stage)).toBe(true);
    expect(isRoadmapStage("backlog ")).toBe(false);
    expect(isRoadmapStage(123)).toBe(false);
  });

  it("normalizeRoadmapText trima e colapsa espaços", () => {
    expect(normalizeRoadmapText("  Exportar   métricas  em  CSV ")).toBe("Exportar métricas em CSV");
  });
});
