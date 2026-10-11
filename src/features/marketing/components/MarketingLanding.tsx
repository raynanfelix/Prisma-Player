"use client";

import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  CirclePlay,
  Clock3,
  Gauge,
  Globe2,
  Layers3,
  LockKeyhole,
  Menu,
  MousePointerClick,
  Play,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  TestTube2,
  TrendingUp,
  Video,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const features = [
  { icon: CirclePlay, eyebrow: "Play rate", title: "Smart Autoplay", text: "Crie o primeiro impulso. O vídeo começa silencioso, desperta curiosidade e reinicia do zero quando o lead decide ouvir.", result: "Mais pessoas apertando play" },
  { icon: Gauge, eyebrow: "Retenção", title: "Progresso Inteligente", text: "Uma curva de progresso desenhada para reduzir a sensação de duração e manter o lead na narrativa até a oferta.", result: "Menos abandono no meio da VSL" },
  { icon: TestTube2, eyebrow: "Experimentação", title: "Testes A/B que vão além do vídeo", text: "Compare VSLs, headlines, thumbnails, CTAs, autoplay e velocidade usando tráfego real e uma única embed.", result: "Decisões baseadas em conversão" },
  { icon: BarChart3, eyebrow: "Clareza", title: "Analytics que explica o porquê", text: "Retenção, mapa de atenção, funil completo, origem, criativo, dispositivo, país e navegador em uma leitura simples.", result: "Encontre exatamente onde a venda escapa" },
  { icon: Bot, eyebrow: "Prisma IA", title: "Seu analista de VSL sempre disponível", text: "Pergunte sobre os resultados. A Prisma IA cruza métricas, encontra padrões e transforma dados em hipóteses de melhoria priorizadas.", result: "Do gráfico para a próxima ação" },
  { icon: MousePointerClick, eyebrow: "Oferta", title: "CTA sincronizada com o pitch", text: "Faça o botão, o checkout ou qualquer seção aparecer no instante em que o lead já entendeu o valor da oferta.", result: "A oferta aparece na hora certa" },
  { icon: WandSparkles, eyebrow: "Recuperação", title: "ThumbSniper e Mini-Ganchos", text: "Recupere pausas e combata quedas de atenção com capas, mensagens e elementos sincronizados aos pontos críticos.", result: "Uma nova chance antes do abandono" },
  { icon: Clock3, eyebrow: "Continuidade", title: "Continuar assistindo", text: "Reconheça quem voltou e permita retomar exatamente do ponto salvo ou começar novamente, em qualquer dispositivo.", result: "Mais leads chegando ao pitch" },
  { icon: Target, eyebrow: "Audiência", title: "Pixels e Audience Sync", text: "Crie públicos pelo nível de retenção e envie eventos para Meta, Google, TikTok e outras plataformas de mídia.", result: "Remarketing com contexto real" },
  { icon: ShieldCheck, eyebrow: "Proteção", title: "Domínios, monitoramento e antifraude", text: "Controle onde a VSL roda, detecte tráfego suspeito e receba alertas quando uma embed sair do ar ou for alterada.", result: "Sua operação protegida 24 horas" },
  { icon: Layers3, eyebrow: "Operação", title: "Troque o vídeo sem trocar a embed", text: "Atualize a campanha, preserve a URL publicada e mantenha integrações, histórico e estrutura da página funcionando.", result: "Evolua sem quebrar a campanha" },
  { icon: Globe2, eyebrow: "Alcance", title: "Legendas e tradução automáticas", text: "Transforme a fala em legendas acessíveis e traduza sua mensagem para alcançar novos mercados com menos trabalho manual.", result: "Uma VSL pronta para mais públicos" },
];

const plans = [
  { name: "Prime", monthly: 97, description: "Para colocar sua primeira operação de VSL em movimento.", benefits: ["30 mil plays por mês", "200 GB em vídeos", "30 análises Prisma IA", "Acesso individual para o titular", "Todas as funções de personalização e conversão", "Analytics completo, proteção e testes A/B"] },
  { name: "Prime Growth", monthly: 197, description: "Para quem valida criativos e escala campanhas todos os dias.", benefits: ["100 mil plays por mês", "500 GB em vídeos", "150 análises Prisma IA", "Até 5 membros na equipe", "Relatórios automáticos", "Audience Sync para campanhas de remarketing", "Webhooks para integrar eventos", "Todas as funções do Prime"] , featured: true },
  { name: "Prime Scale", monthly: 397, description: "Para times e operações com alto volume de tráfego.", benefits: ["300 mil plays por mês", "1 TB em vídeos", "500 análises Prisma IA", "Até 15 membros na equipe", "Benchmark privado da própria operação", "Comparação global entre todas as VSLs", "Alertas inteligentes de queda na conversão", "Relatórios, Audience Sync e webhooks", "Todas as funções do Prime Growth"] },
];

