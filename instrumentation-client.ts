import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: "/ingest",
  // `ui_host` habilita a toolbar do PostHog, que injeta <link rel=stylesheet>,
  // fontes e scripts de `us.posthog.com` diretamente no documento. Isso viola
  // as diretivas `style-src`/`font-src`/`script-src` do CSP (origem externa sem
  // nonce) e dispara erros de console. A toolbar só é necessária em dev/debug;
  // a analytics de produção funciona inteiramente via `api_host` (/ingest).
  capture_exceptions: true,
  defaults: "2026-01-30",
  debug: process.env.NODE_ENV === "development",
});
