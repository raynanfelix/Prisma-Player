# Prisma Player — Métricas de vendas reportadas pelas plataformas de anúncios (v2)

## Contexto atual

A Prisma Player já possui seu próprio sistema de tracking de vídeo funcionando
(`videoEvents`: views, play, retenção, conclusões, cliques na CTA), um pipeline
server-side de eventos de anúncios (`src/services/ads/server-events`) e o
dashboard `/dashboard/conversions`, que já exibe plays, cliques na CTA e
"Compras atribuídas" internas.

**Não reimplementar, modificar ou duplicar nenhum desses sistemas.**

O problema: após o clique na CTA o visitante vai para um checkout externo e a
Prisma não sabe se a compra foi concluída.

## Objetivo

Exibir no dashboard uma camada de **métricas de conversão/vendas reportadas
pelas plataformas de anúncio** (Meta, Google Ads, TikTok), obtidas via APIs
oficiais de **consulta de relatórios** — nunca APIs de envio de eventos —
mediante autorização OAuth do próprio cliente, sem instalar código da Prisma na
página de vendas ou de obrigado, e sem integrar gateways de pagamento nesta
etapa.

## Premissa técnica (entender antes de codificar)

1. As plataformas só reportam compras que o **próprio cliente** rastreia nelas
   (pixel/CAPI no checkout ou página de obrigado, conversion actions,
   integração nativa do checkout). A Prisma **apenas lê relatórios**: não
   valida, não corrige e não substitui o rastreamento do cliente. Se o cliente
   não rastreia conversões, a métrica virá vazia/zero — o produto deve
   **comunicar** isso, não "resolver".
2. As APIs de relatório retornam **agregados por dia**. Não existe lista de
   compras individuais por transação.
3. Números recentes **mudam retroativamente** (janelas de atribuição da
   plataforma, ex.: ~7 dias clique / ~1 dia view; no Google, por conversion
   action). Dias recentes são **provisórios** e precisam ser re-sincronizados.
4. Cada conta de anúncio tem **moeda e fuso horário próprios**. Nunca somar
   moedas diferentes, nunca converter câmbio sem fonte oficial — exibir a moeda
   da conta e o fuso de referência.
5. A atribuição é da plataforma para **anúncios/campanhas**, não para vídeos.
   Sem vínculo confiável, nunca afirmar que uma compra veio de um vídeo
   específico.

## Fase 0 — Pesquisa e auditoria (gate antes de implementar)

1. **Auditar o projeto**: `/dashboard/conversions` (camada interna atual),
   `src/services/ads/server-events` (envio de eventos — intocável),
   `src/lib/cron-tasks` (padrão de cron existente), `src/lib/api/guard`,
   schema Drizzle em `src/lib/db`, páginas de settings.
2. **Pesquisar a documentação oficial atualizada**:
   - Meta Marketing API (Insights: `actions`, `action_values`,
     `cost_per_action_type`, `spend`; Business Login; App Review; verificação
     de negócio) — https://developers.facebook.com/docs/marketing-apis/
   - Google Ads API (GAQL: `metrics.conversions`, `conversions_value`,
     `cost_per_conversion`, `cost_micros`; developer token Basic Access;
     contas de teste) — https://developers.google.com/google-ads/api/docs/conversions/reporting
   - TikTok Marketing API (Reporting integrado: `spend`, `purchase`,
     `purchase_value`, `cost_per_result`; app review de escopos; sandbox)
     — https://business-api.tiktok.com/portal/docs
3. Produzir `docs/ads-metrics-research.md` com, **por plataforma**: métricas
   obtíveis; endpoints usados; permissões/escopos exigidos; aprovações
   necessárias (App Review / developer token / app review) e tempo estimado;
   quotas e rate limits; latência dos dados; janela de atribuição; moeda/fuso;
   e o que **não** será possível obter, com o porquê.
4. **Iniciar em paralelo, já nesta fase, os processos de aprovação** (criação
   dos apps, submissão de reviews, verificação de negócio). As aprovações são o
   caminho crítico do projeto — não a implementação.
5. **Aguardar a validação do usuário** sobre o documento de pesquisa antes de
   escrever código de integração.

## Fase 1 — Fundação: modelo, conexão e sincronização (Meta primeiro)

Ordem recomendada: **Meta → TikTok → Google Ads** (o developer token do Google
costuma ser a aprovação mais lenta). Implementar o padrão completo com uma
plataforma e replicar para as demais.

1. **Modelo de dados (Drizzle, `src/lib/db`; migrations via
   `npx drizzle-kit generate` — aplicar exige `DATABASE_URL_UNPOOLED`)**:
   - `ad_connections`: accountOwnerId, platform, externalAccountId,
     accountName, currency, timezone, status, scopes, tokens **cifrados em
     repouso (AES-256-GCM com `AD_TOKENS_ENCRYPTION_KEY`)**, connectedAt,
     lastSyncAt, lastError. Múltiplas conexões por plataforma são permitidas.
   - `ad_metrics_daily`: accountOwnerId, connectionId, platform, adAccountId,
     date, campaignId/campaignName (nullable), currency, spend, conversions,
     conversionValue, costPerConversion; unique(connectionId, date, campaignId).
   - Estado de sync por conexão (lastSyncAt, lastError) — nunca derivar do
     dado mais recente.
2. **OAuth oficial** (ex.: Business Login do Meta) com parâmetro `state`
   anti-CSRF, redirect URIs fixas por ambiente, renovação de refresh token e
   tratamento de revogação. Rotas connect / callback / disconnect / list com
   `guard({ csrf: true, role: "manage", paid: true })` + rate limit. O cliente
   escolhe qual conta de anúncios conectar.