const faqs = [
  ["Preciso instalar algum plugin?", "Não. Você personaliza o player, copia a embed e cola na sua página de vendas. A estrutura é responsiva e funciona nos principais construtores."],
  ["Posso testar antes de assinar?", "Sim. Toda conta nova pode ativar 14 dias grátis, sem cadastrar cartão."],
  ["O que muda entre os planos?", "Todos recebem o player e as funções essenciais de conversão. Growth adiciona colaboração e automações; Scale libera inteligência comparativa e alertas para operações maiores."],
  ["O que acontece se meus plays acabarem?", "Você pode comprar um pacote adicional ou usar o excedente sob demanda. A sua VSL não para no meio da campanha."],
  ["Consigo trocar um vídeo que já está no ar?", "Sim. Você pode substituir a VSL mantendo a mesma embed, sem editar novamente a página de vendas."],
  ["Meus vídeos ficam protegidos?", "A Prisma combina restrição por domínio, URLs temporárias, bloqueios de interface, monitoramento e detecção de comportamento suspeito."],
];

function ProductVisual({ label = "Espaço reservado para arte do produto", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`landing-art-slot ${compact ? "min-h-[300px]" : "min-h-[430px]"}`}>
      <div className="landing-art-grid" />
      <div className="relative z-10 flex max-w-[320px] flex-col items-center text-center">
        <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-blue-300"><Video size={25} /></div>
        <p className="text-sm font-semibold text-white/85">{label}</p>
        <p className="mt-2 text-xs leading-5 text-white/40">Substitua este bloco pela imagem final sem alterar a composição.</p>
      </div>
    </div>
  );
}

