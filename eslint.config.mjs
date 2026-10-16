import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Teto de 350 linhas por arquivo (referência do toolkit) —
      // adoção progressiva: começa em warn e endurece após o burndown.
      "max-lines": ["warn", { max: 350 }],
    },
  },
]);

export default eslintConfig;
