# Runbook de Resposta a Incidentes de Segurança

**Versão**: v1 - 23/10/2026 (modo preparatório: nenhum incidente conhecido até esta data) · **Fundamento**: **Art. 48 LGPD** (comunicação de incidente) + **Resolução CD/ANPD nº 15/2024 (RCIS)**.
**Quem decide**: o ENCARREGADO (com o dono). A detecção entra pelos canais abaixo; a decisão de notificar é sempre documentada por escrito (Art. 10: registro obrigatório de TODOS os incidentes, notificados ou não, por **5 anos**).

## Detecção (canais existentes no produto)

| Canal | O que cobre | Evidência |
|---|---|---|
| `alertOperations` (webhook privado) | Falhas silenciosas de billing/webhook/risk/exclusão | `src/lib/security/alert-webhook.ts` (contrato: fire-and-forget, REDACT de segredos) |
| `security_events` | Login falho, tentativa de exclusão negada, suspensão | `src/lib/security/auth-events.ts` |
| Logs de plataforma (Vercel) | Erros 5xx, exceções de rotas | Dashboard Vercel |
| Denúncia externa (titular, pesquisador) | Vazamentos percebidos fora | Canal privacidade@prismaplayer.com.br |

**Regra**: qualquer alerta desses canais que ENVOLVA dados pessoais aciona este runbook a partir da Hora 0.

## Critério de notificação (Res. 15/2024, Art. 5º - CUMULATIVO)

Notificar ANPD **se e somente se ambos**:

- **A. Risco ou dano relevante** aos interesses e direitos fundamentais dos titulares.
- **B. Pelo menos uma categoria envolvida**:
  - I. Dados pessoais sensíveis;
  - II. Dados de crianças, adolescentes ou idosos;
  - III. Dados financeiros;
  - IV. Dados de autenticação em sistemas;
  - V. Dados protegidos por sigilo legal, judicial ou profissional;
  - VI. Dados tratados em larga escala.

Se só A → decisão documentada internamente, sem notificação. Se nenhum → registrar mesmo assim (Art. 10).

## Prazos (não inventar, estão na Resolução)

| Ação | Prazo |
|---|---|
| Notificar a ANPD | **3 dias úteis** desde o conhecimento de que o incidente afetou dados pessoais (Art. 6º) |
| Notificar os titulares | **3 dias úteis**, 7 itens, linguagem simples (Art. 9º) |
| Complementar a comunicação à ANPD | Até 20 dias úteis após a inicial |
| Manter registro do incidente | **5 anos** (Art. 10) |
| Se ATPP (Res. 2/2022, Art. 14) | Prazos em dobro (6 dias úteis), salvo risco à integridade física/moral |

## Linha do tempo de execução

### T+0h - Detecção

1. Registrar timestamp EXATO do conhecimento da afetação a dados pessoais (marco legal do prazo de 3 dias úteis).
2. Acionar encarregado imediatamente.

### T+0h a T+4h - Contenção e triagem

- [ ] Isolar o sistema comprometido (ex.: desabilitar rota, revogar token, fechar acesso).
- [ ] Revogar secret comprometido e gerar novo (procedimento em `docs/SECURITY.md`).
- [ ] Preservar evidências: snapshots de logs, dumps, prints. NÃO destruir nada.
- [ ] Suspender propagação (bloquear rotas, rate limit emergencial).
- [ ] Comunicação interna em need-to-know.

### T+4h a T+24h - Avaliação

- [ ] Enumerar categorias de dados afetadas (mapear contra o data-map: A001 a A010).
- [ ] Estimar número e perfil de titulares afetados (destacar crianças/adolescentes/idosos).
- [ ] Causa raiz preliminar.
- [ ] Aplicar o teste cumulativo do Art. 5º (A e B) por ESCRITO, com justificativa.
- [ ] Decisão do encarregado: notificar ANPD? notificar titulares? Registrar a decisão mesmo que negativa.

### T+24h a T+72h (3 dias úteis) - Comunicação

**À ANPD, pelo portal eletrônico (https://www.gov.br/anpd) - 12 itens obrigatórios (Art. 6º, §2º):**

1. Natureza e categoria dos dados afetados;
2. Número de titulares afetados, discriminando crianças, adolescentes e idosos;
3. Medidas técnicas e de segurança adotadas antes e depois;
4. Riscos e possíveis impactos aos titulares;
5. Motivos da demora, se houver;
6. Medidas para reverter ou mitigar;
7. Data do incidente e data do conhecimento;
8. Dados do encarregado ou representante;
9. Identificação do controlador (declaração de ATPP se for o caso);
10. Identificação do operador envolvido;
11. Descrição do incidente com causa principal;
12. Total de titulares cujos dados são tratados nas atividades afetadas.

**Aos titulares - 7 itens (Art. 9º), linguagem simples, comunicação individualizada (e-mail/in-app):**

1. Natureza e categoria dos dados afetados;
2. Medidas de segurança técnicas;
3. Riscos;
4. Motivos da demora, se houver;
5. Medidas reversivas/mitigatórias;
6. Data do conhecimento;
7. Contato do encarregado.

Se a comunicação individual for inviável (volume + falta de contato): comunicação coletiva via site + imprensa por **mínimo 3 meses**.

### T+72h+ - Pós-incidente

- [ ] Forense e causa raiz (post-mortem com 5 whys).
- [ ] Atualizar [log.md](./log.md) com o registro completo.
- [ ] Plano de remediação com prazos e responsáveis (abrir vaga no gaps.md se for estrutural).
- [ ] Lições aprendidas: revisar este runbook.
- [ ] Complementar a ANPD em até 20 dias úteis se a investigação mudar fatos.

## Cenários prováveis para tabletop (1x por ano, cronometrar; > 3 dias úteis = processo quebrado)

1. Endpoint expondo dados de outra conta (IDOR regressivo) - categorias IV (autenticação) ou III.
2. Secret commitado publicamente (STRIPE_SECRET_KEY, EMBED_ORIGIN_SECRET) - categoria IV.
3. Comprometimento de operador (Neon/Stripe) - Art. 48 alcança o controlador mesmo quando o incidente é no provedor.
4. Pipeline de analytics vazando PII para o PostHog (ex.: page_url com e-mail) - revisar GAP-12.
5. Acesso indevido de admin interno (insider).
6. Exclusão de conta com falha parcial (storage errors) - resíduo documentado na resposta ao titular.

## Registro permanente (Art. 10 Res. 15/2024)

TODO incidente, notificado ou não, entra em [log.md](./log.md) e fica por **5 anos no mínimo**. O log é o primeiro item pedido numa fiscalização da RCIS.
