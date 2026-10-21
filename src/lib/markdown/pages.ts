import { normalizePathname } from "./negotiate";
import { contactEmail } from "@/content/contact";

/**
 * Conteúdo Markdown das páginas públicas (item 2 do relatório "Is Agentic" /
 * Ora). Texto PT-BR fiel à copy publicada das páginas - resumo, sem inventar
 * recursos ou números que não estejam no site. Handlers em
 * /api/markdown e /api/markdown/404 consomem este módulo; nada aqui contém
 * segredos nem dados de usuário.
 */

const HOME = `# Prisma Player - Player de VSL com pitch no segundo exato e carregamento instantâneo

Pitch Delay sincronizado, analytics de retenção, testes A/B e proteção anti-download. Feito para operações de lançamento que colocam VSL no ar todos os dias. Teste 14 dias grátis, sem cartão de crédito.

## Recursos do player

- **Pitch Delay** - Revele a oferta no segundo exato do seu pitch: botão de compra, preço e checkout sincronizados ao tempo da VSL, inclusive se o lead pausar ou avançar o vídeo.
- **CDN Instantânea** - Carregamento rápido, sem buffer, com infraestrutura global otimizada para o mercado brasileiro (também em 3G/4G).
- **Proteção Anti-Download** - Domínios permitidos, watermark dinâmico e recursos anti-download contra clonagem e roubo da oferta.
- **Autoplay com Som** - Reprodução automática inteligente com convite para ativar o som.
- **Analytics de Retenção** - Gráfico segundo a segundo: onde os leads abandonam, o que gera re-assistidas.
- **Teste A/B Integrado** - Compare 2 VSLs ou thumbs no mesmo link, sem alterar a página.

## Como funciona

1. Criar conta e fazer upload do vídeo (MP4) ou importar por link.
2. Configurar o Pitch Delay - o tempo exato em que a oferta é liberada.
3. Customizar o design do player (cores, controles, thumbnail).
4. Inserir o código embed de 1 linha (WordPress, Elementor, Webflow e outros).
5. Acompanhar a retenção no analytics em tempo real.
6. Rodar testes A/B e otimizar continuamente.

## Casos de uso e resultados publicados

- Produtor de suplementos (VSL de R$ 397): +38% de conversão no pitch.
- Infoproduto de finanças (oferta de R$ 997): zero travamentos em pico de 45k ao vivo.
- Coprodutor de emagrecimento (funil X1): 68% de cliques no botão de checkout.

## Links

- [Preços e planos](/pricing)
- [Serviços e funcionalidades](/services)
- [Sobre a Prisma Player](/about)
- [Contato](/contact)
`;

const PRICING = `# Planos e Preços | Prisma Player

Escolha a capacidade de plays ideal para sua operação de VSL. Cobrança mensal ou anual (anual economiza 34% e é a opção que mais clientes escolhem). 14 dias grátis, sem cartão de crédito.

## Planos (valores em reais)

- **Iniciante** - para validar a oferta: R$ 44,90/mês no plano anual (cobrado R$ 538,80 à vista) ou R$ 67,90/mês sem fidelidade. 10.000 plays/mês, 1 domínio, Pitch Delay sincronizado, autoplay, analytics de retenção, proteção anti-download, suporte por e-mail e ticket.
- **Pro** (mais escolhido) - R$ 97,90/mês no plano anual (cobrado R$ 1.174,80 à vista) ou R$ 147,90/mês sem fidelidade. 50.000 plays/mês, multi-domínios ilimitados, analytics segundo a segundo, teste A/B de player e thumbnail, customização de cores e controles, suporte prioritário via WhatsApp 24/7.
- **Escala** - lançamentos e agências: R$ 229,90/mês no plano anual (cobrado R$ 2.758,80 à vista) ou R$ 347,90/mês sem fidelidade. 200.000 plays/mês, gerente de conta dedicado, SLA documentado por contrato, exportação de audiência para Facebook Ads, migração assistida e onboarding acompanhado.

Plays adicionais custam R$ 0,02, informado antecipadamente. Upgrade, downgrade ou cancelamento a qualquer momento pelo painel, sem multa.

## Garantia

Garantia incondicional de 14 dias: crie a conta sem informar cartão e teste velocidade e retenção sem risco. Assinaturas são cobradas via Stripe (cartão) e Pix (AbacatePay), conforme os [Termos de Uso](/terms).

## Links

- [Início](/) - [Serviços](/services) - [Sobre](/about) - [Contato](/contact)
`;

