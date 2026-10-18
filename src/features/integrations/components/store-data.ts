import type { LucideIcon } from "lucide-react";
import { BarChart3, BellRing, FileClock, Users, Webhook } from "lucide-react";

/**
 * Dados do Marketplace de apps (/dashboard/integracoes).
 *
 * Dois tipos de app vivem na mesma vitrine:
 * - `provider`: instala/atualiza via PUT/DELETE /api/integrations (backend em
 *   src/lib/integrations/server.ts);
 * - `feature`: recurso de produto já existente na Prisma — o detalhe mostra
 *   um "Como funciona" honesto (o que existe HOJE) e, quando faz sentido,
 *   abre a configuração real na Inteligência.
 */

export interface IntegrationItem {
  provider: string;
  config: Record<string, string>;
  vslIds: string[];
  enabled: boolean;
  updatedAt: string;
}

export interface VslOption {
  id: string;
  title: string;
}

export type StoreCategory = "ads" | "attribution" | "webhooks" | "intelligence" | "security";

export const CATEGORY_LABEL: Record<StoreCategory, string> = {
  ads: "Plataformas de anúncios",
  attribution: "Atribuição",
  webhooks: "Webhooks",
  intelligence: "Inteligência e automação",
  security: "Proteção do player",
};

export const CATEGORY_ORDER: StoreCategory[] = ["ads", "attribution", "webhooks", "intelligence", "security"];

export interface HowItWorks {
  intro: string;
  bullets: string[];
  note?: string;
}

export interface ProviderField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  optional?: boolean;
}

/** Eventos exibidos na tela de detalhe (o que a integração dispara hoje). */
export interface ProviderEvents {
  title: string;
  tag: string;
  detail: string;
}

export type StoreProviderId = "meta_pixel" | "google_ads" | "tiktok" | "utmify" | "discord";

export interface ProviderApp {
  kind: "provider";
  /** Chave única na vitrine. */
  id: StoreProviderId | "outgoing_webhooks";
  /** Provider de verdade no backend (/api/integrations). */
  provider: StoreProviderId;
  name: string;
  category: StoreCategory;
  description: string;
  logo?: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  /** Badge verde "Disponível" quando não instalado (cards novos). */
  showAvailableBadge?: boolean;
  fields: ProviderField[];
  events: ProviderEvents;
  howItWorks: HowItWorks;
}

export type FeatureAppId = "authorized_domains" | "automatic_reports" | "audience_profile" | "benchmarks" | "drop_alerts";

export interface FeatureApp {
  kind: "feature";
  id: FeatureAppId;
  name: string;
  category: StoreCategory;
  description: string;
  /** `domains` abre a gestão da allowlist por VSL; `info` é informativo + CTA. */
  detail: "domains" | "info";
  icon?: LucideIcon;
  /** Marca inline de globo/escudo (SVG no componente, sem arquivo novo). */
  globeShield?: boolean;
  actionLabel: string;
  cta?: { label: string; href: string };
  howItWorks: HowItWorks;
}

export type StoreApp = ProviderApp | FeatureApp;

