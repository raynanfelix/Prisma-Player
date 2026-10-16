# Spec — Criptografia HLS AES-128 (drmHlsEnabled)

Status: **spec pronta para implementação**. O checkbox "Ativar Criptografia
HLS AES-128" (sub-aba DRM do studio) hoje é placebo: o vídeo é entregue como
MP4 direto com URL R2 presigned de 15 min (`VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS`).
Este documento define o pipeline que torna o toggle real.

## Objetivo e limites honestos

- Matar o "salvar MP4 na aba Network": o `<video>` passa a consumir segmentos
  `.ts` cifrados; não existe mais um arquivo MP4 endereçável.
- AES-128 **não é Widevine**: a chave chega ao cliente legítimo, então gravação
  de tela e engenharia dedicada continuam possíveis. É o padrão usado por
  plataformas BR de VSL (Panda Video etc.) — risco proporcional ao produto.

## Arquitetura

1. **Upload** (fluxo atual mantém o MP4 como master): após o status `ready`,
   um job de transcode enfileira `ffmpeg -i master.mp4 → hls/{rendition}/`
   gerando `master.m3u8` (variantes 720p/1080p), segmentos `.ts` com AES-128
   e `key.info` (URI da chave apontando para o endpoint autenticado).
2. **Storage**: prefixo `hls/{videoId}/` no mesmo bucket R2 privado; o MP4
   original permanece como fallback e para o Studio.
3. **Endpoint de chave** `GET /api/embed/[id]/key`: devolve a chave de 16 bytes
   **somente** com `originToken` válido (host + nonce + cookie de render) e,
   quando `drmSignedTokenEnabled`, sessão válida. Sem rate limit generoso:
   60 req/min por IP. A chave NUNCA fica em URL presigned.
4. **Entrega**: quando `drmHlsEnabled === true` e o job terminou, o
   `/api/embed/[id]` devolve `source = {url do master.m3u8 presigned curto,
   type: "application/vnd.apple.mpegurl"}` + `hls: true`; senão, MP4 como hoje.
5. **Player**: `hls.js` via `next/dynamic` (Safari nativo suporta HLS);
   MSE só em `https://*.r2.cloudflarestorage.com` já permitido na CSP
   (`media-src`/`connect-src` atuais cobrem).

## Infra de transcode — decisão pendente (escolher 1)

| Opção | Prós | Contras |
|---|---|---|
| **Neon Functions** (Node + ffmpeg binário) | Já na stack; long-running ok | Cold start; manter binário |
| Cloudflare Worker + ffmpeg.wasm | Barato; perto do R2 | Lento (WASM); timeout |
| Serviço gerenciado (Mux/Encoding.com) | Rápido, sem ops | Custo por minuto; vendor |

Recomendação inicial: **Neon Functions** — uma função `transcode-hls`
assíncrona por vídeo, triggers por linha em tabela `hls_jobs` (status:
pending → running → ready/failed) com lock otimista.

## Fases

1. Esquema `hls_jobs` + endpoint de chave + player hls.js consumindo (com
   fixture de segmentos de teste) — toggle já real para vídeos transcodados.
2. Worker de transcode + upload → R2 + purge do manifest do Worker da borda.
3. Retranscode on-demand (botão no dashboard) e métricas (duração/fila).

## Fora de escopo

Widevine/FairPlay (EME), watermark forense por segmento, bloqueio de gravação
de tela — documentados como limites do produto.
