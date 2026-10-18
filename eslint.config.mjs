import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Quality gates do Vibe Coding Toolkit (revisão f13bb354363dafef8ce8d8f605856cc9e1cc52cc,
// copiados byte a byte para eslint-rules/). Self-check: node scripts/verify-quality-rules.mjs
import quality from "./eslint-rules/index.cjs";

const testFiles = [
  "**/*{.,-}{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/{__tests__,__mocks__,fixtures,mocks}/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "tests/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
];

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
    // Skills vendorizadas e config de agentes — não são código da aplicação:
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".github/**",
    ".superpowers/**",
  ]),
  {
    // Quality gates (toolkit) — severidades medidas na base real:
    //   quality/max-lines:          legado > 0  → warn (linha de base anotada abaixo)
    //   quality/no-direct-console:  legado > 0  → warn (linha de base anotada abaixo)
    //   quality/no-direct-data-access: 1 violação → warn (linha de base anotada abaixo)
    // Promover cada regra a "error" quando a própria contagem chegar a zero.
    files: ["src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    plugins: { quality },
    rules: {
      // Teto de 350 linhas por arquivo (referência do toolkit) — exime
      // testes, barrels de reexportação e módulos só de tipos por AST.
      // Linha de base (17/10/2026): N arquivos de produção acima do teto.
      "quality/max-lines": ["warn", { max: 350 }],
      // Consoles diretos em código de produção → usar o adaptador safeLog.
      // Linha de base (17/10/2026): 40 ocorrências em 28 arquivos.
      "quality/no-direct-console": [
        "warn",
        { logger: "safeLog() de '@/lib/utils/log'" },
      ],
      // Camadas de apresentação (src/components, src/features) não importam
      // o client `db`; rotas/páginas em src/app usam db por design (guard).
      // Linha de base (17/10/2026): 1 violação (Nav.tsx).
      "quality/no-direct-data-access": [
        "warn",
        {
          modules: ["@/lib/db", "@/lib/db/index"],
          bindings: ["db"],
          layers: ["/src/components/", "/src/features/"],
        },
      ],
    },
  },
  {
    // O adaptador de log É o wrapper de console — eximido depois do bloco
    // que liga a regra (flat config aplica o bloco posterior por último).
    files: ["src/lib/utils/log.ts"],
    plugins: { quality },
    rules: {
      "quality/no-direct-console": "off",
    },
  },
  {
    // Mesmo orçamento para testes, em warn — vem depois do bloco src/** pelo
    // mesmo motivo de ordem; includeTests traz de volta arquivos .test/.spec
    // e a pasta tests/ (regra base exime testes por padrão).
    files: testFiles,
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
    },
  },
  {
    // As próprias regras locais usam require() CommonJS de propósito
    // (carregam sem build step) — fora do escopo TS.
    files: ["eslint-rules/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
