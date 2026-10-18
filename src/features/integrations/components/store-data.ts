import type { ImageProps } from "next/image";

import alertasDeQuedaLogo from "@/assets/Alertasdequeda.png";
import benchmarksLogo from "@/assets/Benchmarks.png";
import discordLogo from "@/assets/discord.svg";
import dominiosAutorizadosLogo from "@/assets/Domíniosautorizados.png";
import facebookLogo from "@/assets/facebook.png";
import googleAdsLogo from "@/assets/google-ads.png";
import perfilDePublicoLogo from "@/assets/Perfildepúblico.png";
import reportsLogo from "@/assets/Relatórios automáticos.png";
import telegramLogo from "@/assets/telegram.png";
import tiktokLogo from "@/assets/tiktok.png";
import utmifyLogo from "@/assets/utmify.png";

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
  instanceId: string;
  name: string;
  config: Record<string, unknown>;
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
  /** Preenchido automaticamente (ex.: getMe do Telegram) — não editável. */
  readOnly?: boolean;
}

/** Eventos exibidos na tela de detalhe (o que a integração dispara hoje). */
export interface ProviderEvents {
  title: string;
  tag: string;
  detail: string;
}

export type StoreProviderId = "meta_pixel" | "google_ads" | "tiktok" | "utmify" | "discord" | "telegram";

export interface ProviderApp {
  kind: "provider";
  /** Chave única na vitrine. */
  id: StoreProviderId | "outgoing_webhooks";
  /** Provider de verdade no backend (/api/integrations). */
  provider: StoreProviderId;
  name: string;
  category: StoreCategory;
  description: string;
  /** Logo de src/assets como import estático (aceito por <Image src>). */
  logo?: ImageProps["src"];
  comingSoon?: boolean;
  /** Badge verde "Disponível" quando não instalado (cards novos). */
  showAvailableBadge?: boolean;
  fields: ProviderField[];
  events: ProviderEvents;
  howItWorks: HowItWorks;
  /** "telegram" = valida o token via getMe e preenche nome/username/chatId. */
  verify?: "telegram";
  /** Eventos que o dono pode ligar/desligar por instância (config.events). */
  selectableEvents?: { key: string; label: string }[];
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
  /** Logo de src/assets como import estático (aceito por <Image src>). */
  logo?: ImageProps["src"];
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
    logo: facebookLogo,
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
    logo: googleAdsLogo,
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
    logo: tiktokLogo,
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
    logo: utmifyLogo,
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
    id: "discord",
    provider: "discord",
    name: "Discord",
    category: "webhooks",
    description: "Receba eventos das suas VSLs em um canal do seu servidor Discord.",
    logo: discordLogo,
    showAvailableBadge: true,
    fields: [{ key: "webhookUrl", label: "Webhook do Discord", placeholder: "https://discord.com/api/webhooks/…" }],
    events: {
      title: "Eventos em tempo real",
      tag: "play · progress · cta_click · conversion · complete",
      detail: "Disparados conforme a VSL é assistida — uma mensagem formatada por evento no canal.",
    },
    howItWorks: {
      intro: "Os eventos das suas VSLs são entregues em tempo real no canal do seu servidor Discord via webhook.",
      bullets: [
        "Play, progresso, clique no CTA, conversão e conclusão da VSL",
        "Mensagem formatada para o canal do Discord",
        "A URL fica salva no servidor — nunca vai para a embed",
        "Múltiplos webhooks: cadastre um para cada canal ou servidor",
      ],
      note: "A escolha das atividades enviadas e o teste de entrega ficam na Inteligência.",
    },
    selectableEvents: [
      { key: "play", label: "Play — espectador iniciou a VSL" },
      { key: "progress", label: "Progresso — marcos de 10% a 90%" },
      { key: "cta_click", label: "Clique no CTA" },
      { key: "conversion", label: "Conversão — compra confirmada" },
      { key: "complete", label: "Conclusão do vídeo" },
    ],
  },
  {
    kind: "provider",
    id: "telegram",
    provider: "telegram",
    name: "Telegram",
    category: "webhooks",
    description: "Receba eventos das suas VSLs no seu bot do Telegram.",
    logo: telegramLogo,
    showAvailableBadge: true,
    verify: "telegram",
    fields: [
      { key: "botToken", label: "Token do Bot", placeholder: "123456789:AAEx… (cole o token do @BotFather)", secret: true },
      { key: "botName", label: "Nome do Bot", placeholder: "Preenchido automaticamente ao colar o token", readOnly: true },
      { key: "botUsername", label: "Username do Bot", placeholder: "Preenchido automaticamente ao colar o token", readOnly: true },
      { key: "chatId", label: "Chat ID (preenchido após /start)", placeholder: "Mande /start para o seu bot no Telegram", readOnly: true },
    ],
    events: {
      title: "Eventos em tempo real",
      tag: "play · progress · cta_click · conversion · complete",
      detail: "Disparados conforme a VSL é assistida — uma mensagem por evento no bot.",
    },
    howItWorks: {
      intro: "Os eventos das suas VSLs são entregues em tempo real no chat do seu bot do Telegram via API oficial.",
      bullets: [
        "Crie o bot com o @BotFather e cole o token aqui — nome e username são verificados automaticamente",
        "Mande /start para o seu bot no Telegram para a Prisma descobrir o chat de entrega",
        "Play, progresso, clique no CTA, conversão e conclusão da VSL — você escolhe quais envia",
        "A URL fica salva no servidor — nunca vai para a embed",
      ],
      note: "Precisa de um bot criado no Telegram com o @BotFather.",
    },
    selectableEvents: [
      { key: "play", label: "Play — espectador iniciou a VSL" },
      { key: "progress", label: "Progresso — marcos de 10% a 90%" },
      { key: "cta_click", label: "Clique no CTA" },
      { key: "conversion", label: "Conversão — compra confirmada" },
      { key: "complete", label: "Conclusão do vídeo" },
    ],
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
    logo: dominiosAutorizadosLogo,
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
    logo: reportsLogo,
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
    logo: perfilDePublicoLogo,
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
    logo: benchmarksLogo,
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
    logo: alertasDeQuedaLogo,
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