function StickyFeatures() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && setActive(Number((entry.target as HTMLElement).dataset.index))),
      { rootMargin: "-38% 0px -48%", threshold: 0.05 },
    );
    refs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const current = features[active];
  const Icon = current.icon;

  return (
    <section id="funcionalidades" className="bg-[#272729] text-white">
      <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 lg:px-16 lg:py-32">
        <div className="mb-20 max-w-3xl">
          <span className="landing-kicker text-[#2997ff]"><Sparkles size={14} /> Da atenção à conversão</span>
          <h2 className="landing-section-title mt-6">Uma VSL não precisa apenas rodar.<br />Ela precisa <span className="text-gradient-blue">evoluir.</span></h2>
          <p className="landing-section-copy mt-6 text-white/55">Cada recurso da Prisma atua em uma etapa da decisão: começar, continuar, acreditar e agir.</p>
        </div>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.84fr)_minmax(540px,1.16fr)] lg:gap-20">
          <div>
            {features.map((feature, index) => {
              const FeatureIcon = feature.icon;
              return (
                <article
                  key={feature.title}
                  ref={(node) => { refs.current[index] = node; }}
                  data-index={index}
                  className={`feature-scroll-step ${active === index ? "is-active" : ""}`}
                >
                  <div className="mb-6 flex items-center gap-3 text-sm text-[#2997ff]"><FeatureIcon size={18} /><span>{String(index + 1).padStart(2, "0")}</span><span className="h-px w-8 bg-[#2997ff]/40" /><span>{feature.eyebrow}</span></div>
                  <h3 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">{feature.title}</h3>
                  <p className="mt-5 max-w-xl text-base leading-7 text-white/55 md:text-lg">{feature.text}</p>
                  <p className="mt-6 flex items-center gap-2 text-sm font-semibold text-white/90"><TrendingUp size={16} className="text-emerald-400" />{feature.result}</p>
                  <div className="mt-8 lg:hidden"><ProductVisual label={`Arte: ${feature.title}`} compact /></div>
                </article>
              );
            })}
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-20 h-[calc(100vh-7rem)] max-h-[760px] min-h-[600px] overflow-hidden rounded-[18px] bg-[#2a2a2c] p-5">
              <div className="flex items-center justify-between px-2 pb-5 text-xs text-white/40"><span>Prisma Player · {current.eyebrow}</span><span>{active + 1} / {features.length}</span></div>
              <div className="relative h-[calc(100%-42px)] overflow-hidden rounded-[24px]">
                <ProductVisual label={`Arte: ${current.title}`} />
                <div className="absolute bottom-5 left-5 right-5 z-20 rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-xl">
                  <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-blue-500 text-white"><Icon size={19} /></span><div><p className="text-sm font-semibold">{current.title}</p><p className="mt-0.5 text-xs text-white/45">{current.result}</p></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [annual, setAnnual] = useState(false);
  const formatted = useMemo(() => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }), []);
  return (
    <section id="planos" className="landing-section bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <span className="landing-kicker justify-center text-blue-700"><Zap size={14} /> Comece pequeno. Escale sem trocar de ferramenta.</span>
          <h2 className="landing-section-title mt-6">Toda a tecnologia.<br />O plano acompanha seu volume.</h2>
          <p className="landing-section-copy mx-auto mt-6 text-slate-500">Todas as funcionalidades em todos os planos. Você escolhe apenas a capacidade ideal para a sua operação.</p>
          <div className="mx-auto mt-9 inline-flex rounded-full border border-slate-200 bg-white p-1.5 shadow-sm">
            <button onClick={() => setAnnual(false)} className={`pricing-toggle ${!annual ? "is-active" : ""}`}>Mensal</button>
            <button onClick={() => setAnnual(true)} className={`pricing-toggle ${annual ? "is-active" : ""}`}>Anual <span className={annual ? "text-emerald-200" : "text-emerald-600"}>−25%</span></button>
          </div>
        </div>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const monthlyEquivalent = plan.monthly * 0.75;
            const annualTotal = monthlyEquivalent * 12;
            return (
              <article key={plan.name} className={`pricing-card ${plan.featured ? "is-featured" : ""}`}>
                {plan.featured && <span className="absolute right-5 top-5 rounded-full bg-[#0066cc] px-3 py-1 text-[11px] font-semibold text-white">Mais escolhido</span>}
                <p className="text-lg font-semibold">{plan.name}</p>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-500">{plan.description}</p>
                <div className="mt-8 flex items-end gap-1"><span className="text-4xl font-semibold tracking-[-0.05em]">{formatted.format(annual ? monthlyEquivalent : plan.monthly)}</span><span className="pb-1.5 text-sm text-slate-400">/mês</span></div>
                {annual ? <p className="mt-2 text-xs text-slate-500">{formatted.format(annualTotal)} cobrados uma vez por ano</p> : <p className="mt-2 text-xs text-slate-500">Cobrança mensal. Cancele quando quiser.</p>}
                <Link href="/signup" className={`mt-8 flex h-12 items-center justify-center rounded-full text-sm font-semibold transition active:scale-[.98] ${plan.featured ? "bg-[#0066cc] text-white" : "border border-[#e0e0e0] bg-white text-[#0066cc]"}`}>Começar 14 dias grátis <ArrowRight className="ml-2" size={16} /></Link>
                <div className="my-7 h-px bg-slate-100" />
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Capacidade incluída</p>
                <ul className="space-y-3 text-sm">{plan.benefits.map((item) => <li key={item} className="flex gap-2.5"><Check size={17} className="shrink-0 text-[#0066cc]" />{item}</li>)}</ul>
              </article>
            );
          })}
        </div>
        <div className="mt-7 flex flex-col items-center justify-between gap-3 rounded-[18px] border border-[#e0e0e0] bg-white px-6 py-5 text-sm sm:flex-row"><p><strong>Precisou de mais tráfego?</strong> Use plays excedentes ou compre 10 mil plays por R$ 69.</p><Link href="/signup" className="font-semibold text-[#0066cc]">Criar minha conta <ArrowRight className="ml-1 inline" size={15} /></Link></div>
      </div>
    </section>
  );
}

