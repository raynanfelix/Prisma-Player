# Produto — Prisma Player

## Problema

Criadores de oferta e infoprodutores brasileiros publicam VSLs (video sales
letters) em páginas de vendas e precisam de mais do que um hospedeiro de vídeo:
controle de onde o vídeo pode rodar, proteção de conteúdo, dados de
retenção/conversão por trecho e experimentação A/B para melhorar a oferta.
Players genéricos não oferecem domínio permitido, watermark dinâmico,
retomada de reprodução nem eventos de conversão server-side.

## Público

- Criadores e infoprodutores (lançamentos, páginas de VSL) no mercado BR.
- Agências e operadores que gerenciam vídeos de clientes (times e planos).
- Interface em português; pagamento via Pix (AbacatePay).

## Escopo observado (fatos do código atual)

- **Players embutíveis**: embed público por UUID com manifest cacheado
  (Cloudflare Worker + KV, TTL 30s), rate limit por IP, `allowed_domains`,
  watermark (usuário/sessão/data/texto), autoplay inteligente, retomada,
  legendas, velocidades e thumbnails por momento.
- **Studio**: editor da VSL (VslStudio) com testes A/B, ganchos e créditos
  de IA (NVIDIA NIM).
- **Analytics**: plays/impressions/progresso (10/25/50/75/90), heatmap, mapa
  "ao vivo", conversões, eventos server-side de anúncios (Meta CAPI, TikTok
  Events), rollups e retenção por cron.
- **Conta**: Neon Auth (Managed Better Auth, sem MFA), times, papéis, planos
  com cotas (armazenamento trial, créditos IA), trials e cobrança AbacatePay
  com verificação HMAC.
- **Admin**: painéis de financeiro e operação.
- **Segurança**: `guard({ csrf, role, paid })` em rotas mutantes, queries
  sempre filtradas por `accountOwnerId`, `server-only` em módulos de servidor.

## Restrições

- Storage de vídeos exclusivamente Cloudflare R2.
- Postgres gerenciado Neon/Lakebase; migrations só via `DATABASE_URL_UNPOOLED`.
- Sem MFA no auth (decisão vigente do Neon Auth gerenciado).
- Cores só via tokens de `globals.css` (claro intacto; escuro preto).

## Hipóteses (não confirmadas)

- O mapa "ao vivo" e o heatmap são diferenciais de venda para o público de lançamentos.
- Créditos de IA aumentam retenção de plano pago (métricas ainda não medidas).

## Critérios de aceite de mudanças

- `npm run verify` verde (typecheck + lint sem erros + testes) e build válido.
- Toda query nova filtra por `accountOwnerId`; rota mutante nova usa `guard`.
- UI segue `docs/apple-DESIGN.md` e `docs/UI_ARCHITECTURE.md`.
