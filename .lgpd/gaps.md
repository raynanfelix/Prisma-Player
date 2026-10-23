# Gaps de Conformidade LGPD - Prisma Player

**Versão**: v1 - 23/10/2026 (auditoria Pipeline B, legacy retrofit; inventário real em [data-map.md](./data-map.md)).
**Priorização**: P1 (risco jurídico alto, agir primeiro), P2 (médio), P3 (baixo / observação).
**Regra da auditoria**: cada gap cita o artigo da LGPD ou a Resolução ANPD aplicável. Sem citação, não é recomendação.

## Resumo executivo

- 5 gaps P1, 5 gaps P2, 3 gaps P3.
- 4 não conformidades já corrigidas em código/documento nesta auditoria (seção "Corrigidos" abaixo).
- 4 decisões são do dono (não do agente): encarregado, política publicável, purges ON/OFF, retenção fiscal (ver [STATUS.md](./STATUS.md)).

## P1 - risco alto

### GAP-01 - Política de privacidade não está publicável (CHECKPOINT do dono)

- **O quê**: a página `/privacy` existe, mas o conteúdo legal tem placeholders não preenchidos (`[PREENCHER: RAZÃO SOCIAL]`, CNPJ, endereço) e não nomeia o encarregado. Publicar assim fere a transparência (elementos do Art. 9º).
- **Norma**: **Art. 9º LGPD** (direito de acesso a informações claras sobre o tratamento; os 7 elementos da política) + **Art. 6º, VII** (transparência).
- **Por que P1**: a política é o primeiro documento que a ANPD pede numa fiscalização (Res. 31/2025, fase 1: direitos dos titulares).
- **Ação**: preencher identificadores, revisar com advogado, versionar em `.lgpd/policies/privacy-policy-v{N}.md` e publicar. **Esta auditoria não gerou a política por regra de checkpoint** (exige revisão jurídica).
- **Responsável**: dono + revisão jurídica. **Esforço**: baixo (preencher) + custo da revisão.

### GAP-02 - Encarregado não designado formalmente nem publicado

- **O quê**: existe canal de privacidade (`privacidade@prismaplayer.com.br`, página `/contact`), mas não há nomeação formal publicada em destaque no site.
- **Norma**: **Art. 41 LGPD** (designação do encarregado) + **Res. CD/ANPD nº 18/2024** (divulgação obrigatória em destaque no sítio eletrônico; vedação de conflito de interesses, Art. 2º, II). Se a Prisma se enquadrar como agente de pequeno porte, a designação formal é dispensável, mas o canal publicado NÃO é (Res. 2/2022, Art. 11).
- **Ação**: decidir quem é o encarregado (draft pronto em [encarregado.md](./encarregado.md)), publicar nome/canal em `/privacy` e no rodapé do site.
- **Responsável**: dono (decisão). **Esforço**: baixo.

### GAP-03 - Purges de retenção são OPT-IN e estão desligados

- **O quê**: os jobs de purge existem (`src/lib/cron-tasks/tasks.ts:297-389`) mas só rodam com env explícita. Sem env, `video_events`, `player_events` e `security_events` crescem sem prazo de eliminação (viola o término do tratamento).
- **Norma**: **Art. 15 LGPD** (tratamento termina na exclusão ou no fim do prazo) + **Art. 6º, III** (necessidade) + **Art. 46, §2º** (privacy by design). Prazo concreto proposto em [retention.md](./retention.md).
- **Ação**: definir as envs de retenção em produção (proposta: eventos brutos 180 dias; payload de webhook scrub em 30 dias) e documentar a decisão. A flip é uma decisão do dono (pode afetar relatórios de clientes).
- **Responsável**: dono (decisão ON/OFF) + ops (configurar env). **Esforço**: baixo.

### GAP-04 - PostHog recebe e-mail no identify; transferência internacional não documentada

- **O quê**: `posthog.identify(user.id, { email })` no login/signup (`src/services/auth/client.ts:31,51`) envia e-mail a operador internacional. A região do projeto e o prazo de retenção no painel não estão definidos; não há evidência de adoção das cláusulas-padrão ANPD.
- **Norma**: **Art. 6º, III** (o e-mail não é necessário para analytics de produto) + **Art. 33** (transferência internacional) + **Res. CD/ANPD nº 19/2024** (cláusulas-padrão brasileiras do Anexo II; prazo de adoção contratual encerrou em ago/2025).
- **Ação**: (a) remover o `email` do identify (minimização); (b) definir região e retenção no painel PostHog; (c) verificar/assinar DPA + Anexo II da Res. 19/2024; (d) registrar tudo em [vendors.md](./vendors.md).
- **Responsável**: dono. **Esforço**: baixo no código (1 linha) + médio na papelada.

