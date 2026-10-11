# Integração do Video.js v10

## Versão e arquitetura

- Pacote React oficial: `@videojs/react` `10.0.0-beta.25`.
- O v10 ainda é beta; o contrato do Prisma fica concentrado em `src/components/player` para permitir atualização ou rollback.
- Usamos `createPlayer({ features: videoFeatures })`, `Player.Provider`, `VideoSkin` e `Video` conforme a instalação oficial.
- O bundle e o CSS são servidos pela aplicação, sem scripts de CDN em runtime.

## Recursos nativos usados

- reprodução, pausa, seek e atalhos de teclado;
- volume, mute, tempo, buffer e playback rate;
- fullscreen e picture-in-picture com detecção de disponibilidade;
- AirPlay, Google Cast e qualidade quando a mídia/plataforma oferece suporte;
- poster, legendas WebVTT, controles responsivos e acessíveis;
- estados de erro e buffering da skin oficial;
- MP4/WebM nativo hoje, com pontos de extensão documentados para HLS, DASH e Mux.

O componente Prisma acrescenta `Smart Pause`, velocidade inicial, callback de tempo, visibilidade de controles, tema por CSS custom properties e text tracks. A API pública está em `types.ts`.

## Camadas comerciais do Prisma

Headline, Smart Autoplay, CTA temporizado, ThumbSniper, continuar assistindo, pixels, progresso inteligente e filtros de tráfego são camadas de produto sobre o player. O Video.js fornece estado e mídia; essas regras não devem ser acopladas internamente à biblioteca.

Proteção de domínio, token de acesso, bloqueio de proxy/VPN, URLs assinadas e eventos de conversão precisam ser validados no servidor ou na borda. Uma checagem somente no React pode ser removida pelo visitante e não é segurança.

## Segurança e CSP

- O player não recebe credenciais de storage, CDN ou Supabase.
- O frontend recebe somente URLs reproduzíveis ou assinadas e identificadores públicos.
- `media-src` libera as origens de mídia; `connect-src` libera manifests, segmentos e legendas.
- HLS baseado em MSE exige `media-src blob:`; variantes com worker exigem `worker-src blob:`.
- Posters precisam estar liberados em `img-src`.
- Pixels recebem somente IDs públicos; segredos de APIs de conversão ficam no backend.
- Texto do cliente é renderizado como texto React, nunca como HTML não confiável.

## Organização

```text
src/components/player/
  VideoPlayer.tsx       adapter React do Video.js v10
  types.ts              contrato estável do Prisma
  video-player.css      skin e opções visuais isoladas
  index.ts              API pública

src/components/studio/
  VslStudio.tsx         módulos comerciais e prévia da VSL
```

## Próxima fase de produção

O backend deve entregar um DTO com `playbackUrl`, `mimeType`, `posterUrl`, tracks e identificadores opacos. HLS/DASH, qualidades adaptativas, thumbnails de timeline, analytics confiável, persistência de pastas e regras de domínio dependem da infraestrutura de upload, transcodificação, banco e edge; não devem ser simulados como segurança de frontend.
