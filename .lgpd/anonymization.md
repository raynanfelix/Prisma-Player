# Anonimização e Pseudonimização - Estado e Recomendações

**Versão**: v1 - 23/10/2026 · **Fundamento**: **Art. 5º, XI e XII LGPD** (dado anonimizado é aquele que não pode ser revertido por meios técnicos razoáveis; dado anonimizado sai do escopo, **Art. 12**) + **Art. 13, §4º** (pseudonimização continua sendo dado pessoal) + **Art. 6º, III** (necessidade).
**Escopo**: pipelines de analytics do produto (A005: espectadores; A007: product analytics). Não há hoje dataset publicado externamente.

## Estado atual (verificado no código)

### Analytics de espectadores (A005)

| Medida | Estado | Evidência |
|---|---|---|
| IP do espectador | **NÃO persistido** (usado transitoriamente para o CAPI e descartado) | `src/lib/analytics/ingest.ts:149-157` |
| Identificadores | `session_id` (uuid por sessão) e `viewer_id` (pseudônimo de atribuição) | `drizzle/schema.ts:186-286` |
| Localização | Só `country_code` (2 letras), sem cidade/CEP | Idem |
| URL | `page_url` truncado a 1000 chars, sem parser de PII (GAP-12) | Data-map A005 |
| Rollups | `video_daily_stats` é agregado por dia/vídeo (sem identificador de indivíduo) | Data-map A005 |
| Sessões vivas | `video_live_sessions` podadas após 10 min | Cron `pruneVideoLiveSessions` |

**Classificação honesta**: `video_events`/`player_events` são **pseudonimizados, NÃO anonimizados** (Art. 13, §4º): `session_id`/`viewer_id` + `page_url` + transação podem singling out um indivíduo em dataset pequeno. Continuam sendo dado pessoal no escopo da LGPD.

### Product analytics (A007)

`posthog.identify(user.id, { email })` usa identificador determinístico (id da conta) + e-mail. É dado pessoal pleno, transferido a operador internacional (GAP-04).

## Recomendações (cada uma com base normativa)

1. **Remover o `email` do identify do PostHog** (GAP-04). O `user.id` interno basta para funil de produto. Base: minimização (**Art. 6º, III**). Esforço: 1 linha em `src/services/auth/client.ts`.
2. **Manter os dashboards alimentados por rollups** (`video_daily_stats`) e consumir eventos brutos só em janela curta; ligar os purges de 180 dias ([retention.md](./retention.md)). Base: necessidade + término do tratamento (**Art. 15**).
3. **Tratar `page_url` como campo de risco**: monitorar presença de PII (e-mails/ids de lead) em query strings; se aparecer, adicionar scrub de padrões no ingest (regex de e-mail) ou cláusula contratual proibindo PII em URLs rastreadas (GAP-12). Base: **Art. 6º, III**.
4. **Não rotular `viewer_id` de "anonimização" em material público** (a distinção importa juridicamente: Art. 5º, XI vs Art. 13, §4º). Na comunicação de marketing/documentação, dizer "pseudonimizado".
5. **Se um dia publicar datasets agregados externamente**: antes de declarar anonimização, passar pelo teste de re-identificação (linkage, inference, singling out) da skill `lgpd-anonymization`; k-anonimidade k>=5 como piso para quase-identificadores. Hoje não há dataset público, então não há obrigação prática, apenas o procedimento futuro.
6. **RIPD (Art. 38)**: as atividades atuais não são alto risco (Res. 2/2022, Art. 4º: sem larga escala, sem sensíveis, sem decisões automatizadas com efeito material, sem vigilância pública). Reavaliar se: (a) volume passar de 2 milhões de titulares afetados numa atividade, ou (b) `risk_score` antifraude passar a bloquear automaticamente espectadores/contas com efeito relevante para o titular (decisão automatizada).

## Riscos residuais aceitos

- Eventos brutos pseudonimizados retidos por prazo indeterminado enquanto os purges seguem desligados (GAP-03) - mitigável por configuração, não por código.
- `viewer_id` é determinístico por dispositivo/navegador (atribuição de conversão); é necessária para o produto (deduplicação de funil), mas mantém o tratamento no escopo LGPD - a resposta é purge curto, não promessa de anonimato.
