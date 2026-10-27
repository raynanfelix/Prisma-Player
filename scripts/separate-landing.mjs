// Script one-shot de separação da landing page (domínio prismaplayer.online).
// Gera C:\Users\rayna\Downloads\prismaplayer-landing com o closure de imports
// das 9 páginas públicas de marketing + layout, desacoplado do app:
// - páginas com personalização por sessão viram versões estáticas (account=null)
// - links de app (/login, /signup, /dashboard) viram absolutos para app.prismaplayer.online
// - package.json com as dependências realmente usadas pelo closure
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

const APP = process.cwd();
const OUT = resolve(APP, "..", "prismaplayer-landing");
if (existsSync(OUT)) {
  console.error("ABORT: " + OUT + " já existe — apague antes de reexecutar.");
  process.exit(1);
}

const APP_URL = "https://app.prismaplayer.online";
const MARKETING_URL = "https://prismaplayer.online";

// ---- Versões DESACOPLADAS (sem auth/db) das fontes acopladas ----
function marketingPage(component, meta) {
  return `import type { Metadata } from "next";
import ${component.import} from "${component.from}";

export const metadata: Metadata = {
  title: ${JSON.stringify(meta.title)},
  description: ${JSON.stringify(meta.description)},
  alternates: { canonical: ${JSON.stringify(meta.canonical)} },
};

export default function Page() {
  // Landing standalone (domínio de marketing): sem sessão - cookies de
  // sessão vivem no host app.prismaplayer.online. CTAs apontam para o app.
  return <${component.name} account={null} />;
}
`;
}

const VIRTUAL = new Map([
  ["src/app/page.tsx", marketingPage(
    { import: "PositivusLanding", from: "@/features/landing-page/components/PositivusLanding", name: "PositivusLanding" },
    {
      title: "Player de VSL com Pitch Delay e Analytics de Retenção | Prisma Player",
      description: "Aumente conversões da sua VSL com Pitch Delay sincronizado ao segundo, analytics de retenção segundo a segundo, testes A/B nativos e proteção DRM anti-pirataria. Player feito para vender.",
      canonical: "/",
    },
  )],
  ["src/app/about/page.tsx", marketingPage(
    { import: "AboutPage", from: "@/features/landing-page/components/AboutPage", name: "AboutPage" },
    {
      title: "Sobre Nós | Prisma Player - O Player de VSL Mais Rápido",
      description: "Conheça a história, o manifesto e os valores da Prisma Player. A tecnologia líder em retenção e inteligência para VSLs no Brasil.",
      canonical: "/about",
    },
  )],
  ["src/app/services/page.tsx", marketingPage(
    { import: "ServicesPage", from: "@/features/landing-page/components/ServicesPage", name: "ServicesPage" },
    {
      title: "Recursos & Serviços | Prisma Player - Tecnologia de Alta Conversão",
      description: "Conheça em detalhes o Pitch Delay Inteligente, Turbo CDN, Escudo DRM Anti-Pirataria, Smart Autoplay e Analytics de Retenção do Prisma Player.",
      canonical: "/services",
    },
  )],
  ["src/app/pricing/page.tsx", marketingPage(
    { import: "PositivusPricing", from: "@/features/landing-page/components/PositivusPricing", name: "PositivusPricing" },
    {
      title: "Planos e Preços | Prisma Player",
      description: "Compare os planos Prisma Player e escolha o plano ideal para sua operação de VSL. Cobrança mensal ou anual com economia para quem antecipa. Plays adicionais: R$ 0,02.",
      canonical: "/pricing",
    },
  )],
  ["src/features/marketing/components/Nav.tsx", `import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { APP_URL } from "@/lib/site";

export default function Nav() {
  // Landing standalone: sem sessão no domínio de marketing. CTAs sempre
  // apontam para o app (app.prismaplayer.online).
  return <nav className="fixed inset-x-0 top-0 z-50 h-11 bg-surface-black"><div className="container-section mx-auto flex h-full max-w-[1440px] items-center justify-between px-5"><div className="flex items-center gap-6"><Link href="/" className="flex shrink-0 items-center" aria-label="Prisma Player"><BrandLogo className="h-[26px] w-[132px]" priority darkSurface /></Link><div className="hidden items-center gap-5 md:flex">{[["Funcionalidades", "/#features"], ["Planos", "/pricing"], ["Parcerias", "#"], ["Ajuda", "#"]].map(([label, href]) => <a key={label} href={href} className="text-xs tracking-[-0.12px] text-white/80 transition-colors hover:text-white">{label}</a>)}</div></div><div className="flex items-center gap-1.5"><ThemeToggle onDarkSurface /><Link href={APP_URL + "/login"} className="hidden text-xs text-white/80 hover:text-white sm:block">Entrar</Link><Link href={APP_URL + "/signup"} className="rounded-sm bg-prisma-blue px-3.5 py-2 text-xs text-white transition-all hover:opacity-90 active:scale-95">Criar conta grátis</Link></div></div></nav>;
}
`],
]);

const ENTRIES = [
  "src/app/page.tsx",
  "src/app/about/page.tsx",
  "src/app/services/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/developers/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/cookies/page.tsx",
  "src/app/layout.tsx",
  "src/app/globals.css",
  "src/app/robots.ts",
  "src/app/sitemap.ts",
  "src/app/opengraph-image.tsx",
];

const seen = new Set();
const bare = new Set();
const appOnly = [];