function OrganicSectionTransition() {
  return <div className="organic-section-transition" aria-hidden="true"><svg viewBox="0 0 1600 150" preserveAspectRatio="none"><path className="organic-wave organic-wave-back" d="M0 72C193 36 342 47 520 67C727 91 829 104 1028 64C1227 23 1390 31 1600 60V150H0Z" /><path className="organic-wave organic-wave-front" d="M0 88C214 62 377 55 564 79C765 105 913 111 1109 75C1307 38 1434 51 1600 68V150H0Z" /></svg></div>;
}

export default function MarketingLanding({ account }: { account: { firstName: string } | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>(".landing-page main > section");
    sections.forEach((section) => section.classList.add("landing-reveal"));
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    }), { rootMargin: "0px 0px -12%", threshold: 0.08 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return (
    <div className="landing-page bg-white text-[#1d1d1f]">
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
        <nav className="mx-auto flex h-16 max-w-[1240px] items-center justify-between rounded-2xl border border-white/60 bg-white/80 px-4 shadow-[0_10px_40px_rgba(17,35,70,.08)] backdrop-blur-xl md:px-6">
          <Link href="/" className="relative h-8 w-[154px]" aria-label="Prisma Player"><Image src="/assets/logo.png" alt="Prisma Player" fill priority className="object-contain object-left" /></Link>
          <div className="hidden items-center gap-7 lg:flex">{[["Produto", "#produto"], ["Funcionalidades", "#funcionalidades"], ["Resultados", "#resultados"], ["Planos", "#planos"], ["Dúvidas", "#duvidas"]].map(([name, href]) => <a key={name} href={href} className="text-sm font-medium text-slate-600 transition hover:text-blue-600">{name}</a>)}</div>
          <div className="hidden items-center gap-2 sm:flex">{account ? <Link href="/dashboard/videos" className="rounded-full bg-[#0066cc] px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[.98]">{account.firstName} · Dashboard</Link> : <><Link href="/login" className="px-4 py-2 text-sm font-semibold text-[#333333]">Entrar</Link><Link href="/signup" className="rounded-full bg-[#0066cc] px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[.98]">Teste grátis</Link></>}</div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="grid size-10 place-items-center rounded-full bg-slate-100 lg:hidden" aria-label="Abrir menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </nav>
        {menuOpen && <div className="mx-auto mt-2 max-w-[1240px] rounded-2xl border border-slate-100 bg-white p-4 shadow-xl lg:hidden">{[["Produto", "#produto"], ["Funcionalidades", "#funcionalidades"], ["Resultados", "#resultados"], ["Planos", "#planos"], ["Dúvidas", "#duvidas"]].map(([name, href]) => <a key={name} href={href} onClick={() => setMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-medium hover:bg-slate-50">{name}</a>)}<div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">{account ? <Link href="/dashboard/videos" className="col-span-2 rounded-full bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white">{account.firstName} · Dashboard</Link> : <><Link href="/login" className="rounded-full border px-4 py-3 text-center text-sm font-semibold">Entrar</Link><Link href="/signup" className="rounded-full bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white">Teste grátis</Link></>}</div></div>}
      </header>

      <main>
        <section className="relative overflow-hidden pb-20 pt-36 md:pb-28 md:pt-44">
          <div className="landing-hero-orb left-[-12rem] top-20 bg-blue-300" /><div className="landing-hero-orb right-[-10rem] top-[-5rem] bg-violet-300" />
          <div className="relative z-10 mx-auto max-w-[1180px] px-5 text-center md:px-10">
            <div className="landing-pill mx-auto"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,.12)]" />14 dias grátis. Sem cartão.</div>
            <h1 className="landing-hero-title mx-auto mt-7 max-w-[1050px]">Sua VSL já fala.<br /><span className="text-gradient-blue">A Prisma faz ela vender.</span></h1>
            <p className="mx-auto mt-7 max-w-[720px] text-lg leading-8 text-slate-500 md:text-xl">O player de vendas que entende cada segundo da audiência, melhora a experiência e mostra o que fazer para converter mais.</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link href="/signup" className="landing-primary-cta">Começar teste grátis <ArrowRight size={17} /></Link><a href="#produto" className="landing-secondary-cta"><Play size={16} fill="currentColor" /> Ver a Prisma em ação</a></div>
            <p className="mt-5 text-xs text-slate-400">Configure em minutos · Cole uma única embed · Cancele quando quiser</p>
          </div>
          <div className="relative z-10 mx-auto mt-16 max-w-[1220px] px-4 md:mt-20 md:px-8">
            <div className="rounded-[18px] border border-[#e0e0e0] bg-white p-2 md:p-3"><div className="overflow-hidden rounded-[11px] bg-[#272729]"><div className="flex h-11 items-center border-b border-white/10 px-5"><span className="text-[11px] text-white/50">app.prismaplayer.com.br</span></div><ProductVisual label="Arte principal do dashboard / player" /></div></div>
          </div>
        </section>

        <section id="resultados" className="border-y border-slate-100 bg-[#fafbfe] py-10"><div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-y-8 px-5 md:grid-cols-4 md:px-10">{[["Uma embed", "para operar tudo"], ["Tempo real", "da impressão à compra"], ["12+", "pontos de otimização"], ["24/7", "monitoramento da VSL"]].map(([value, label]) => <div key={label} className="text-center"><p className="text-2xl font-semibold tracking-[-0.04em] md:text-3xl">{value}</p><p className="mt-1 text-xs text-slate-400 md:text-sm">{label}</p></div>)}</div></section>

        <section id="produto" className="landing-section overflow-hidden bg-white"><div className="mx-auto max-w-[1240px] px-5 md:px-10"><div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20"><div><span className="landing-kicker text-blue-700"><Target size={14} /> Uma operação, não apenas um player</span><h2 className="landing-section-title mt-6">Veja a jornada inteira.<br />Melhore o ponto certo.</h2><p className="landing-section-copy mt-6 text-slate-500">A Prisma conecta vídeo, comportamento, mídia e conversão. Você deixa de olhar métricas isoladas e passa a enxergar a decisão do lead por inteiro.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{[["Impressão → Play", CirclePlay], ["Play → Pitch", Gauge], ["Pitch → CTA", MousePointerClick], ["CTA → Compra", TrendingUp]].map(([label, ItemIcon]) => <div key={label as string} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-white text-blue-600 shadow-sm"><ItemIcon size={17} /></span>{label as string}</div>)}</div></div><ProductVisual label="Arte do funil e analytics Prisma" compact /></div></div></section>

        <StickyFeatures />
        <OrganicSectionTransition />

        <section className="landing-section bg-white"><div className="mx-auto max-w-[1240px] px-5 md:px-10"><div className="grid gap-5 md:grid-cols-12"><article className="landing-bento bg-[#eaf2ff] md:col-span-7"><span className="landing-kicker text-blue-700"><Bot size={14} /> Prisma IA</span><h2 className="mt-6 max-w-xl text-3xl font-semibold tracking-[-0.045em] md:text-5xl">Pergunte aos seus dados.<br />Receba uma próxima ação.</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Sem relatório genérico. A IA interpreta a sua retenção, seu tráfego e seu funil dentro do contexto da sua própria operação.</p><div className="mt-10"><ProductVisual label="Arte do chat Prisma IA" compact /></div></article><article className="landing-bento bg-[#10131b] text-white md:col-span-5"><span className="landing-kicker text-emerald-300"><ShieldCheck size={14} /> Operação saudável</span><h3 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Se a página parar, você descobre antes da campanha.</h3><p className="mt-5 text-base leading-7 text-white/50">Monitoramento da embed, alertas de indisponibilidade e checagem periódica da página de vendas.</p><div className="mt-10 space-y-3">{["Embed respondendo", "Domínio autorizado", "Eventos chegando", "Player carregando rápido"].map((item, i) => <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm"><span>{item}</span><span className={`size-2 rounded-full ${i < 3 ? "bg-emerald-400" : "bg-amber-300"}`} /></div>)}</div></article><article className="landing-bento bg-[#f4f5f8] md:col-span-5"><span className="landing-kicker text-violet-700"><LockKeyhole size={14} /> Segurança</span><h3 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Sua VSL no lugar certo. Para a pessoa certa.</h3><p className="mt-5 text-base leading-7 text-slate-500">Domínios permitidos, links temporários e sinais de fraude protegem a operação sem criar atrito para o lead.</p></article><article className="landing-bento bg-gradient-to-br from-blue-600 to-blue-800 text-white md:col-span-7"><span className="landing-kicker text-blue-100"><BarChart3 size={14} /> Benchmark privado</span><h3 className="mt-6 max-w-xl text-3xl font-semibold tracking-[-0.04em]">Compare sua operação com ela mesma — e saiba se hoje foi melhor que ontem.</h3><p className="mt-5 max-w-xl text-base leading-7 text-blue-100/70">Sem expor seus dados e sem misturar negócios. A Prisma identifica evolução, regressão e padrões dentro do seu histórico.</p></article></div></div></section>

        <section className="overflow-hidden bg-[#0b0e15] py-24 text-white md:py-32"><div className="mx-auto max-w-[1180px] px-5 md:px-10"><div className="grid items-center gap-14 lg:grid-cols-[.8fr_1.2fr]"><div><Quote className="text-blue-400" size={35} /><blockquote className="mt-7 text-3xl font-medium leading-tight tracking-[-0.04em] md:text-5xl">“Não basta saber que caiu. Você precisa saber <span className="text-blue-400">onde, por quê e o que testar depois.</span>”</blockquote><p className="mt-7 text-sm text-white/45">A filosofia por trás do Prisma Player</p></div><ProductVisual label="Arte de prova social / resultado real" compact /></div></div></section>

        <Pricing />

        <section id="duvidas" className="landing-section bg-white"><div className="mx-auto max-w-[900px] px-5 md:px-10"><div className="text-center"><span className="landing-kicker justify-center text-blue-700">Dúvidas honestas. Respostas diretas.</span><h2 className="landing-section-title mt-6">Antes de colocar sua VSL no ar</h2></div><div className="mt-12 divide-y divide-slate-200 border-y border-slate-200">{faqs.map(([question, answer]) => <details key={question} className="group py-1"><summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-semibold md:text-lg">{question}<ChevronDown size={19} className="shrink-0 transition group-open:rotate-180" /></summary><p className="max-w-3xl pb-6 text-sm leading-7 text-slate-500 md:text-base">{answer}</p></details>)}</div></div></section>

        <section className="px-4 pb-4"><div className="relative overflow-hidden rounded-[30px] bg-[#0b1020] px-6 py-20 text-center text-white md:rounded-[44px] md:py-28"><div className="landing-cta-glow" /><div className="relative z-10 mx-auto max-w-3xl"><span className="landing-kicker justify-center text-blue-300"><Sparkles size={14} /> Sua próxima versão começa com dados</span><h2 className="mt-7 text-4xl font-semibold tracking-[-0.055em] md:text-6xl">Pare de adivinhar.<br />Comece a evoluir sua VSL.</h2><p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/50 md:text-lg">14 dias para publicar, medir e descobrir o que a sua audiência está tentando dizer.</p><Link href="/signup" className="landing-primary-cta mt-9 bg-white text-[#0b1020] hover:bg-blue-50">Começar agora <ArrowRight size={17} /></Link></div></div></section>
      </main>

      <footer className="bg-white px-5 pb-10 pt-16 md:px-10"><div className="mx-auto max-w-[1240px]"><div className="grid gap-10 border-b border-slate-100 pb-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]"><div><div className="relative h-8 w-[154px]"><Image src="/assets/logo.png" alt="Prisma Player" fill className="object-contain object-left" /></div><p className="mt-5 max-w-xs text-sm leading-6 text-slate-400">Tecnologia brasileira para transformar atenção em decisão e vídeo em crescimento previsível.</p></div>{[["Produto", ["Funcionalidades", "Analytics", "Prisma IA", "Planos"]], ["Empresa", ["Sobre", "Parcerias", "Termos", "Privacidade"]], ["Suporte", ["Central de ajuda", "WhatsApp", "Status", "Contato"]]].map(([title, links]) => <div key={title as string}><p className="text-sm font-semibold">{title as string}</p><ul className="mt-4 space-y-3">{(links as string[]).map((link) => <li key={link}><a href="#" className="text-sm text-slate-400 hover:text-blue-600">{link}</a></li>)}</ul></div>)}</div><div className="flex flex-col justify-between gap-3 pt-7 text-xs text-slate-400 sm:flex-row"><p>© {new Date().getFullYear()} Prisma Player. Todos os direitos reservados.</p><p>Feito para quem leva conversão a sério.</p></div></div></footer>
    </div>
  );
}