### GAP-05 - Retenção fiscal de billing pode conflitar com a eliminação total

- **O quê**: a exclusão de conta apaga `billing_checkouts`, `subscriptions` e ledger. Se houver obrigação fiscal de manter recibos (5 anos, CTN Arts. 173-174), a eliminação total pode remover prova contábil; se mantiver, precisa virar "bloqueio" e não uso.
- **Norma**: **Art. 16 LGPD** (dados usados só para guarda obrigatória ficam bloqueados) + **Art. 7º, II** (obrigação legal como base) + CDC Art. 27 (prescrição, 5 anos). Os recibos também existem na Stripe como controladora independente dos próprios registros.
- **Ação**: confirmar com o contador se a Prisma precisa reter registro próprio ou se basta acessar os dados na Stripe; se precisar, implementar retenção mínima bloqueada (não usada) com eliminação após o prazo.
- **Responsável**: dono + contador. **Esforço**: decisão; código médio se necessário.

## P2 - risco médio

### GAP-06 - DSAR fora do self-service sem SLA monitorado

- **O quê**: pedidos por e-mail/contato não têm trilha de registro, prazo nem plano de resposta. O prazo legal é **15 dias corridos** (Art. 19, II) ou 30 dias se enquadrado como ATPP (Res. 2/2022, Art. 14). A classificação ATPP (micro/EPP/startup até R$ 16M/ano) ainda não foi registrada.
- **Norma**: **Art. 18** (direitos do titular) + **Art. 19, II** + Res. 2/2022, Art. 14.
- **Ação**: operar o workflow de [dsar/workflow.md](./dsar/workflow.md): registrar cada pedido com data de chegada, prazo calculado e resposta enviada; classificar ATPP por escrito.
- **Responsável**: dono/encarregado. **Esforço**: baixo (processo manual documentado).

### GAP-07 - DPAs/SCCs com operadores não arquivados

- **O quê**: todos os operadores publicam DPA, mas não há evidência de contratos assinados nem adoção das cláusulas-padrão brasileiras onde aplicável.
- **Norma**: **Art. 33** (transferência internacional) + **Art. 39** (operador segue instruções do controlador; o instrumento é o contrato) + Res. 19/2024, Anexo II.
- **Ação**: baixar/assinar DPA de cada operador da lista em [vendors.md](./vendors.md), anexar as SCCs brasileiras (Anexo II, sem alteração) e arquivar em `.lgpd/vendors/`.
- **Responsável**: dono. **Esforço**: médio (papelada).

### GAP-08 - ECA Digital: avaliação formal pendente

- **O quê**: o app é B2B adulto, mas espectadores do embed podem incluir menores em landing pages de clientes. Não há contas de espectadores, nem perfilamento, nem ads direcionadas a eles; verificação de idade por acesso é inviável num player embed sem login.
- **Norma**: **Lei 15.211/2025 (ECA Digital)**, em vigor desde 17/03/2026, fiscalizada pela ANPD (Decreto 12.622/2025): aplica a plataformas direcionadas a menores OU de acesso provável (Arts. 9º, 22, 24); **Art. 14 LGPD** (dados de crianças: consentimento parental).
- **Ação**: registrar a avaliação honesta em [eca-digital.md](./eca-digital.md), manter termos 18+, cláusula contratual com clientes sobre audiência, e revisitar se houver evidência de audiência de menores em escala. Sanções: até 10% do faturamento ou R$ 10 a R$ 1.000 por usuário, limite R$ 50M (Art. 35, II).
- **Responsável**: dono. **Esforço**: baixo (documentar) / monitoramento contínuo.

### GAP-09 - Contrato com clientes: repasse controlador/operador

- **O quê**: para dados de espectadores o CLIENTE é controlador e a Prisma operadora (data-map A005/A006), mas os termos precisam dizer isso expressamente e repassar a idade da audiência e o conteúdo dos vídeos.
- **Norma**: **Art. 39 LGPD** (operador trata por conta do controlador, conforme o contrato) + **Art. 5º, VII**.
- **Ação**: revisar `/terms` com jurídico: cláusula de controlador/operador, proibição de campanhas direcionadas a menores, responsabilidade por conteúdo com dados pessoais.
- **Responsável**: dono + jurídico. **Esforço**: baixo/médio.

### GAP-10 - Backups gerenciados (Neon PITR) retêm dados eliminados