3. **Sincronização**: nova task no módulo cron **existente**
   (`src/lib/cron-tasks`, protegido por CRON_SECRET em `src/app/api/cron`).
   Janela móvel: re-buscar os últimos 7+ dias e sobrescrever (upsert
   idempotente), porque os números mudam retroativamente. Backoff respeitando
   rate limits de cada API. Botão "sincronizar agora" no dashboard com rate
   limit próprio. Sem sync recente, exibir lastSyncAt — nunca dado fictício.
4. **Segurança**: módulos novos com `import "server-only"` + entradas em
   `tests/server-boundary.test.ts`; tokens nunca em logs, respostas de API,
   frontend ou embed; novos secrets (`META_APP_ID`, `META_APP_SECRET`,
   `AD_TOKENS_ENCRYPTION_KEY`, etc.) documentados em `docs/SECURITY.md`;
   toda query filtra por `accountOwnerId` da sessão; checklist de nova
   funcionalidade de `docs/ARCHITECTURE.md` aplicado.
5. Ao desconectar: parar o sync, **remover os tokens** e manter o histórico já
   sincronizado (dado agregado do próprio cliente).

## Fase 2 — Dashboard: camada "reportado pela plataforma"

1. **Settings**: seção "Anúncios" — conectar/desconectar por plataforma,
   status da conexão, última sincronização, erros com ação clara
   (token revogado → CTA reconectar; sem permissão → mensagem explicando;
   conectado sem dados → orientar sobre o tracking de conversão do cliente).
2. **Dashboard** (estender `/dashboard/conversions` ou seção claramente
   separada): manter as métricas internas do player **intactas** e adicionar
   bloco distinto "Vendas reportadas pelas plataformas" com, por plataforma:
   - Compras/conversões reportadas (número);
   - Valor de conversão reportado (com moeda);
   - Custo por conversão;
   - Investimento em anúncios;
   - Período consultado e horário da última atualização.
3. **Rótulos de honestidade obrigatórios**: "reportado por {plataforma}"
   (nunca "pagamento confirmado"); nota de que dias recentes são provisórios;
   fuso horário = o da conta de anúncios.
4. **Não cruzar fontes**: não derivar indicadores combinando métricas internas
   do player com métricas externas (ex.: proibido "conversão do vídeo" =
   vendas do Meta ÷ plays da Prisma). ROAS e CPA só dentro da mesma fonte.
5. Manter "Compras atribuídas" (internas) **visualmente distinto** de
   "compras reportadas" (externas), para o usuário não somá-las mentalmente.

## Fases 3 e 4 — TikTok e Google Ads

Replicar o padrão da Fase 1 (conexão, sync, dashboard) por plataforma, com as
particularidades documentadas na pesquisa (escopos, developer token, contas de
teste/sandbox de cada plataforma). Testar cada integração em sandbox/conta de
teste antes de produção.

## Fase 5 (opcional — exige autorização explícita) — Vínculo campanha↔vídeo

Somente se autorizado: permitir vincular campanhas a vídeos nas configurações
e exibir métricas por vídeo **sempre rotuladas como "atribuição da plataforma à
campanha vinculada"** (continua sendo dado reportado, não verificado pela
Prisma). Sem vínculo configurado, não exibir nada por vídeo.

## Restrições

- Não criar novo sistema de eventos do player; não criar
  `PrismaPlayer.trackConversion()`.
- Não exigir scripts da Prisma na página de vendas ou na página de obrigado.
- Não criar integrações com gateways de pagamento nesta etapa.
- Não simular vendas nem métricas; não preencher lacunas com estimativas.
- Não **enviar** eventos às plataformas nesta feature (isso é responsabilidade
  do sistema existente `services/ads/server-events`, intocável).
- A configuração de um ID de pixel, sozinha, **não** dá acesso a relatórios
  privados — dados de relatório exigem OAuth.
- Não expor credenciais/tokens no frontend, no embed, em logs ou em respostas
  de API.
- Preservar arquitetura, `guard()`, design system, tokens de cor e padrões de
  segurança existentes.

## Critérios de aceitação

1. Conta conectada + período selecionado → dashboard exibe compras, valor,
   CPA, investimento, moeda, última sync, com rótulo "reportado por
   {plataforma}".
2. Sync agendado idempotente re-processa janela móvel de 7+ dias; dias
   recentes marcados como provisórios na UI.
3. Token revogado → estado de erro com CTA reconectar, sem crash; sem conexão
   → estado vazio com CTA "Conectar plataforma".
4. Nenhum token em payload, log, frontend ou embed;
   `tests/server-boundary.test.ts` atualizado e passando.
5. Testes: rotas respondendo 401/403/CSRF no padrão de `tests/idor-paywall.test.ts`;
   sync com fetch mockado (vitest) cobrindo backoff e upsert idempotente.
6. Regressão zero nas métricas internas do player em `/dashboard/conversions`.
7. `npm run verify` + `npm run build` passando.

## Entregas

- `docs/ads-metrics-research.md` — respostas da Fase 0, por plataforma:
  métricas, permissões, aprovações, limitações e o que não será possível obter.
- Migrations Drizzle + módulos server-only + rotas guardadas + task de cron.
- UI: settings de conexões + camada de dashboard com todos os estados
  (vazio, carregando, erro, desconectado, sem permissão, sem dados).
- `docs/SECURITY.md` atualizado com os novos secrets.
- Documentação final das limitações de cada API.
