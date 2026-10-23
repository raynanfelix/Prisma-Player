# Mapa de leitura e consumo (Equipe C, somente leitura)

## Direto ao Supabase pelo browser: AUSENTE
Zero `createBrowserClient`, Realtime (`channel/subscribe` = 0 hits),
`*.supabase.co` no client. Tudo via `/api/*` (`fetch`, `credentials:
same-origin`, `apiRequest`). Nenhum `"use client"` importa `@/lib/supabase/*`.

## Carga por embed (sequencial)
`player-loader` (public, max-age=0) → `/embed/:id` HTML (force-dynamic,
minta originToken) → `GET /api/embed/:id` (no-store) → mídia em paralelo
(source R2 assinado 900s + poster/headline/captions; pause/end só sob
demanda) + batch analytics (5s ou 10 eventos; heartbeat 15s só playing) +
A/B (`ab-tests` bloqueante + `ab-events` imediato). Manifest existe mas só o
Worker o chama. Sem polling de "ao vivo" (live vem embutido no analytics;
`live-logs` sem chamador — morto aparente).

## Telas do produto
- `videos`: `GET /api/videos` + `folders` no mount e a cada upload; lista
  gera 30 signed URLs mesmo sem preview (só Editar usa).
- `analytics`: `GET /api/videos` + `GET /api/analytics/:id?days=` por troca
  de vídeo/período/refresh; IA sob demanda.
- `inbox`/`access`/`profile`: 2–3× `GET /api/account/access` no mesmo mount
  (Gate + Sidebar + AccountMenu); inbox duplica header+página.
- `settings/TeamPanel`: refetch a cada render do pai (closure em deps).
- Checkout: polling 3s×30; busca admin: debounce 350ms sem abort (fora de
  ordem sobrescreve); `VslStudio`: config inteira (~80 campos) por save.
- Duplicatas reais: conversão externa 2 vias (loader fetch + postMessage),
  `impression` A/B 2 vias (Sets distintos), heartbeat sem dedupe.

## Cache
Zero SWR/React.cache; só `world-countries.json` em memória + localStorage
(resume, CTA, AB, viewer-id, conversas IA). Tudo `no-store` ida e volta;
invalidação = `router.refresh()` / reload manual.

## Egress por request (fato)
Lista: ≤30 assinadas; embed: 1 source + K assets; analytics: 1 preview;
manifest `private,no-store` (proposital: evita vazar entre hosts); purge
CDN existe e é chamado em config/domínios.
