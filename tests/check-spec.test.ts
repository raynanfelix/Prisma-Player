import { describe, expect, it } from "vitest";

import { evaluateSpecGate, filterFeatureFiles } from "../scripts/check-spec.mjs";

/**
 * Gate anti-sprawl (docs/specs/ORGANIZACAO_ANTI_SPRAWL_SPEC.md, item 4):
 * warn impresso com arquivo novo de feature sem spec citada; silêncio com
 * spec citada ou sem arquivos novos de feature. O gate NUNCA falha o CI.
 */
describe("check-spec gate (warn, nunca bloqueia)", () => {
  it("warn: arquivo novo de feature sem spec citada no commit", () => {
    const result = evaluateSpecGate({
      newFiles: ["src/features/player/NewThing.tsx", "src/app/api/new-thing/route.ts"],
      commitMessage: "feat: nova coisa",
    });
    expect(result.warned).toBe(true);
    expect(result.message).toContain("WARN [anti-sprawl]");
    expect(result.message).toContain("src/features/player/NewThing.tsx");
    expect(result.message).toContain("src/app/api/new-thing/route.ts");
    expect(result.message).toContain("docs/specs/");
  });

  it("silêncio: spec citada na mensagem do commit", () => {
    const result = evaluateSpecGate({
      newFiles: ["src/features/player/NewThing.tsx"],
      commitMessage: "feat: player X (docs/specs/PIXEL_VERIFY_SPEC.md)",
    });
    expect(result.warned).toBe(false);
    expect(result.message).toBe("");
  });

  it("silêncio: sem arquivos novos de feature", () => {
    expect(evaluateSpecGate({ newFiles: [], commitMessage: "" })).toEqual({
      warned: false,
      message: "",
    });
    const onlyNonFeature = evaluateSpecGate({
      newFiles: ["docs/specs/NOVA_SPEC.md", "tests/x.test.ts", "eslint.config.mjs", "scripts/check-spec.mjs"],
      commitMessage: "",
    });
    expect(onlyNonFeature.warned).toBe(false);
    expect(onlyNonFeature.message).toBe("");
  });

  it("filtro: só src/features e src/app; test files e fora de src ficam de fora", () => {
    expect(filterFeatureFiles(["src/features/a/b.ts", "src/app/api/x/route.ts"])).toEqual([
      "src/features/a/b.ts",
      "src/app/api/x/route.ts",
    ]);
    expect(
      filterFeatureFiles(["src/features/a/b.test.ts", "src/app/api/x/route.test.ts", "src/lib/x.ts", "docs/x.md", ""])
    ).toEqual([]);
  });
});
