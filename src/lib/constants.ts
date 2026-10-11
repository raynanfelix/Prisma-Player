export const SECURITY = {
  RATE_LIMIT_CLEANUP_INTERVAL_MS: 60_000,
  EMBED_TOKEN_MAX_AGE_SECONDS: 600,
  EMBED_TOKEN_VERSION: "v1",
  CSRF_ALLOWED_ORIGINS: new Set(["http://localhost:3000"]),
  // Cookie de render do embed (RM-02): setado no response da página /embed e
  // exigido no consumo para provar que o token veio de um render real no browser.
  EMBED_RENDER_COOKIE: "pp_embed",
  EMBED_RENDER_COOKIE_MAX_AGE_SECONDS: 600,
} as const;

export const ANALYTICS = {
  MAX_EVENT_PAYLOAD_BYTES: 4096,
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX_REQUESTS: 120,
  MAX_EVENTS_PER_ANALYSIS: 50000,
  ANALYSIS_ACTIVE_JOB_TIMEOUT_MS: 120_000,
  ANALYSIS_10MIN_LIMIT: 3,
  ANALYSIS_DAILY_LIMIT: 30,
} as const;

export const AI = {
  MAX_OUTPUT_TOKENS: 1800,
  REQUEST_TIMEOUT_MS: 25_000,
  MAX_USER_QUESTION_LENGTH: 500,
  REDACT_TEXT_LIMIT: 12000,
  CLEAN_TEXT_LIMIT: 900,
} as const;

export const VIDEO = {
  MAX_TITLE_LENGTH: 200,
  R2_SIGNED_URL_EXPIRY_SECONDS: 900,
  SUPABASE_SIGNED_URL_EXPIRY_SECONDS: 900,
  LIST_PAGE_SIZE: 30,
  R2_DEFAULT_MAX_UPLOAD_BYTES: 20 * 1024 ** 3,
  SUPPORTED_MIME_PREFIXES: ["video/", "application/vnd.apple.mpegurl"],
  MULTIPART_PART_SIZE: 25 * 1024 * 1024,
  MULTIPART_MAX_PARTS: 10000,
  MULTIPART_UPLOAD_ID_MAX_LENGTH: 1024,
} as const;

// Estimativa de referência do custo de egress (R2/CDN), não cobrança real.
// Ajustável via env no futuro.
export const BANDWIDTH = {
  EGRESS_CENTS_PER_GB: 15, // R$ 0,15/GB estimado (Cloudflare/Bunny ~US$0.005-0.01/GB)
  MAX_EVENTS_FOR_BANDWIDTH: 20000,
  BYTES_PER_GB: 1024 ** 3,
  TREND_WINDOW_DAYS: 7,
  MAX_SERIES_DAYS: 4000,
} as const;

export const BILLING = {
  MAX_PROVIDER_SUBSCRIPTION_ID_LENGTH: 200,
  WEBHOOK_SIGNATURE_MAX_LENGTH: 500,
} as const;