const SERVICES = `# Serviços e Funcionalidades | Prisma Player

Suíte completa de 14 tecnologias para maximizar a retenção e o faturamento das suas VSLs.

## As 14 tecnologias

1. **Headlines AI** - testa headlines acima do vídeo com tráfego real; a variação vencedora passa a ser exibida.
2. **Smart Autoplay** - inicia o vídeo com mensagem estratégica e convite para ativar o som.
3. **Turbo Playback** - ajuste automático ou manual da velocidade de reprodução.
4. **Teste A/B de Vídeo e Thumb** - compare variações com um único embed, divisão 50/50.
5. **Analytics Avançado de Retenção** - retenção segundo a segundo, filtrada por dispositivo, país e navegador.
6. **Thumbnail de Recuperação na Pausa** - pop-up de recuperação quando o lead pausa após o pitch.
7. **Mini-Gancho de Abandono** - avisos de curiosidade/urgência nos momentos de maior saída.
8. **Progresso Inteligente por IA** - aceleração sutil da barra de progresso para reduzir a percepção de duração.
9. **Botões de Ação no Pitch** - checkout liberado no segundo exato da chamada de oferta.
10. **Pixel e Remarketing de Precisão** - eventos para Meta, Google e TikTok por tempo assistido (50%, 75%, 100%).
11. **Continuar Assistindo de Onde Parou** - retomada do vídeo para tráfego de remarketing.
12. **Estilo e Personalização de Marca** - cores, controles e identidade visual da sua página.
13. **Escudo DRM Anti-Pirataria** - bloqueio de downloads e watermark dinâmica.
14. **Turbo CDN Instantânea** - servidores de borda em São Paulo e Rio de Janeiro, streaming abaixo de 250ms.

## Nosso processo de otimização

Auditoria do vídeo → pesquisa de gancho e abandono → otimização do Pitch Delay → configuração do Smart Autoplay → recuperação de pausa e DRM → monitoramento e testes A/B.

## Links

- [Preços](/pricing) - [Início](/) - [Contato](/contact)
`;

const ABOUT = `# Sobre a Prisma Player

Revolucionando a retenção de VSLs no mercado digital. Nascemos do desejo de oferecer aos infoprodutores e afiliados uma tecnologia de reprodução de vídeo ágil, segura e verdadeiramente desenhada para vender. Mais de 10 milhões de visualizações de VSL processadas por mês.

## Nosso manifesto

No tráfego pago, cada clique em uma página de vendas representa um investimento financeiro real. Quando um player demora para carregar ou congela no momento do pitch, esse investimento é desperdiçado. Desenvolvemos o Prisma Player para eliminar os gargalos de infraestrutura e devolver aos produtores o controle total sobre o comportamento do seu público.

## Nossos valores

- **Obsessão por velocidade** - cada milissegundo de travamento em uma VSL é dinheiro perdido.
- **Transparência de dados** - métricas reais, segundo a segundo, sem dados inflados.
- **Proteção inabalável** - o mais alto nível de segurança contra clonagem e downloads indevidos.
- **Foco no sucesso do cliente** - acompanhamento próximo e suporte humanizado via WhatsApp.

## Trajetória

- 2024 - nascimento da ideia: primeira CDN dedicada a VSLs.
- 2025 - lançamento do Escudo DRM anti-download.
- 2026 - inteligência de retenção e A/B, com mais de 10 milhões de views/mês.

## Liderança

- Guilherme Siqueira - CEO e cofundador.
- Renata Miranda - CTO e liderança de engenharia.
- Lucas Alencar - Head de Produto e CX.

## Links

- [Preços](/pricing) - [Serviços](/services) - [Contato](/contact)
`;

