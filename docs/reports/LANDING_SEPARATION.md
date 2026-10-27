# Manifesto da Separação da Landing — prismaplayer.online (2026-10-27)

O site de marketing passa a viver em **repositório próprio**. Repositório
gerado em `C:\Users\rayna\Downloads\prismaplayer-landing\` (40 arquivos,
closure de imports validado — zero referências a `@/lib/db`, `@/lib/auth`
ou `@/lib/access` do app).

## Arquivos que MIGRAM para o repositório da landing

**Páginas públicas (9)** — `src/app/`:
`page.tsx` (home) · `pricing/page.tsx` · `services/page.tsx` ·
`about/page.tsx` · `contact/page.tsx` · `developers/page.tsx` ·
`privacy/page.tsx` · `terms/page.tsx` · `cookies/page.tsx`

**Componentes de landing (18)** — `src/features/landing-page/components/`:
PositivusLanding, PositivusPricing, PricingSection, ServicesPage,
ServicesGrid, AboutPage, ContactForm, CaseStudies, Testimonials,
WorkingProcess, TeamSupport, LogosBar, CtaProposal, Hero, Nav,
Footer, LegalPageLayout

**Componentes de marketing (2)** — `src/features/marketing/components/`:
Nav.tsx, Footer.tsx

**Conteúdo**: `src/content/legal/prisma-legal.ts`, `src/content/contact.ts`

**SEO**: `public/llms.txt`, `public/llms-full.txt`, `src/app/sitemap.ts`,
`src/app/robots.ts`, `src/app/opengraph-image.tsx`

**Dependências do closure**: next, react, react-dom, lucide-react,
tailwindcss, tw-animate-css, shadcn, clsx, tailwind-merge

## Desacoplamentos aplicados na cópia (o app mantém os originais por ora)

No domínio de marketing não há sessão (cookies vivem no host do app), então
a personalização por usuário era código morto:

- `page.tsx`, `about`, `services`, `pricing` → `account={null}` estático
- `marketing/Nav.tsx` → sempre "Entrar" + "Criar conta grátis"
- Links de app (`/login`, `/signup`, `/dashboard`, `/welcome`) → absolutos
  para `https://app.prismaplayer.online` (via `src/lib/site.ts` no landing)
- Links de API em `developers/page.tsx` (`/api/openapi.json`,
  `/api/markdown`) → absolutos para o app
- `robots.ts` da landing simplificado (tudo público; sem disallow de rotas
  que não existem naquele domínio)
- Fallbacks `prisma-player.vercel.app` → `https://prismaplayer.online`

## FASE 2 — depois que o repositório da landing estiver no ar

1. Criar o projeto Vercel da landing e **mover** o domínio
   `prismaplayer.online` do projeto `prisma-player` para ele
   (`vercel domains add prismaplayer.online prisma-player-landing`).
2. No app: apagar as 9 páginas públicas + `features/landing-page` +
   `features/marketing` + `content/legal` + `content/contact` +
   `public/llms*.txt` (o app mantém `src/app/llms.txt/route.ts` — a versão
   de API/produto).
3. No app: a raiz `/` vira redirect 301 para `https://prismaplayer.online`
   (middleware `src/proxy.ts`).
4. Sitemap/robots do app passam a listar só URLs de app; o da landing lista
   as de marketing (já gerados separados).
5. Corrigir no app: `src/app/page.tsx` imports mortos após apagar a landing.

## Conflito detectado e resolvido no app (pendência menor)

O app tinha **duas superfícies de llms.txt**: `public/llms.txt` (estático,
marketing — migrou para a landing) e `src/app/llms.txt/route.ts` (dinâmico,
API/produto — fica no app). Após a fase 2, o conflito desaparece. Enquanto
a landing não existe, o estático em `public/` tem precedência na rota
`/llms.txt` — verificar qual conteúdo é o desejado até lá.
