# Projeções de escala (Equipe F — HIPÓTESES explícitas, não fatos)

Base de cálculo (derivada do código, não medida): view completa ≈ 6 linhas
`video_events`; sessão ativa ≈ 1 linha `video_live_sessions`; linha média
`video_events` ≈ 300B + índices (ESTIMATIVA estrutural, validar em Q2).
Hipóteses de uso: ativo = 20% dos cadastrados; views/mês por ativo: 50
(1k) / 80 (10k) / 100 (100k) — funil VSL típico, ajustar com dados reais.

| Cenário | Ativos | Views/mês | Linhas eventos/mês | Tamanho novo/mês* | Acúmulo 12m* |
|---|---|---|---|---|---|
| 1.000 users | 200 | 10.000 | ~60 mil | ~25 MB | ~0,3 GB |
| 10.000 users | 2.000 | 160.000 | ~1,0 M | ~0,4 GB | ~5 GB |
| 100.000 users | 20.000 | 2.000.000 | ~12 M | ~5 GB | ~60 GB |

\* Sem retenção; com índices (~2x). `player_events`, webhooks, ledger e
security somam <10% sobre isso (ESTIMATIVA).

Leituras críticas por escala: cron/conta explode com vídeos×contas
(~3500 ops no teto de 500 vídeos — fragmentar por sharding de contas ou
fatia de vídeos); listas 50k/100k em JS estouram memória serverless antes
de 10k ativos (P2-3); rate-limit 1 RPC/request vira gargalo de escrita
antes de 100k (P3 Redis). Storage/R2 escala linear com uploads (quotas já
freiam por plano). Egress dominante: plays (fora do Postgres).