const PRIVACY = `# Política de Privacidade | Prisma Player

Resumo da política vigente desde 17 de outubro de 2026 (versão completa, com todos os detalhes, em [/privacy](/privacy)). A Prisma Player hospeda e entrega vídeos de venda no mundo todo; para dados de espectadores dos players, age por conta e ordem dos clientes. Não vendemos dados pessoais.

## Dados tratados

- Conta: nome, e-mail, telefone (se informado), dados de equipe e autenticação.
- Cobrança: processada por Stripe (cartão) e AbacatePay (Pix); não armazenamos o número completo do cartão.
- Conteúdo e configuração: vídeos, títulos, configurações de player e domínios permitidos.
- Espectadores dos players: IP, país aproximado, dispositivo, progresso de visualização e eventos de conversão - o cliente é o controlador e a Prisma Player, a operadora.
- Segurança: logs de acesso e verificações antifraude.

## Bases legais e direitos

Tratamento com base na LGPD (art. 7º) e no GDPR (art. 6º): execução de contrato, obrigação legal, legítimo interesse e consentimento. Direitos exercíveis pelo encarregado privacidade@prismaplayer.com.br: LGPD com resposta em até 15 dias (art. 18/19), GDPR em até 30 dias e CCPA/CPRA (não vendemos dados e respeitamos o sinal GPC).

## Terceiros e segurança

Compartilhamento apenas com fornecedores necessários: Stripe, AbacatePay, Neon, Cloudflare, Vercel, Google Analytics, Meta, TikTok, PostHog, Resend e provedores de IA. URLs de vídeo assinadas e de curta duração, isolamento por conta, limites de requisição e notificação de incidentes às autoridades dentro dos prazos legais.

## Relacionados

- [Política de Cookies](/cookies) - [Termos de Uso](/terms) - [Contato](/contact)
`;

const TERMS = `# Termos de Uso | Prisma Player

Resumo dos termos vigentes desde 17 de outubro de 2026 (versão completa, com todas as cláusulas, em [/terms](/terms)). Ao criar uma conta ou usar a Prisma Player, você concorda com estes Termos. Serviço destinado a maiores de 18 anos.

## O essencial

- **Conta e segurança** - informações verdadeiras, credenciais protegidas; notifique usos não autorizados.
- **Seu conteúdo** - você mantém todos os direitos sobre vídeos e criativos; concedemos apenas a licença limitada necessária para operar o serviço. Não usamos seu conteúdo para treinar IA.
- **Intermediário** - somos provedora de hospedagem e meio técnico (arts. 18 e 19 do Marco Civil); cada cliente é o único responsável pelo conteúdo que publica.
- **Conduta proibida** - conteúdo ilegal ou enganoso, material sem licença, malware, burlar proteções anti-download ou limites técnicos.
- **Planos e pagamentos** - assinatura recorrente via Stripe (cartão) e Pix (AbacatePay), cobrança anual com desconto; direito de arrependimento em 7 dias (art. 49 do CDC), com dedução proporcional do consumo relevante.
- **Métricas e IA** - analytics, testes A/B e sugestões de IA são ferramentas de apoio, não promessa de resultado.
- **Suspensão e encerramento** - possível por violação dos termos, inadimplência ou risco à segurança, com exportação de dados por prazo razoável.
- **Lei aplicável** - leis da República Federativa do Brasil, sem prejuízo de normas imperativas do local do consumidor.

Notificações de direitos autorais (DMCA/Marco Civil) para privacidade@prismaplayer.com.br, com identificação da obra, URL do player e dados de contato.

## Relacionados

- [Política de Privacidade](/privacy) - [Política de Cookies](/cookies) - [Contato](/contact)
`;

const COOKIES = `# Política de Cookies | Prisma Player

Resumo da política (versão completa em [/cookies](/cookies)). Cookies são pequenos arquivos que sites e players salvam no navegador; também usamos localStorage no player.

## Categorias

- **Essenciais (sempre ativos)** - sessão da conta; prova de segurança do player (cookie técnico pp_embed, HttpOnly, valida que o player foi renderizado por um navegador real e não rastreia pessoas); preferências mínimas.
- **Funcionais** - retomada do vídeo, identificador técnico de navegador para métricas e A/B, preferências do player (volume, velocidade, versão do teste).
- **Analytics** - Google Analytics e PostHog, de forma agregada, para melhorar desempenho e produto.
- **Marketing** - conforme configurado pelo cliente e consentido por você, eventos podem ser enviados a Meta (Pixel e Conversions API) e TikTok (Events API), com identificadores tratados por hash. Nunca vendemos seus dados.

## Como gerenciar

Banner de consentimento opcional no player (aceitar/recusar), configurações do navegador, respeito ao sinal Global Privacy Control (GPC) e ferramentas de opt-out das plataformas. Dúvidas: privacidade@prismaplayer.com.br.

## Relacionados

- [Política de Privacidade](/privacy) - [Termos de Uso](/terms) - [Contato](/contact)
`;

