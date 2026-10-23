#!/usr/bin/env node
/**
 * scripts/check-spec.mjs — gate anti-sprawl (WARN; nunca exit != 0).
 *
 * Especificação: docs/specs/ORGANIZACAO_ANTI_SPRAWL_SPEC.md (item 4) e a
 * regra "ARQUIVO NOVO DE FEATURE EXIGE SPEC" de AGENTS.md.
 *
 * Lista arquivos novos via `git diff --name-only --diff-filter=A` contra a
 * merge-base com main quando existir (na falta, o commit pai; na falta
 * disso, os untracked do `git status --porcelain`), filtra
 * src/features|src/app (tests, docs e configs ficam de fora) e, se houver
 * arquivo novo sem "spec" na mensagem do commit (env COMMIT_MSG ou argv[2]),
 * imprime WARN com os arquivos e a regra. Exit 0 SEMPRE — inclusive se o git
 * falhar ou não existir.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const SPEC_RULE =
  "ARQUIVO NOVO DE FEATURE EXIGE SPEC: todo componente, rota ou módulo novo " +
  "nasce de uma spec em docs/specs/ referenciada na mensagem do commit " +
  "(AGENTS.md; pattern spec → implementação → validação).";

/** Arquivos de feature: src/features/** e src/app/**, sem testes.
 * @param {string[]} files
 * @returns {string[]}
 */
export function filterFeatureFiles(files) {
  return files.filter((file) => {
    if (!file) return false;
    if (!file.startsWith("src/features/") && !file.startsWith("src/app/")) {
      return false;
    }
    const base = file.slice(file.lastIndexOf("/") + 1);
    return !/\.(test|spec)\.[cm]?[jt]sx?$/i.test(base);
  });
}

/** Núcleo puro (testável): decide o WARN a partir dos arquivos e da mensagem.
 * @param {{ newFiles?: string[], commitMessage?: string }} input
 * @returns {{ warned: boolean, message: string }}
 */
export function evaluateSpecGate({ newFiles = [], commitMessage = "" } = {}) {
  const featureFiles = filterFeatureFiles(newFiles);
  if (featureFiles.length === 0) return { warned: false, message: "" };
  if (/spec/i.test(commitMessage)) return { warned: false, message: "" };
  const lines = [
    "WARN [anti-sprawl] arquivo novo de feature sem spec citada no commit:",
    ...featureFiles.map((file) => `  - ${file}`),
    `Regra: ${SPEC_RULE}`,
    "Corrija movendo a decisão para docs/specs/ e citando o caminho da spec na mensagem do commit.",
    "Gate informativo: exit 0, nunca bloqueia o CI.",
  ];
  return { warned: true, message: lines.join("\n") };
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function toLines(output) {
  return (output ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Arquivos novos detectáveis no ambiente atual (merge-base, pai ou untracked).
 * @returns {string[]}
 */
export function listNewFiles() {
  const head = runGit(["rev-parse", "HEAD"]);
  if (head) {
    for (const mainRef of ["refs/heads/main", "refs/remotes/origin/main"]) {
      const base = runGit(["merge-base", "HEAD", mainRef]);
      if (base && base.trim() !== head.trim()) {
        return toLines(runGit(["diff", "--name-only", "--diff-filter=A", base.trim()]));
      }
    }
    // Push direto na main (merge-base == HEAD): compara contra o commit pai.
    const parent = runGit(["rev-parse", "--verify", "--quiet", "HEAD^"]);
    if (parent) {
      return toLines(runGit(["diff", "--name-only", "--diff-filter=A", "HEAD^"]));
    }
  }
  // Sem base comparável: arquivos untracked do status --porcelain.
  const status = runGit(["status", "--porcelain"]);
  return toLines(status)
    .filter((line) => line.startsWith("??"))
    .map((line) => line.replace(/^\?\?\s+/, "").replace(/\/$/, ""));
}

function main() {
  const commitMessage = process.env.COMMIT_MSG ?? process.argv[2] ?? "";
  const { message } = evaluateSpecGate({
    newFiles: listNewFiles(),
    commitMessage,
  });
  if (message) {
    console.log(message);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
