# Bases Legais por Atividade de Tratamento — Prisma Player

**Última atualização**: 20/10/2026 (inventário reverso do código — ver [data-map.md](./data-map.md)).
**Lei**: LGPD, Lei 13.709/2018. Cada entrada cita o artigo; alteração de finalidade exige reavaliação da base e novo aviso ao titular (Art. 9º, § 2º).
**Nota de escopo**: este é o documento técnico de bases legais; LIA resumida inline nos casos de legítimo interesse (o template completo fica em `.agents/skills/lgpd-legal-basis/assets/lia-template.md` e deve ser revisado pelo dono).

## Conta e autenticação

- **Atividade**: A001 — criação de conta, login, sessões.
- **Finalidade**: autenticar o titular e manter a sessão do app.
- **Dados**: e-mail, hash de senha (custody do Neon Auth), cookies de sessão.
- **Sensíveis?**: Não.
- **Base legal**: **Art. 7º, V — execução de contrato** (prestação do serviço contratado pelo titular). Não cabe consentimento: sem autenticação não há contrato; login por senha é o pedido do próprio titular.
- **Revogação possível?**: eliminação da conta encerra o tratamento (`POST /api/account/delete`).
- **Última revisão**: 20/10/2026.

## Perfil da conta

- **Atividade**: A002 — perfil (`profiles`).
- **Finalidade**: identificar o titular, contato operacional e preferências de notificação.
- **Dados**: e-mail, nome, telefone, avatar, `stripe_customer_id`, preferências.
- **Sensíveis?**: Não.
- **Base legal**: **Art. 7º, V — execução de contrato**. Os campos são necessários para prestar e comunicar o serviço; notificações por e-mail têm toggle no próprio perfil (opt-out do titular sobre a comunicação, sem afetar a base do contrato).
- **Última revisão**: 20/10/2026.

## Equipes e convites

- **Atividade**: A003 — `account_teams`/`account_team_members`/`account_team_invites`.
- **Finalidade**: colaboração na conta do cliente; papéis e assentos do plano.
- **Dados**: e-mail do convidado, papel, status, expiração.
- **Sensíveis?**: Não.
- **Base legal**: 
  - **Membros ativos: Art. 7º, V** — execução do contrato de equipe que o titular aceitou.
  - **E-mail do CONVIDADO (terceiro): Art. 7º, IX — legítimo interesse**, com LIA:
    - *Interesse*: permitir que o cliente convidado adira à equipe que o próprio invitante declara.
    - *Necessidade*: só o e-mail é tratado; o convite fica pendente, **não há envio de e-mail** (Neon Auth não expõe API de convite — `src/lib/account/team.ts:378-388`), expira em 7 dias e é revogável.
    - *Balanceamento/expectativa*: pessoa que recebe convite de negócio espera que seu e-mail seja usado para viabilizar o convite; a entrada só acontece se ela MESMA criar conta e aceitar (opt-in efetivo). Sem perfil de terceiro exposto sem aceite.
  - **Alternativa descartada**: Art. 7º, V "pré-contratual a pedido do titular" não cabe — o pedido é do invitante, não do convidado.
- **Revogação**: convite revogável pelo invitante; convidado pode ignorar (expira sozinho).
- **Última revisão**: 20/10/2026.

## Assinaturas e pagamentos

- **Atividade**: A004 — billing Stripe/checkout/webhooks.
- **Finalidade**: cobrar a assinatura (mensal/anual) e os créditos IA contratados.
- **Dados**: `stripe_customer_id`, ids de subscription, status, período, payloads de evento (idempotência), `receipt_url`.
- **Sensíveis?**: Não (cartão/Pix ficam só na Stripe — Checkout hospedado; a Prisma não vê instrumento de pagamento).
- **Base legal**: **Art. 7º, V — execução de contrato**. A cobrança é o objeto do contrato.
- **Obrigações acessórias**: fiscal/contábil dos recibos pode sustentar Art. 7º, II para eventual retenção contábil mínima — **a definir com o contador (pendência)**.
- **Retenção**: linha da assinatura até exclusão; payload de webhook com scrub ≥7 dias (cron).
- **Última revisão**: 20/10/2026.

## Analytics de espectadores

- **Atividade**: A005 — `video_events`, `video_live_sessions`, `player_events`.
- **Finalidade**: medir retenção, atenção e conversão das VSLs para o CLIENTE (controlador desses dados; a Prisma é operadora).
- **Dados**: session/viewer pseudônimos, país (2 letras), device/os/browser, `page_url` + UTMs, tempo assistido, risco anti-fraude, transação de conversão. **IP não é persistido.**
- **Sensíveis?**: Não.
- **Base legal**: **Art. 7º, IX — legítimo interesse do controlador (cliente)**, com LIA:
  - *Interesse*: produto de analytics é o próprio serviço contratado pelo cliente; métricas agregadas de retenção/funil.
  - *Necessidade/minimização*: pseudonimização por `session_id`/`viewer_id`, país em vez de geolocalização, sem IP armazenado, `page_url` truncado.
  - *Balanceamento*: espectador de VSL comercial espera contagem de visualização; sem profiling individual disponível ao público; purges de retenção disponíveis por env.
  - *Transparência*: o embed publica aviso de privacidade (banner) e o cliente é quem configura a política do player.
  - **Alternativa recomendada a médio prazo**: anonimização/agregação definitiva em `video_daily_stats` + purge dos eventos brutos — retira o tratamento do escopo da LGPD (Art. 5º, XII seria caminho, mas só após o purge funcionar por padrão).