const CONTACT = `# Contato | Prisma Player

Fale com a equipe da Prisma Player. Canal oficial: **${contactEmail}** (e-mail). Respondemos dentro de 1 dia útil - normalmente em poucas horas em dias úteis.

<!-- TODO(dono): trocar pelo e-mail oficial quando definido. -->

## O que incluir na mensagem

- Seu nome, e-mail e, se já for cliente, o e-mail da conta cadastrada.
- O assunto: dúvida comercial, migração de outro player, integração/embed, bug ou parceria.
- Para problemas técnicos: URL da página onde o player está publicado, navegador e horário aproximado.
- Volume aproximado de tráfego e de VSLs, para recomendarmos o plano certo.

## Não envie por este canal

Não envie senhas, tokens, chaves de API ou dados completos de cartão - nunca solicitamos essas informações. Titulares de dados (LGPD/GDPR) e notificações de direitos autorais seguem pelos canais descritos em [/privacy](/privacy) e [/terms](/terms).

## Links

- [Início](/) - [Preços](/pricing) - [Recursos para desenvolvedores](/developers) - [Política de Privacidade](/privacy) - [Termos de Uso](/terms)
`;

const DEVELOPERS = `# Prisma Player - Recursos para desenvolvedores e agentes

Página de referência para integrar o player e para agentes de IA lerem o site. Versão HTML desta página em [/developers](/developers); índice para agentes em [/llms.txt](/llms.txt).

## Endpoints públicos

- \`GET /api/health\` - liveness da plataforma (\`{"ok":true}\`), sem banco.
- \`GET /api/embed/{id}\` - configuração do player para render no embed (requer contexto de origem do embed: token de origem + cookie de render; não é API de chave pública).
- \`GET /api/embed/{id}/manifest\` - manifest de reprodução do embed.
- \`POST /api/embed/{id}/session\` - mint do token de sessão do DRM (token assinado por sessão).
- \`POST /api/ab-events\` - eventos de teste A/B enviados pelo player no embed (origem validada).
- \`GET /llms.txt\` - índice do site para IAs.
- \`GET /api/markdown?path=/pricing\` - versão Markdown das páginas públicas (negociação via \`Accept: text/markdown\` no proxy).
- \`GET /api/openapi.json\` - especificação OpenAPI 3.1 completa da superfície pública.

Todas as demais APIs (conta, vídeos, billing, analytics internos) exigem sessão autenticada e respondem 401 fora dela.

## Como embutir o player

O embed é um código de 1 linha (script + div de destino) gerado no painel e colado no WordPress, Elementor, Webflow, GreatPages, Klickpages ou qualquer construtor. O player carrega responsivo em celulares e computadores, com Pitch Delay, A/B e pixels configurados no painel.

## Documentos para agentes

- [/llms.txt](/llms.txt) - descrição do produto, casos de uso e links.
- [/sitemap.xml](/sitemap.xml) - mapa de páginas.
- [Markdown de qualquer página pública](/api/markdown?path=/) - negociação automática via header \`Accept: text/markdown\`.

## Falar com a equipe

Integrações, migração de outros players ou parcerias: [Contato](/contact).
`;

/**
 * Mapa caminho → conteúdo Markdown. Chaves normalizadas (sem barra final).
 */
export const MARKDOWN_PAGES: Record<string, string> = {
  "/": HOME,
  "/pricing": PRICING,
  "/services": SERVICES,
  "/about": ABOUT,
  "/privacy": PRIVACY,
  "/terms": TERMS,
  "/cookies": COOKIES,
  "/contact": CONTACT,
  "/developers": DEVELOPERS,
};

/** Conteúdo Markdown de uma página pública (null quando o caminho é desconhecido). */
export function getMarkdownPage(path: string): string | null {
  return MARKDOWN_PAGES[normalizePathname(path)] ?? null;
}

/**
 * Corpo 404 em Markdown (≥20 chars): explica que a página não existe e aponta
 * os recursos de descoberta para o agente continuar navegando.
 */
export function markdownNotFoundBody(path: string): string {
  return `# 404 - Página não encontrada

O caminho \`${normalizePathname(path)}\` não corresponde a nenhuma página publicada na Prisma Player. Nada foi publicado neste endereço - não é um erro temporário.

## Páginas disponíveis

- [Início](/)
- [Preços e planos](/pricing)
- [Serviços e funcionalidades](/services)
- [Sobre a Prisma Player](/about)
- [Contato](/contact)
- [Recursos para desenvolvedores e agentes](/developers)

## Recursos de descoberta para agentes

- [/llms.txt](/llms.txt) - índice do site para IAs
- [/sitemap.xml](/sitemap.xml) - mapa de páginas
- [/api/openapi.json](/api/openapi.json) - API pública documentada
`;
}
