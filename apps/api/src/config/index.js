require('dotenv').config();

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
  aiModelDefault: process.env.AI_MODEL_DEFAULT || 'deepseek/deepseek-v4-flash',
  aiModelComplex: process.env.AI_MODEL_COMPLEX || 'minimax/minimax-m3',
  aiModelQa: process.env.AI_MODEL_QA || 'openai/gpt-5-nano',
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
  apiKeys: {
    perplexity: process.env.PERPLEXITY_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
    apify: process.env.APIFY_API_TOKEN,
  },
};
