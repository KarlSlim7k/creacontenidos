require('dotenv').config();

const configuredAiTextTimeoutMs = Number(process.env.AI_TEXT_TIMEOUT_MS || 45000);

// En producción CORS_ORIGIN vacío haría que cors() refleje CUALQUIER origen
// (cors(undefined) = abierto). En vez de abrir o de tumbar el boot, caemos al
// origen del propio sitio (PUBLIC_SITE_URL): el default seguro correcto, porque
// web y API se sirven en el mismo origen. Solo si tampoco hay PUBLIC_SITE_URL
// abortamos, porque entonces no hay ningún origen conocido al que restringir.
let resolvedCorsOrigin = process.env.CORS_ORIGIN;
if ((process.env.NODE_ENV || 'development') === 'production' && !resolvedCorsOrigin) {
  if (process.env.PUBLIC_SITE_URL) {
    resolvedCorsOrigin = process.env.PUBLIC_SITE_URL;
    console.warn(`⚠️  CORS_ORIGIN vacío en producción: restringiendo a PUBLIC_SITE_URL (${resolvedCorsOrigin}). Define CORS_ORIGIN si necesitas más orígenes.`);
  } else {
    throw new Error('CORS_ORIGIN y PUBLIC_SITE_URL vacíos en producción: la API aceptaría CUALQUIER origen. Define al menos uno.');
  }
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: resolvedCorsOrigin,
  jwtSecret: process.env.JWT_SECRET,
  nousPortalKey: process.env.NOUS_PORTAL_API_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  telegramDirectorChatIds: String(process.env.TELEGRAM_DIRECTOR_CHAT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0),
  telegramReviewEnabled: process.env.TELEGRAM_REVIEW_ENABLED === 'true',
  telegramReviewHour: Number(process.env.TELEGRAM_REVIEW_HOUR || 8),
  telegramReviewMinute: Number(process.env.TELEGRAM_REVIEW_MINUTE || 0),
  telegramApiBaseUrl: (process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/$/, ''),
  aiModelDefault: process.env.AI_MODEL_DEFAULT || 'deepseek/deepseek-v4-flash',
  aiModelComplex: process.env.AI_MODEL_COMPLEX || 'minimax/minimax-m3',
  aiModelQa: process.env.AI_MODEL_QA || 'openai/gpt-5-nano',
  aiModelFallback: process.env.AI_MODEL_FALLBACK || 'inclusionai/ling-3.0-flash:free',
  aiOpenRouterFallbackModel: process.env.AI_OPENROUTER_FALLBACK_MODEL || 'inclusionai/ling-3.0-flash:free',
  aiTextTimeoutMs: Number.isFinite(configuredAiTextTimeoutMs) && configuredAiTextTimeoutMs >= 1000 && configuredAiTextTimeoutMs <= 120000
    ? configuredAiTextTimeoutMs
    : 45000,
  // Imagen vía OpenRouter (docs/ia/generacion-imagenes.md): Nano Banana Pro para portadas.
  openrouterKey: process.env.OPENROUTER_API_KEY,
  aiModelImage: process.env.AI_MODEL_IMAGE || 'google/gemini-3-pro-image',
  publicSiteUrl: process.env.PUBLIC_SITE_URL || 'https://crea-contenidos.com',
  facebookPageId: process.env.FACEBOOK_PAGE_ID,
  facebookPageToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
  wordpressUrl: process.env.WORDPRESS_URL,
  wordpressUser: process.env.WORDPRESS_USER,
  wordpressAppPassword: process.env.WORDPRESS_APP_PASSWORD,
  resendApiKey: process.env.RESEND_API_KEY,
  resendAudienceId: process.env.RESEND_AUDIENCE_ID,
  resendFrom: process.env.RESEND_FROM || 'Buenos días, Perote <hola@crea-contenidos.com>',
  // ponytail: solo direcciones de contacto para mostrar en el sitio (mailto:) hasta que
  // el dominio esté verificado en Resend — cuando lo esté, sirven de remitente/reply-to
  // para notificaciones (ej. aviso de lead nuevo). No hay envío real todavía.
  contactEmail: process.env.CONTACT_EMAIL || 'contacto@crea-contenidos.com',
  comunidadEmail: process.env.COMUNIDAD_EMAIL || 'comunidad@crea-contenidos.com',
  elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
  // Web Push (notificaciones a la PWA del panel admin). Sin estas dos, el feature
  // queda apagado solo (lib/push.js no manda nada, el endpoint de vapid-public-key
  // devuelve null y el cliente no ofrece el toggle) — no requiere flag aparte.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || null,
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:soporte@crea-contenidos.com',
  // Microservicio de scraping de Facebook (apps/competitor-scraper). Si está
  // configurado, el endpoint POST /api/listening/competitors/detect acepta
  // {source: 'facebook'} y delega al scraper (sesión autenticada vía cookies
  // montadas como secret). Si es null, el endpoint solo soporta Perplexity.
  // Ver apps/api/src/modules/listening/README.md y el plan de integración.
  competitorScraperUrl: process.env.COMPETITOR_SCRAPER_URL || null,
  // Firecrawl — scrape web pública para RADAR (docs/ia/firecrawl-integracion.md).
  // Vacío = detección de topics sigue solo con Perplexity. CSV de URLs en
  // FIRECRAWL_SOURCE_URLS (no reutilizar DEFAULT_COMPETITORS: son nombres, no URLs).
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY || null,
  firecrawlBaseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev/v1',
  firecrawlSourceUrls: process.env.FIRECRAWL_SOURCE_URLS || '',
  apiKeys: {
    perplexity: process.env.PERPLEXITY_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
    apify: process.env.APIFY_API_TOKEN,
  },
};