export const PROVIDER_APPS: ProviderApp[] = [
  {
    kind: "provider",
    id: "meta_pixel",
    provider: "meta_pixel",
    name: "Meta Pixel Ads",
    category: "ads",
    description: "Pixel de rastreamento para campanhas do Facebook e Instagram Ads.",
    logo: "/assets/facebook.png",
    fields: [
      { key: "pixelId", label: "Chave da API (ID do Pixel)", placeholder: "123456789012345" },
      { key: "accessToken", label: "Access Token (API de Conversões)", placeholder: "EAAx… (Events Manager → API de Conversões)", secret: true },
      { key: "testEventCode", label: "Test Event Code (opcional)", placeholder: "Ex.: TEST12345", optional: true },
    ],
    events: {
      title: "Pagamento Confirmado",
      tag: "payment.received",
      detail: "Disparado quando um pagamento é confirmado no seu checkout.",
    },
    howItWorks: {
      intro: "O Meta Pixel envia eventos de conversão diretamente para a API de Conversões do Facebook/Instagram, permitindo otimizar suas campanhas com dados precisos de compra.",
      bullets: [
        "Purchase — enviado quando um pagamento é confirmado",
        "Valor da compra e moeda",
        "ID do pedido (deduplicação entre browser e servidor)",
        "E-mail do cliente (hash SHA-256) e informações do dispositivo",
      ],
      note: "Para a API de Conversões você precisa de um Access Token com permissão ads_management.",
    },
  },
  {
    kind: "provider",
    id: "google_ads",
    provider: "google_ads",
    name: "Google Ads",
    category: "ads",
    description: "Rastreamento para Google Ads e Google Analytics 4.",
    logo: "/assets/google-ads.png",
    fields: [
      { key: "tagId", label: "ID da tag", placeholder: "AW-123456789 ou G-ABC123DEF" },
      { key: "conversionDestination", label: "Destino da conversão (opcional)", placeholder: "AW-123456789/AbCdEfGhIj", optional: true },
    ],
    events: {
      title: "Pagamento Confirmado",
      tag: "payment.received",
      detail: "Disparado quando um pagamento é confirmado no seu checkout.",
    },
    howItWorks: {
      intro: "A tag do Google dispara conversões de visualização, reprodução, clique no CTA e compra para o Google Ads e o GA4.",
      bullets: ["view_item — a VSL é vista", "video_start / video_progress / video_complete", "generate_lead — clique no CTA", "purchase — compra confirmada no seu checkout"],
    },
  },
  {
    kind: "provider",
    id: "tiktok",
    provider: "tiktok",
    name: "TikTok",
    category: "ads",
    description: "Pixel de rastreamento para o TikTok Ads Manager.",
    logo: "/assets/tiktok.png",
    fields: [{ key: "pixelId", label: "ID do pixel", placeholder: "CXXXXXXXXXXXXXXXXX" }],
    events: {
      title: "Pagamento Confirmado",
      tag: "payment.received",
      detail: "Disparado quando um pagamento é confirmado no seu checkout.",
    },
    howItWorks: {
      intro: "O TikTok Pixel registra os eventos da VSL e a compra confirmada para otimizar campanhas no TikTok Ads Manager.",
      bullets: ["ViewContent — a VSL é vista", "Play/Progress/Complete — reprodução", "Purchase — compra confirmada"],
    },
  },
  {
    kind: "provider",
    id: "utmify",
    provider: "utmify",
    name: "UTMify",
    category: "attribution",
    description: "Atribuição de vendas por UTM com a origem exata da campanha.",
    logo: "/assets/utmify.png",
    comingSoon: true,
    fields: [],
    events: {
      title: "Pagamento Confirmado",
      tag: "payment.received",
      detail: "Compras confirmadas serão enviadas com a origem exata da campanha.",
    },
    howItWorks: {
      intro: "As compras confirmadas pela Prisma serão enviadas ao UTMify com a origem exata da campanha (UTMs capturadas na entrada do espectador).",
      bullets: ["Atribuição por campanha/origem", "Envio automático das compras confirmadas"],
      note: "Integração em finalização.",
    },
  },
  {
    kind: "provider",
    id: "outgoing_webhooks",
    provider: "discord",
    name: "Webhooks de saída",
    category: "webhooks",
    description: "Eventos em tempo real para Discord ou qualquer endpoint HTTPS compatível.",
    icon: Webhook,
    showAvailableBadge: true,
    fields: [{ key: "webhookUrl", label: "Endpoint HTTPS do webhook", placeholder: "https://discord.com/api/webhooks/… ou qualquer URL HTTPS" }],
    events: {
      title: "Eventos em tempo real",
      tag: "play · progress · cta_click · conversion · complete",
      detail: "Disparados conforme a VSL é assistida — um POST HTTPS por evento.",
    },
    howItWorks: {
      intro: "Os eventos das suas VSLs são entregues em tempo real no endpoint que você cadastrar — um webhook do Discord ou qualquer serviço compatível com HTTPS.",
      bullets: [
        "Play, progresso, clique no CTA, conversão e conclusão da VSL",
        "Endereços do Discord recebem a mensagem formatada para o canal",
        "A URL fica salva no servidor — nunca vai para a embed",
        "Uma única URL para todas as VSLs vinculadas",
      ],
      note: "A escolha das atividades enviadas e o teste de entrega ficam na Inteligência.",
    },
  },
];

