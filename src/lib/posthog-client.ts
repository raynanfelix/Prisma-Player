import posthog, { type PostHogConfig } from "posthog-js";

/**
 * Módulo de inicialização do PostHog, carregado sob demanda.
 *
 * Ele fica separado de `instrumentation-client.ts` de propósito: assim o SDK
 * (posthog-js + core-js) vira um chunk próprio, buscado só depois de `load` +
 * `requestIdleCallback`, e não entra no JavaScript inicial da página.
 *
 * Nenhum recurso do produto usa session replay, surveys, dead clicks, web
 * vitals ou feature flags. Desligá-los evita baixar posthog-recorder.js
 * (rrweb), surveys.js, dead-clicks-autocapture.js, exception-autocapture.js e
 * web-vitals.js, além do request de /flags.
 */
const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

const options: Partial<PostHogConfig> = {
  api_host: "/ingest",
  // `ui_host` habilita a toolbar do PostHog, que injeta <link rel=stylesheet>,
  // fontes e scripts de `us.posthog.com` diretamente no documento. Isso viola
  // as diretivas `style-src`/`font-src`/`script-src` do CSP (origem externa sem
  // nonce) e dispara erros de console. A toolbar só é necessária em dev/debug;
  // a analytics de produção funciona inteiramente via `api_host` (/ingest).
  disable_session_recording: true,
  disable_surveys: true,
  capture_dead_clicks: false,
  capture_exceptions: false,
  capture_performance: false,
  // Sem flags/remote config: nenhum código consulta feature flags e o
  // request de configuração só adicionava latência na inicialização.
  advanced_disable_flags: true,
  person_profiles: "identified_only",
  defaults: "2026-01-30",
  debug: process.env.NODE_ENV === "development",
};

export function initPostHog() {
  if (!projectToken || posthog.__loaded) return;
  posthog.init(projectToken, options);
}
