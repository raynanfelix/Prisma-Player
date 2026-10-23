# Operadores e Terceiros - Inventário e DPAs

**Versão**: v1 - 23/10/2026 · **Fundamento**: **Art. 39 LGPD** (operador trata por conta do controlador) + **Art. 33** (transferência internacional) + **Res. CD/ANPD nº 19/2024** (cláusulas-padrão brasileiras, Anexo II, adoção integral e sem alteração).
**Estado geral**: todos os operadores abaixo publicam DPA próprio, mas não há contratos assinados/arquivados pela Prisma nem evidência de adoção das SCCs brasileiras (GAP-07). Região de processamento e prazo de retenção de painel não verificados na maioria.

## Operadores de infraestrutura e serviço

### Neon (Auth gerenciada + Postgres/Lakebase)

| Campo | Valor |
|---|---|
| Papel | Operador (A001, A002 e todas as tabelas) |
| Dados | Contas de auth (e-mail, hash de senha), TODO o Postgres do produto |
| Transferência intl. | Sim - região do projeto Neon (verificar no painel se é US ou outro) |
| DPA | Publicado pela Neon; assinar/arquivar + Anexo II Res. 19/2024 |
| Pendências | Região do projeto; janela de PITR/backup (GAP-10); SCN/SCC arquivados |

### Vercel (hosting do app)

| Campo | Valor |
|---|---|
| Papel | Operador (processamento das rotas) |
| Dados | Tráfego transitório, logs de funções, env vars |
| Transferência intl. | Sim |
| DPA | Publicado pela Vercel; assinar/arquivar |
| Pendências | Confirmar região de compute e retenção de logs de request |

### Cloudflare (R2 + Worker/KV do embed)

| Campo | Valor |
|---|---|
| Papel | Operador (armazenamento de vídeos A010; cache de manifest) |
| Dados | Arquivos de vídeo dos clientes; config pública de players |
| Transferência intl. | Sim |
| DPA | Publicado pela Cloudflare; assinar/arquivar |
| Pendências | Nenhuma crítica (sem PII de espectador no manifest) |

### Stripe (pagamentos)

| Campo | Valor |
|---|---|
| Papel | Operadora de pagamentos; controladora independente dos próprios registros (fiscais/antifraude) |
| Dados | Customer, subscription, invoice, receipt; cartão/Pix NUNCA chegam à Prisma (Checkout hospedado) |
| Transferência intl. | Sim |
| DPA | Publicado pela Stripe; assinar/arquivar + Anexo II Res. 19/2024 |
| Pendências | Confirmar com contador se os recibos na Stripe bastam para a obrigação fiscal própria (GAP-05) |

### PostHog (product analytics)

| Campo | Valor |
|---|---|
| Papel | Operador (A007) |
| Dados | `user.id` + `email` no identify (remover e-mail: GAP-04), eventos de uso |
| Transferência intl. | Sim - região do projeto a verificar (PostHog oferece EU/US) |
| DPA | Publicado pelo PostHog; assinar/arquivar |
| Pendências | Região do projeto, retenção no painel, remoção do e-mail do identify, SCCs (GAP-04) |

### Resend (e-mail transacional)

| Campo | Valor |
|---|---|
| Papel | Operador (A009: relatórios operacionais) |
| Dados | Endereço de destinatário + conteúdo do relatório |
| Transferência intl. | Sim |
| DPA | Publicado pela Resend; assinar/arquivar |
| Pendências | Nenhuma crítica (conteúdo é métrica agregada) |

## Terceiros ativados pelos CLIENTES (a Prisma envia em nome do controlador cliente)

Estes recebem dados de ESPECTADORES quando o cliente ativa pixels e o espectador consente (A006). O consentimento é coletado pelo embed (`prisma-player:advertising-consent:v1`), gate duplo client/server. A relação contratual de ads é do CLIENTE com a plataforma; a Prisma atua como ferramenta do controlador cliente (**Art. 39**).

| Terceiro | Dados enviados com consentimento | Nota LGPD |
|---|---|---|
| Meta (CAPI) | IP de peer, user-agent, URL do evento, valor/ID da transação | Transferência intl. Art. 33; responsabilidade primária do cliente |
| TikTok (Events API) | Idem | Idem |
| Google (tag client-side) | Conversões client-side | Idem |

## Checklist do dono (GAP-07)

1. Baixar o DPA vigente de cada operador acima (Neon, Vercel, Cloudflare, Stripe, PostHog, Resend).
2. Assinar via dashboard (quando o fluxo for self-service) e arquivar PDF em `.lgpd/vendors/`.
3. Anexar as Cláusulas-Padrão Contratuais brasileiras (**Res. 19/2024, Anexo II, sem alteração**) quando o DPA do provedor não as cobrir.
4. Registrar região de processamento e retenção de cada um na tabela acima.
5. Revisar por evento: troca de provedor = nova linha + novo DPA.