- **O quê**: a exclusão de conta apaga as linhas, mas o provedor gerencia backups/PITR; dados eliminados a pedido do titular podem persistir na janela de restauração do Neon até expirarem.
- **Norma**: **Art. 16** + **Art. 46** (medidas técnicas; documentar o prazo real de desaparecimento em backups).
- **Ação**: verificar no painel Neon a janela de PITR/backup do projeto e registrar o prazo em [retention.md](./retention.md); comunicar esse prazo ao titular nos pedidos de eliminação.
- **Responsável**: dono. **Esforço**: baixo (verificar e documentar).

## P3 - baixo / observação

### GAP-11 - Convites pendentes sobrevivem à exclusão da conta

- **O quê**: o DELETE remove convites aceitos pelo titular (`acceptedBy`), mas convites PENDENTES endereçados ao e-mail do titular permanecem até expirarem (7 dias, cron `expireTeamInvites`).
- **Norma**: **Art. 6º, III** (necessidade; o dado fica além do fim da relação, mas por prazo curto e determinado).
- **Ação**: estender o DELETE para também remover `account_team_invites` pendentes cujo e-mail case com o do titular excluído. Auto-resolve em 7 dias enquanto não é feito.
- **Responsável**: engenharia (backlog). **Esforço**: baixo.

### GAP-12 - page_url pode carregar PII de leads em query strings

- **O quê**: `page_url` é truncado a 1000 chars, mas não há scrub de padrões (e-mails/ids de lead) que clientes colocam em UTMs.
- **Norma**: **Art. 6º, III** (necessidade) + **Art. 5º, II** (dado pessoal é o que for, não só o previsto).
- **Ação**: monitorar; se aparecer PII recorrente, adicionar scrub de padrões no ingest e/ou cláusula nos termos proibindo PII em URLs rastreadas.
- **Responsável**: engenharia (backlog). **Esforço**: médio.

### GAP-13 - Sem toggle in-app de opt-out de product analytics

- **O quê**: o legítimo interesse do PostHog (A007) não tem opt-out no app; o caminho hoje é pedido direto ao encarregado.
- **Norma**: **Art. 7º, IX** + **Art. 10** (transparência do legítimo interesse) + **Art. 18, IX** (revogação).
- **Ação**: avaliar toggle "analytics de produto" nas preferências da conta (complementa a remoção do e-mail do GAP-04).
- **Responsável**: engenharia (backlog). **Esforço**: médio.

## Corrigidos nesta auditoria (23/10/2026)

- **FIX-01 - Delete de conta cancela assinatura Stripe viva antes do wipe** (`src/app/api/account/delete/route.ts`). Cobrança após o fim da relação violava a boa-fé (**Art. 6º**) e o CDC; o cancelamento antes do wipe garante **Art. 18, VI** sem efeito colateral financeiro. Testes em `tests/account-delete-route.test.ts`.
- **FIX-02 - Export DSAR completo** (`src/app/api/account/export/route.ts`): agora inclui participação em equipes, convites enviados, checkouts e pesquisas de churn (feedback é dado do titular), e nota sobre dados em operadores (PostHog/Stripe) com link para `/privacy`. **Art. 18, II e V** + **Art. 19, II**. Testes em `tests/account-export-route.test.ts`.
- **FIX-03 - ROPA criado** ([ROPA.md](./ROPA.md), **Art. 37**).
- **FIX-04 - Runbook de incidentes criado** ([incidents/runbook.md](./incidents/runbook.md) + [incidents/log.md](./incidents/log.md), **Art. 48** + **Res. 15/2024**: 3 dias úteis para ANPD e titulares; registro de todos os incidentes por 5 anos).

## Plano de remediação priorizado

| Ordem | Gap | Ação | Responsável | Prazo sugerido |
|---|---|---|---|---|
| 1 | GAP-02 | Nomear encarregado + publicar canal | dono | imediato |
| 2 | GAP-03 | Definir envs de retenção em produção | dono + ops | 1 semana |
| 3 | GAP-04 | Remover e-mail do identify + configurar PostHog | engenharia + dono | 1 semana |
| 4 | GAP-01 | Preencher + revisão jurídica + publicar política | dono + jurídico | 2 semanas |
| 5 | GAP-06 | Registrar classificação ATPP + operar workflow DSAR | encarregado | 2 semanas |
| 6 | GAP-05 | Decidir retenção fiscal com contador | dono + contador | 30 dias |
| 7 | GAP-07 | Arquivar DPAs + SCCs | dono | 30 dias |
| 8 | GAP-10 | Verificar PITR Neon e documentar | dono | 30 dias |
| 9 | GAP-08 | Registrar avaliação ECA Digital (feita) + monitorar | dono | contínuo |
| 10 | GAP-09 | Cláusulas nos termos com clientes | dono + jurídico | 60 dias |
| 11 | GAP-11/12/13 | Backlog de engenharia | engenharia | próximo ciclo |
