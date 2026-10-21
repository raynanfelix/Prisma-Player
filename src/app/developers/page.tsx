import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/features/landing-page/components/Nav";
import Footer from "@/features/landing-page/components/Footer";

export const metadata: Metadata = {
  title: "Recursos para Desenvolvedores e Agentes | Prisma Player",
  description:
    "Endpoints públicos, formato de embed, llms.txt, openapi.json e negociação Markdown do Prisma Player - referência para desenvolvedores e agentes de IA.",
  alternates: { canonical: "/developers" },
};

const ENDPOINTS: Array<{ method: string; path: string; description: string }> = [
  { method: "GET", path: "/api/health", description: "Liveness da plataforma ({\"ok\":true}), sem consulta ao banco." },
  {
    method: "GET",
    path: "/api/embed/{id}",
    description: "Configuração dinâmica do player publicado. Exige o contexto de origem do embed (token de origem + cookie de render) - não é API de chave pública.",
  },
  { method: "GET", path: "/api/embed/{id}/manifest", description: "Manifest de reprodução com fontes de vídeo assinadas e de curta duração." },
  { method: "POST", path: "/api/embed/{id}/session", description: "Mint do token de sessão do DRM (token assinado por sessão)." },
  { method: "POST", path: "/api/ab-events", description: "Eventos de teste A/B enviados pelo player no embed (origem validada)." },
  { method: "GET", path: "/llms.txt", description: "Índice do site para agentes de IA (formato llms.txt)." },
  { method: "GET", path: "/api/markdown?path=/pricing", description: "Versão Markdown das páginas públicas (também via Accept: text/markdown no proxy)." },
  { method: "GET", path: "/api/openapi.json", description: "Especificação OpenAPI 3.1 completa da superfície pública." },
];

/**
 * Página /developers (item 4 do relatório "Is Agentic" / Ora): âncora de
 * descobribilidade para desenvolvedores e agentes. Mesma linguagem visual das
 * páginas públicas (Nav/Footer do design system Positivus, cards com sombra
 * dura, verde-lima como ação e tinta #191A23 como texto).
 */
export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-white text-[#191A23] font-sans antialiased selection:bg-[#B9FF66] selection:text-[#191A23]">
      <Nav />

      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <header className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-xl border border-[#191A23]/10 bg-[#B9FF66] px-4 py-1.5 text-xs font-black uppercase text-[#191A23] shadow-[3px_3px_0px_#191A23]">
            Desenvolvedores & Agentes de IA
          </div>
          <h1 className="text-4xl font-black tracking-tight leading-tight sm:text-6xl">
            Prisma Player - Recursos para desenvolvedores e agentes
          </h1>
          <p className="max-w-2xl text-base font-medium leading-relaxed text-[#191A23]/80 sm:text-lg">
            Tudo o que você precisa para integrar o player, ler o site de forma
            automatizada e descobrir a API pública: endpoints, formato do embed,
            documentos para agentes e canais de suporte.
          </p>
        </header>

        {/* Endpoints públicos */}
        <section className="mt-14 rounded-[45px] border border-[#191A23]/10 bg-white p-6 shadow-[6px_6px_0px_#191A23] sm:p-10">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Endpoints públicos</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-[#191A23]/80 sm:text-base">
            A lista abaixo é a superfície pública completa. Toda a API de conta,
            vídeos, billing e analytics internos exige sessão autenticada e
            responde 401 fora dela. A especificação viva está em{" "}
            <a href="/api/openapi.json" className="font-bold underline underline-offset-4 hover:opacity-70">
              /api/openapi.json
            </a>
            .
          </p>
          <ul className="mt-6 space-y-3 border-t border-[#191A23]/15 pt-6">
            {ENDPOINTS.map((endpoint) => (
              <li key={endpoint.path} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <code className="shrink-0 rounded-lg bg-[#B9FF66]/35 px-2.5 py-1 text-xs font-bold">
                  {endpoint.method} {endpoint.path}
                </code>
                <span className="text-sm font-medium leading-relaxed text-[#191A23]/80">{endpoint.description}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Formato do embed */}
        <section className="mt-8 rounded-[45px] border border-[#191A23]/10 bg-[#B9FF66] p-6 shadow-[6px_6px_0px_#191A23] sm:p-10">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Formato do embed</h2>
          <p className="mt-3 text-sm font-bold leading-relaxed text-[#191A23]/80 sm:text-base">
            O player é publicado com um código de 1 linha gerado no painel
            (dashboard), composto por uma tag <code className="font-mono">{"<script>"}</code> do
            Prisma Player e um elemento de destino com o id do player. Basta
            colar no WordPress, Elementor, Webflow, GreatPages, Klickpages ou
            qualquer construtor - o embed carrega responsivo, com Pitch Delay,
            teste A/B e pixels configurados no painel. Documentação de request
            dos endpoints de embed no openapi.json.
          </p>
        </section>

        {/* Documentos para agentes */}
        <section className="mt-8 rounded-[45px] border border-[#191A23]/10 bg-[#191A23] p-6 text-white shadow-[6px_6px_0px_#B9FF66] sm:p-10">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Documentos para agentes de IA</h2>
          <ul className="mt-6 space-y-3 text-sm font-medium leading-relaxed text-white/85 sm:text-base">
            <li>
              <a href="/llms.txt" className="font-bold text-[#B9FF66] underline underline-offset-4 hover:opacity-80">
                /llms.txt
              </a>{" "}
              - descrição do produto, quando usar (e quando não usar) e links principais.
            </li>
            <li>
              <a href="/sitemap.xml" className="font-bold text-[#B9FF66] underline underline-offset-4 hover:opacity-80">
                /sitemap.xml
              </a>{" "}
              - mapa de páginas publicadas.
            </li>
            <li>
              <a href="/api/openapi.json" className="font-bold text-[#B9FF66] underline underline-offset-4 hover:opacity-80">
                /api/openapi.json
              </a>{" "}
              - OpenAPI 3.1 da API pública.
            </li>
            <li>
              Negociação Markdown: qualquer agente que envie o header{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-[#B9FF66]">Accept: text/markdown</code>{" "}
              recebe as páginas públicas em Markdown automaticamente (ex.:{" "}
              {/* Link (e não <a>) porque o endpoint /api/markdown é rota do
                  app: o eslint-plugin-next exige Link para caminhos internos e
                  prefetch={false} evita pré-busca de API no hover. */}
              <Link prefetch={false} href="/api/markdown?path=/" className="font-bold text-[#B9FF66] underline underline-offset-4 hover:opacity-80">
                /api/markdown?path=/
              </Link>
              ).
            </li>
          </ul>
        </section>

        {/* Contato */}
        <section className="mt-8 rounded-[45px] border border-[#191A23]/10 bg-white p-6 shadow-[6px_6px_0px_#191A23] sm:p-10">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Falar com a equipe</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-[#191A23]/80 sm:text-base">
            Integrações, migração de outros players, parcerias ou dúvidas sobre
            a API: fale com a gente pela{" "}
            <Link href="/contact" className="font-bold underline underline-offset-4 hover:opacity-70">
              página de contato (/contact)
            </Link>
            . Contas ativas também têm suporte pelo painel, com WhatsApp nos
            planos Pro e Escala.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
