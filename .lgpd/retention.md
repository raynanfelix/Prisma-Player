# Política de Retenção e Eliminação

**Versão**: v1 - 23/10/2026 · **Fundamento**: **Art. 15 LGPD** (término do tratamento) + **Art. 16** (dados bloqueados por obrigação legal) + **Art. 18, VI** (eliminação a pedido) + **Art. 6º, III** (necessidade) + **Art. 46** (segurança e privacy by design).
**Estado real do código**: os purges existem no cron (`src/lib/cron-tasks/tasks.ts:297-389`) e são OPT-IN por env; sem env configurada, NADA é apagado (GAP-03). Os pisos de segurança (floors) já estão gravados no código: 30 dias para eventos, 7 dias para payload de webhook.

## Tabela de retenção por categoria

| Categoria | Onde | Prazo proposto | Mecanismo | Base |
|---|---|---|---|---|
| Dados da conta (perfil, auth, equipes, inbox, suporte, créditos, controles) | Várias tabelas | Até a exclusão da conta | `POST /api/account/delete` (hard delete em transação + Neon Auth + R2) | Art. 15, I; Art. 18, VI |
| Eventos de espectadores (brutos) | `video_events` | **180 dias** | Env `VIDEO_EVENTS_RETENTION_DAYS=180` (piso 30) | Art. 15, III; necessidade cumprida pelos rollups agregados |
| Eventos de player/A-B (brutos) | `player_events` | **180 dias** | Env `PLAYER_EVENTS_RETENTION_DAYS=180` (piso 30) | Idem |
| Eventos de segurança | `security_events` | **180 dias** | Env `SECURITY_EVENTS_RETENTION_DAYS=180` (piso 30) | Art. 15, III; prova de segurança não precisa ser eterna |
| Payload de webhook de pagamento | `payment_webhook_events.payload` | **Scrub em 30 dias** (piso 7; mantém metadados, apaga o blob) | Env `WEBHOOK_PAYLOAD_RETENTION_DAYS=30` | Art. 6º, III; idempotência não precisa do payload após o processamento |
| Sessões de vídeo ao vivo | `video_live_sessions` | 10 minutos | Cron `pruneVideoLiveSessions` (já automático) | Sem prazo extra |
| Convites de equipe | `account_team_invites` | 7 dias | Cron `expireTeamInvites` (já automático) | A003 do data-map |
| Rollups agregados | `video_daily_stats` | Até exclusão da conta | DELETE da conta | Agregados sem PII direta |
| Trilha admin pseudonimizada | `admin_audit_log` | Preservada | Exclusão de conta NÃO apaga (pseudonimizada) | Prova de integridade interna |
| Backups/PITR do Neon | Infra gerenciada | **7 dias** (janela de histórico do branch de produção, padrão do plano) | Instant restore do Neon (gerenciado; sem mecanismo próprio) | Art. 15/16 (eliminação se completa após a janela) + Art. 9 (transparência ao titular); GAP-10 fechado em 24/10/2026 |

## Por que 180 dias para eventos brutos

1. **Necessidade (Art. 6º, III)**: a análise de funil/retenção das VSLs dos clientes se resolve com janela de até 6 meses; além disso o valor está nos rollups agregados (`video_daily_stats`), que permanecem.
2. **Comparável ao Marco Civil**: logs de acesso a aplicações por aplicação internet têm piso legal de 6 meses (Lei 12.965/2014, Art. 15); os eventos de espectador são o análogo mais próximo e 180 dias iguala esse parâmetro normativo nacional.
3. **Proporcionalidade**: 12-24 meses (recomendação anterior em `docs/supabase-audit/recommendations.md`) segue válida como teto máximo; 180 dias é o ponto de partida mais defensável porque reduz exposição sem quebrar relatórios de clientes.

## Eliminação a pedido do titular (Art. 18, VI)

Fluxo REAL implementado no código (roteiro completo em [dsar/workflow.md](./dsar/workflow.md)):

1. `POST /api/account/delete` com senha + confirmação "EXCLUIR".
2. **Assinatura Stripe viva é cancelada ANTES do wipe** (fix desta auditoria): cobrança após o fim da relação violaria a boa-fé (Art. 6º) e o CDC.
3. R2: objetos de vídeo removidos (`deleteR2Object`); assets de player ficam como órfãos toleráveis (sem listagem R2; problema de custo, não de privacidade).
4. Transação: DELETE explícito de TODAS as tabelas de produto + `profiles`.
5. `DELETE FROM neon_auth."user"` encerra sessões e a identidade.
6. Resíduos conhecidos: backups/PITR do Neon (GAP-10), `admin_audit_log` pseudonimizado (por design), convites pendentes por e-mail por até 7 dias (GAP-11), dados em operadores (Stripe/PostHog: titular pede direto ao provedor; nota no export).

## Retenção obrigatória que NÃO podemos eliminar (Art. 16)

- **Fiscal (recibos/notas)**: 5 anos (CTN Arts. 173-174). Decisão pendente com contador (GAP-05): se a Prisma precisar de registro próprio, a tabela de billing vira "bloqueio + retenção" na exclusão de conta em vez de delete. Até lá, os recibos existem na Stripe como controladora independente.
- **Relação de consumo (CDC Art. 27)**: 5 anos para prescrição de reclamações.
- Durante esses prazos, se houver retenção: dado fica BLOQUEADO (só guarda, sem uso) e é eliminado ao expirar (Art. 16, parágrafo único).

## Decisões do dono

1. **Ligar os purges** (envs acima) em produção - é uma decisão de produto (afeta até 6 meses de dados brutos de analytics de clientes) e não foi feita por ser irreversível para relatórios antigos.
2. **Registrar a classificação ATPP** (Res. 2/2022): se micro/EPP/startup até R$ 16M/ano, prazos de titular dobram (30 dias) e incidentes têm 6 dias úteis.
3. **Confirmar com o contador** a necessidade de registro fiscal próprio (GAP-05).
4. ~~Verificar e documentar a janela de PITR/backup do Neon aqui (GAP-10)~~ **FECHADO (24/10/2026)**: janela padrão de 7 dias documentada na tabela acima. Decisão que resta (custo, não conformidade): estender a janela ou não.

## Nota de infraestrutura (24/10/2026, RLS real aplicada)

- **PITR de 7 dias e eliminação (Art. 15/16 + Art. 9)**: o branch de produção mantém 7 dias de histórico de restauração. Dados eliminados (inclusive por DSAR de exclusão de conta) podem permanecer recuperáveis dentro dessa janela de infraestrutura gerenciada; a eliminação se completa com a expiração da janela. Este ponto é divulgado ao titular como transparência (Art. 9) e listado como resíduo conhecido do fluxo DSAR.
- **RLS real em produção (Art. 46, segurança)**: em 24/10/2026 foram aplicadas as 126 policies de `docs/neon-migration/neon-schema.sql` e criado o papel `authenticated` (NOLOGIN). Estado de segurança: deny-all para qualquer conexão não-owner sem claim; provado com SET ROLE (relatório em `docs/reports/NEON_RLS_APPLY.md`). O app conecta como owner com BYPASSRLS e mantém o filtro `accountOwnerId` como primeira camada.
- **Purges de eventos seguem OPT-IN (GAP-03)**: `VIDEO_EVENTS_RETENTION_DAYS` (proposta: 180) e demais envs de retenção continuam pendentes de definição na Vercel, decisão do dono.
