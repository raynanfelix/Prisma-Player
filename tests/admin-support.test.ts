import { describe, expect, it } from "vitest";
import { validateCaseInput, validateNoteBody } from "@/lib/admin/support";

const USER = "11111111-1111-4111-8111-111111111111";

describe("suporte: validação", () => {
  it("aceita caso válido", () => {
    expect(validateCaseInput({ userId: USER, subject: "Cobrança duplicada", category: "cobranca", priority: "alta" })).toBeNull();
    expect(validateCaseInput({ subject: "Dúvida geral", category: "geral", priority: "normal" })).toBeNull();
  });

  it("rejeita assunto curto, categoria/prioridade e usuário inválidos", () => {
    expect(validateCaseInput({ subject: "oi", category: "geral", priority: "normal" })).toBe("invalid_subject");
    expect(validateCaseInput({ subject: "Assunto ok", category: "invalida", priority: "normal" })).toBe("invalid_category");
    expect(validateCaseInput({ subject: "Assunto ok", category: "geral", priority: "inexistente" })).toBe("invalid_priority");
    expect(validateCaseInput({ userId: "nao-uuid", subject: "Assunto ok", category: "geral", priority: "normal" })).toBe("invalid_user");
  });

  it("valida corpo da nota", () => {
    expect(validateNoteBody(" verre o extrato ")).toBeNull();
    expect(validateNoteBody("")).toBe("invalid_note");
    expect(validateNoteBody("x".repeat(2001))).toBe("invalid_note");
  });
});
