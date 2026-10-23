# DSAR - Workflow dos Direitos do Titular

**Versão**: v1 - 23/10/2026 · **Fundamento**: **Art. 18 LGPD** (9 direitos) + **Art. 19, II** (**15 dias corridos** para resposta completa; 30 dias se ATPP, Res. 2/2022, Art. 14) + **Art. 6º, III** (verificação de identidade não pode onerar o titular).
**Papel duplo**: para dados da CONTA, a Prisma é controladora e responde direto. Para dados de ESPECTADORES, o CLIENTE é controlador e a Prisma operadora (**Art. 39**): o pedido do espectador é encaminhado ao cliente, e a Prisma executa a parte técnica que o contrato definir.

## Os 9 direitos e onde estão hoje (estado real do código)

| # | Direito (Art. 18) | Como o titular exerce | Cobertura |
|---|---|---|---|
| I | Confirmação de existência de tratamento | `GET /api/account/export` devolve o dump ou 401 | Ok |
| II | Acesso aos dados | `GET /api/account/export` | Ok após fix desta auditoria (ver abaixo) |
| III | Correção | `PATCH /api/account/profile` (nome, telefone, locale, notificações) | Ok |
| IV | Anonimização/bloqueio/eliminação de dados desnecessários | Pedido ao encarregado (processo manual abaixo) | Manual |
| V | Portabilidade | `GET /api/account/export` (JSON estruturado, snake_case) | Ok após fix |
| VI | Eliminação | `POST /api/account/delete` (senha + "EXCLUIR"; cancela Stripe, R2, todas as tabelas, Neon Auth) | Ok após fix |
| VII | Informação sobre compartilhamento | Política `/privacy` + [vendors.md](../vendors.md) | Depende da publicação (GAP-01) |
| VIII | Informação sobre não consentir e consequências | Política `/privacy` + banner do embed | Depende da publicação (GAP-01) |
| IX | Revogação de consentimento | Player: `PrismaPlayer.setConsent(false)`/`resetConsent()` (localStorage `prisma-player:advertising-consent:v1`). App: preferências de e-mail no perfil | Ok; opt-out de product analytics pendente (GAP-13) |

## Export pós-fix (o que o dump contém desde 23/10/2026)

`GET /api/account/export` devolve JSON legível com: perfil, acesso/trial, assinatura, controles, créditos+ledger, vídeos (metadados), pastas, players, inbox, security_events (tipo+data) e, a partir do fix desta auditoria: **participação em equipes** (`teamMemberships`), **convites enviados** (`teamInvites`), **checkouts** (`billingCheckouts`), **pesquisas de churn** (`churnSurveys`; feedback é dado do titular, Art. 18, II) e **nota sobre dados em operadores** (`thirdPartyData`: PostHog/Stripe, com link para `/privacy`).

Eventos de ESPECTADORES não entram **por design**: titular dessa massa é o próprio espectador, controlador é o cliente; a exportação deles sairia pelo relatório de público do cliente.

## Canais de intake (3)

1. **Self-service autenticado** (canal primário): export/delete/profile dentro do app. Verificação de identidade: a sessão autenticada é suficiente (Art. 6º, III: não onerar).
2. **Canal do encarregado**: privacidade@prismaplayer.com.br (públicado em `/privacy` e `/contact`). Para titulares não logados ou espectadores.
3. **Suporte via app** (`support_cases`): qualquer pedido que chegue por aqui é reencaminhado ao encarregado no mesmo dia.

## Procedimento para pedidos fora do self-service

1. **Registro** (no dia): abrir entrada em `.lgpd/dsar/log.md` (abaixo) com data de chegada, titular identificado pelo mínimo necessário (e-mail da conta; NUNCA pedir documento para pedido simples, Art. 6º, III), direito invocado.
2. **Prazo**: calcular 15 dias corridos da chegada (Art. 19, II) ou 30 se classificado ATPP (Res. 2/2022, Art. 14). Registrar a data limite na entrada.
3. **Verificação** (se não autenticado): responder no próprio e-mail associado à conta; pedido de espectador: confirmar a VSL/player e encaminhar ao cliente controlador, oferecendo suporte técnico na execução (Art. 39).
4. **Execução**:
   - Acesso/portabilidade: gerar o export (self-service ou baixar com o algoritmo da rota) e entregar por canal seguro.
   - Correção: aplicar via profile ou SQL pontual; propagar a operadores quando aplicável.
   - Eliminação: rota `/api/account/delete` (titular autenticado) ou execução equivalente com o titular confirmado; documentar resíduos (backups GAP-10, operadores, convites GAP-11).
   - Anonimização/bloqueio (IV): avaliar caso a caso com a base legal da atividade; bloquear dado em guarda fiscal (Art. 16) e eliminar o resto.
   - Revogação de consentimento: orientar o uso do banner/`setConsent(false)` para publicidade; para product analytics, executar a exclusão dos dados na ferramenta (PostHog) e registrar.
5. **Resposta ao titular**: sempre por escrito, com o que foi feito, o que ficou retido e por quê (ex.: bloqueio fiscal, Art. 16), e o prazo real de desaparecimento em backups se conhecido.
6. **Trilha de auditoria**: manter registro de DSARs por 5 anos no mínimo (alinhado com Art. 10 da Res. 15/2024 para incidentes; prova de conformidade para dosimetria, Res. 4/2023: atenuante de governança).

## Log de pedidos (iniciar aqui)

```markdown
# Registro de DSARs

| ID | Chegou em | Titular (conta) | Direito (Art. 18) | Prazo (15d/30d) | Respondido em | Resumo |
|---|---|---|---|---|---|---|
| (nenhum pedido até 23/10/2026) | | | | | | |
```

## Gaps ligados a este workflow

- GAP-06: sem classificação ATPP registrada; sem trilha automática de prazos (processo manual acima cobre enquanto o volume é baixo).
- GAP-13: opt-out de product analytics in-app pendente.
- Espectadores: o fluxo depende de contrato com o cliente (GAP-09) para definir SLA de repasse.