export const FEATURE_APPS: FeatureApp[] = [
  {
    kind: "feature",
    id: "authorized_domains",
    name: "Domínios autorizados",
    category: "security",
    description: "Permita somente os domínios que podem embutir suas VSLs.",
    detail: "domains",
    globeShield: true,
    actionLabel: "Configurar",
    howItWorks: {
      intro: "Cada VSL tem a sua própria allowlist. Enquanto a lista estiver vazia, o player pode ser reproduzido em qualquer site; com domínios cadastrados, apenas eles conseguem carregar a VSL.",
      bullets: [
        "Um domínio por linha — aceita https://dominio.com, dominio.com ou *.dominio.com",
        "O curinga *.exemplo.com libera todos os subdomínios",
        "A lista é salva por VSL, no allowedDomains do config do player",
        "A proteção passa a valer nos embeds logo após salvar",
      ],
      note: "Protocolo (https://) e caminhos são normalizados automaticamente.",
    },
  },
  {
    kind: "feature",
    id: "automatic_reports",
    name: "Relatórios automáticos",
    category: "intelligence",
    description: "Receba um resumo periódico com plays, conversões e desempenho da operação.",
    detail: "info",
    icon: FileClock,
    actionLabel: "Abrir",
    cta: { label: "Ativar na Inteligência", href: "intelligence" },
    howItWorks: {
      intro: "O resumo periódico da sua operação chega pronto no seu Inbox da Prisma — plays, conversões e taxa de conversão do período, sem precisar montar relatório.",
      bullets: [
        "Frequência diária, semanal ou mensal — você escolhe na Inteligência",
        "Entrega no Inbox, com atalho para abrir o relatório",
        "Cópia por e-mail quando o envio está configurado no servidor (REPORT_EMAIL_FROM)",
      ],
      note: "Ative a frequência e cadastre o e-mail na Inteligência.",
    },
  },
  {
    kind: "feature",
    id: "audience_profile",
    name: "Perfil de público",
    category: "intelligence",
    description: "Transforme os sinais de audiência de cada VSL em um perfil pronto para orientar campanhas.",
    detail: "info",
    icon: Users,
    actionLabel: "Abrir",
    cta: { label: "Gerar perfil na Inteligência", href: "intelligence" },
    howItWorks: {
      intro: "A Prisma transforma os sinais reais de audiência de cada VSL em um perfil pronto para orientar campanhas — você escolhe a VSL e o segmento.",
      bullets: [
        "Segmentos prontos: assistiram 75%+, concluíram, clicaram no CTA, compraram ou toda a audiência",
        "O perfil reúne localização, dispositivo, sistema, navegador, origem e campanhas",
        "Gerado na hora e baixado em TXT, por VSL",
      ],
    },
  },
  {
    kind: "feature",
    id: "benchmarks",
    name: "Benchmarks",
    category: "intelligence",
    description: "Compare sua operação com uma média global agregada e anônima.",
    detail: "info",
    icon: BarChart3,
    actionLabel: "Abrir",
    cta: { label: "Ver benchmark na Inteligência", href: "intelligence" },
    howItWorks: {
      intro: "Compare o desempenho da sua operação com referências agregadas, preservando a privacidade de todas as contas.",
      bullets: [
        "Play rate, retenção final e conversão da sua operação lado a lado com a média global",
        "Benchmark privado entre as suas próprias VSLs: melhor VSL e média da conta",
        "Dados globais agregados e anônimos — nenhuma conta aparece individualmente",
      ],
      note: "A referência global fica disponível quando há base comparável suficiente.",
    },
  },
  {
    kind: "feature",
    id: "drop_alerts",
    name: "Alertas de queda",
    category: "intelligence",
    description: "Compara as últimas 24h com as 24h anteriores e avisa somente quando há queda real.",
    detail: "info",
    icon: BellRing,
    actionLabel: "Abrir",
    cta: { label: "Configurar alertas na Inteligência", href: "intelligence" },
    howItWorks: {
      intro: "O monitor compara as últimas 24 horas com as 24 horas anteriores de cada VSL e avisa somente quando há queda real na conversão.",
      bullets: [
        "Somente queda real: acima do limite que você definir (padrão 20%) e no mínimo 10 plays em cada período",
        "O aviso chega no seu Inbox com o tamanho da queda e atalho para analisar a VSL",
        "No máximo um alerta por VSL por dia — sem spam",
      ],
      note: "Ative os alertas e ajuste a sensibilidade na Inteligência.",
    },
  },
];

export const STORE_APPS: StoreApp[] = [...PROVIDER_APPS, ...FEATURE_APPS];
