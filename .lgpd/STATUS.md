# LGPD Audit Status

**Projeto**: Prisma Player (Next.js, Drizzle/Neon, Stripe, Cloudflare R2)
**Cenário**: B - Legacy retrofit (sistema em produção auditado e retrofitado)
**Início**: 20/10/2026 (data-map + legal-basis) · **Última atualização**: 23/10/2026 (pipeline B completo)
**Encarregado**: pendente de designação (draft em [encarregado.md](./encarregado.md); Res. 18/2024)

## Pipeline atual (B)

- [x] L0 - Setup `.lgpd/` + STATUS.md
- [x] L1 - Gap analysis completo ([gaps.md](./gaps.md): 5 P1, 5 P2, 3 P3 + plano de remediação)
- [x] L2 - ROPA reverso do código ([ROPA.md](./ROPA.md); Art. 37) - reaproveitado do data-map v1 (10 atividades)
- [x] L3 - Base legal retroativa ([legal-basis.md](./legal-basis.md), v1 20/10/2026, reaproveitado sem rework)
- [x] L4 - Vendors + DPA ([vendors.md](./vendors.md): 6 operadores + 3 plataformas de ads dos clientes)
- [x] L5 - Retenção ([retention.md](./retention.md): proposta 180 dias eventos; purges seguem OFF por decisão do dono)
- [x] L6 - Anonimização ([anonymization.md](./anonymization.md): eventos são pseudonimizados, NÃO anônimos)
- [x] L7 - DSAR ([dsar/workflow.md](./dsar/workflow.md) + FIX-02 no export)
- [x] L8 - Incidentes ([incidents/runbook.md](./incidents/runbook.md) + [incidents/log.md](./incidents/log.md); Art. 48 + Res. 15/2024)
- [ ] L9 - Política de privacidade - **CHECKPOINT DO DONO** (não gerada por regra; exige revisão jurídica; GAP-01, Art. 9º)
- [x] L10 - ECA Digital ([eca-digital.md](./eca-digital.md): avaliação honesta; app B2B 18+, embed em zona de atenção)
- [ ] L11 - RIPD - **N/A nesta rodada** (nenhuma atividade atinge alto risco hoje; gatilhos de reavaliação documentados em anonymization.md)
- [x] L12 - Encarregado ([encarregado.md](./encarregado.md): draft de designação, decisão do dono)
- [x] L13 - STATUS final + plano de remediação (este arquivo + gaps.md)

## Artefatos gerados

| Arquivo | Conteúdo | Status |
|---|---|---|
| [data-map.md](./data-map.md) | 10 atividades de tratamento (inventário reverso, arquivo:linha) | v1, 20/10/2026 (reaproveitado) |
| [legal-basis.md](./legal-basis.md) | Bases legais Art. 7º/11 por atividade, com LIA inline | v1, 20/10/2026 (reaproveitado) |
| [gaps.md](./gaps.md) | 13 gaps priorizados P1/P2/P3 + 4 corrigidos + plano de remediação | v1, 23/10/2026 |
| [ROPA.md](./ROPA.md) | Registro de operações (Art. 37) | v1, 23/10/2026 |
| [vendors.md](./vendors.md) | Operadores, DPA, transferências (Art. 33, Res. 19/2024) | v1, 23/10/2026 |
| [retention.md](./retention.md) | Retenção por categoria + mecanismo de eliminação (Arts. 15-16) | v1, 23/10/2026 |
| [anonymization.md](./anonymization.md) | Estado pseudônimo vs anônimo + recomendações (Art. 5º XI, XII) | v1, 23/10/2026 |
| [dsar/workflow.md](./dsar/workflow.md) | 9 direitos, canais, SLA 15 dias (Art. 18-19) | v1, 23/10/2026 |
| [incidents/runbook.md](./incidents/runbook.md) | Runbook Art. 48 + Res. 15/2024 (3 dias úteis, 12 itens ANPD, 7 itens titular) | v1, 23/10/2026 |
| [incidents/log.md](./incidents/log.md) | Registro de incidentes por 5 anos (Art. 10 Res. 15/2024) | vazio (nenhum incidente) |
| [eca-digital.md](./eca-digital.md) | Avaliação Lei 15.211/2025 (app B2B; embed monitorar) | v1, 23/10/2026 |
| [encarregado.md](./encarregado.md) | Draft de designação (Res. 18/2024) | aguardando decisão |

## Correções de código desta rodada (verificadas: tsc 0, vitest, lint)

1. **`src/app/api/account/delete/route.ts`**: assinatura Stripe viva é cancelada ANTES do wipe (Art. 18, VI sem cobrança póstuma; boa-fé Art. 6º). Falha de cancelamento bloqueia a exclusão (fail-closed) e alerta ops via `alertOperations`.
2. **`src/app/api/account/export/route.ts`**: export inclui equipes, convites, checkouts, pesquisas de churn e nota sobre dados em operadores (PostHog/Stripe) com link para `/privacy` (Art. 18, II e V).
3. Testes novos: `tests/account-delete-route.test.ts` e `tests/account-export-route.test.ts` (padrão fake-db + mock stripe).

## Gaps abertos

Ver [gaps.md](./gaps.md). Top 5 P1: política com placeholders (Art. 9º), encarregado não publicado (Art. 41/Res. 18/2024), purges OFF (Art. 15), e-mail no identify do PostHog (Art. 33 + Res. 19/2024), retenção fiscal a decidir (Art. 16).

## Decisões que ficam com o dono (checkpoint)

1. **Encarregado**: nomear (opções em encarregado.md) e publicar em destaque (Res. 18/2024).
2. **Política de privacidade**: preencher placeholders, revisão jurídica, publicar (Art. 9º). A auditoria não publica por regra de checkpoint.
3. **Purges ON/OFF**: ligar envs de retenção em produção (retention.md) - decisão de produto, afeta analytics de clientes.
4. **Jurídico/contador**: classificação ATPP (Res. 2/2022), retenção fiscal de billing (Art. 16), cláusulas com clientes (Art. 39), DPAs/SCCs (Res. 19/2024).

## Próximo passo

Executar o plano de remediação em [gaps.md](./gaps.md) na ordem 1-11 (encarregado primeiro; envs de retenção em 1 semana). Nenhum passo adicional de automação é exigido para fechar a rodada B: o restante é decisão/gestão, não código.