function resolveSpec(spec, fromAbs) {
  let base;
  if (spec.startsWith("@/")) base = join(APP, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromAbs), spec);
  else return null;
  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".css",
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const APP_ONLY_RE = /[\\/](lib[\\/](db|auth|access)[\\/]|lib[\\/]db\.[jt]s|lib[\\/]auth\.[jt]s|access[\\/]bootstrap)/;

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function walk(absFile, virtualContent) {
  const rel = relative(APP, absFile).split("\\").join("/");
  if (seen.has(rel)) return;
  seen.add(rel);
  const text = virtualContent ?? readFileSync(absFile, "utf8");
  mkdirSync(join(OUT, dirname(rel)), { recursive: true });
  writeFileSync(join(OUT, rel), text);
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("@/")) {
      const target = resolveSpec(spec, absFile);
      if (target) {
        if (APP_ONLY_RE.test(target)) appOnly.push(`${rel}  ->  ${spec}`);
        walk(target);
      }
    } else {
      const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (!["react", "react-dom", "next"].includes(pkg)) bare.add(pkg);
    }
  }
}

for (const entry of ENTRIES) {
  const abs = join(APP, entry);
  if (!existsSync(abs)) {
    console.error("AVISO: entrada inexistente: " + entry);
    continue;
  }
  walk(abs, VIRTUAL.get(entry) ?? null);
}

// ---- Pós-processamento dos arquivos copiados ----
const SITE_FALLBACK = /https:\/\/prisma-player\.vercel\.app/g;
const APP_LINK = /(href=")(\/(?:login|signup|welcome|dashboard)[^"]*)"/g;

for (const rel of seen) {
  if (!/\.(tsx?|css)$/.test(rel)) continue;
  const abs = join(OUT, rel);
  let text = readFileSync(abs, "utf8");
  let changed = false;
  if (SITE_FALLBACK.test(text)) { text = text.replace(SITE_FALLBACK, MARKETING_URL); changed = true; }
  if (APP_LINK.test(text)) { text = text.replace(APP_LINK, `$1${APP_URL}$2`); changed = true; }
  if (changed) writeFileSync(abs, text);
}

// ---- Módulo compartilhado de URL do app (usado pelo Nav da landing) ----
mkdirSync(join(OUT, "src/lib"), { recursive: true });
writeFileSync(join(OUT, "src/lib/site.ts"), `/**
 * URLs dos dois domínios do produto (arquitetura de 2 repos):
 * - prismaplayer.online (ESTE repo): landing/marketing
 * - app.prismaplayer.online (repo do app): aplicação/dashboard/API
 */
export const APP_URL = "${APP_URL}";
export const MARKETING_URL = "${MARKETING_URL}";
`);

// ---- package.json com as dependências do closure ----
const appPkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8"));
const dependencies = { next: appPkg.dependencies.next, react: appPkg.dependencies.react, "react-dom": appPkg.dependencies["react-dom"] };
for (const pkg of bare) {
  const version = appPkg.dependencies[pkg] ?? appPkg.devDependencies?.[pkg];
  if (version) dependencies[pkg] = version;
  else console.error("AVISO: dependência não encontrada no app: " + pkg);
}
const devDependencies = {};
for (const pkg of ["typescript", "@types/node", "@types/react", "@types/react-dom", "tailwindcss", "@tailwindcss/postcss", "eslint", "eslint-config-next"]) {
  const version = appPkg.devDependencies?.[pkg] ?? appPkg.dependencies?.[pkg];
  if (version) devDependencies[pkg] = version;
}
const landingPkg = {
  name: "prismaplayer-landing",
  version: "0.1.0",
  private: true,
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start",
    lint: "eslint .",
    typecheck: "tsc --noEmit",
  },
  dependencies,
  devDependencies,
};
writeFileSync(join(OUT, "package.json"), JSON.stringify(landingPkg, null, 2) + "\n");

// ---- Configs ----
for (const f of ["tsconfig.json", "postcss.config.mjs", "components.json", "eslint.config.mjs"]) {
  const src = join(APP, f);
  if (existsSync(src)) writeFileSync(join(OUT, f), readFileSync(src, "utf8"));
}
writeFileSync(join(OUT, "next.config.ts"), `import type { NextConfig } from "next";

// Landing standalone (prismaplayer.online): sem headers de embed, sem
// rewrites de analytics - o app (app.prismaplayer.online) é que os tem.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
`);
writeFileSync(join(OUT, ".gitignore"), `node_modules/
.next/
out/
.env*
!.env.example
*.tsbuildinfo
.DS_Store
`);

// ---- public/ (SEO de marketing) ----
for (const f of ["llms.txt", "llms-full.txt", "favicon.ico"]) {
  const src = join(APP, "public", f);
  if (existsSync(src)) {
    mkdirSync(join(OUT, "public"), { recursive: true });
    writeFileSync(join(OUT, "public", f), readFileSync(src));
  }
}

console.log("Landing gerada em: " + OUT);
console.log("Arquivos copiados: " + seen.size);
console.log("Dependências: " + Object.keys(dependencies).join(", "));
console.log(appOnly.length ? "\nREFERÊNCIAS APP-ONLY RESTANTES (desacoplar quando o repo for ativo):" : "\nClosure 100% limpo: nenhuma referência a db/auth/access do app.");
for (const line of appOnly) console.log("  " + line);