- **Revogação**: espectador não tem vínculo; o CLIENTE controla a coleta (despublicar o player). Retenção curta recomendada (12–24 meses máx.).
- **Última revisão**: 20/10/2026.

## Publicidade e conversão

- **Atividade**: A006 — Meta CAPI, TikTok Events API e pixels client-side no embed.
- **Finalidade**: atribuir vendas às campanhas de anúncio do cliente.
- **Dados**: IP de peer da plataforma, user-agent, URL da página, valor/moeda/id da transação.
- **Sensíveis?**: Não.
- **Base legal**: **Art. 7º, I — consentimento** do espectador. Banner opt-in específico para publicidade no embed (`prisma-player:advertising-consent:v1`), aceitar/recusar em paridade, revogável a qualquer momento (`setConsent`/`resetConsent`), estado consultável (`getConsent`). Gate duplo: client-side (eventos só saem com `granted`) e server-side (`if (event.advertisingConsent)` — `src/lib/analytics/ingest.ts:303`).
- **Por que consentimento e não legítimo interesse**: marketing direto com compartilhamento de identificador técnico (IP) com plataformas de anúncio em nome do CLIENTE; a cláusula de segurança do Art. 10 não é uma carta branca, e o banner já existe — a rota mais conservadora e alinhada ao Art. 9º é manter opt-in específico por finalidade.
- **Transferência internacional**: Meta/TikTok/Google (EUA) — **pendência: avaliar transferência à luz das Resoluções do TJD/ANPD aplicáveis**.
- **Última revisão**: 20/10/2026.

## Product analytics (PostHog)

- **Atividade**: A007 — telemetria de produto.
- **Finalidade**: entender uso e falhas do produto (onboarding, upload, trial).
- **Dados**: `user.id` + `email` no identify, eventos de uso (upload, login, ativação).
- **Sensíveis?**: Não.
- **Base legal**: **Art. 7º, IX — legítimo interesse**, com LIA:
  - *Interesse*: melhorar o produto que o titular contratou.
  - *Necessidade*: eventos de uso; **o `email` no identify é discutível — recomendado remover (pendência)**, mantendo apenas o id interno.
  - *Balanceamento*: dados agregados, sem profiling sensível; titular pode pedir exclusão.
  - *Opt-out*: ainda não há toggle de product analytics no app (**pendência** — hoje o caminho é o pedido direto ao dono).
- **Última revisão**: 20/10/2026.

## Segurança e auditoria

- **Atividade**: A008 — `security_events`, rate limiting, trilhas de auth.
- **Finalidade**: prevenção a fraude e abuso, integridade da plataforma.
- **Dados**: user_id, tipo de evento, metadata sanitizada; IP só em memória (rate limit).
- **Sensíveis?**: Não.
- **Base legal**: **Art. 7º, IX — legítimo interesse** (segurança da plataforma e dos próprios titulares) — precedente direto do Art. 11, II, "g" aplicado ao análogo de dados comuns; sem isso o serviço não se protege.
- **Retenção**: purge OPT-IN ≥30 dias — **definir prazo (pendência)**.
- **Última revisão**: 20/10/2026.

## Créditos IA, inbox, suporte e relatórios

- **Atividade**: A009 — carteira/ledger de créditos, inbox, casos de suporte, relatórios por e-mail.
- **Finalidade**: executar o que foi contratado (créditos, comunicação da conta, suporte, relatório periódico).
- **Dados**: saldo e movimentos de créditos, mensagens do sistema e do titular, e-mail de relatório escolhido pelo próprio titular.
- **Sensíveis?**: Não. (Análises de IA operam sobre o VÍDEO do cliente — conteúdo, não dado pessoal do titular da conta.)
- **Base legal**: **Art. 7º, V — execução de contrato**. O e-mail de relatório é fornecido voluntariamente pelo titular para a feature contratada.
- **Operador**: Resend (transacional) — transferência internacional.
- **Última revisão**: 20/10/2026.

## Conteúdo hospedado

- **Atividade**: A010 — vídeos em Cloudflare R2 + manifest do embed (KV/Worker).
- **Finalidade**: armazenar e servir as VSLs contratadas.
- **Dados**: arquivos de vídeo do cliente; manifest público de player (config, sem PII de espectador).
- **Sensíveis?**: Não por origem; **se o cliente gravar dados pessoais dentro do vídeo (ex.: depoimento), a base é do CLIENTE** — termos de uso devem repassar essa responsabilidade (pendência dos termos).
- **Base legal**: **Art. 7º, V — execução de contrato**.
- **Última revisão**: 20/10/2026.
