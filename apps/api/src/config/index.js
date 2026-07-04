require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN,
  jwtSecret: process.env.JWT_SECRET,
  nousPortalKey: process.env.NOUS_PORTAL_API_KEY,
  aiModelDefault: process.env.AI_MODEL_DEFAULT || 'deepseek/deepseek-v4-flash',
  aiModelComplex: process.env.AI_MODEL_COMPLEX || 'minimax/minimax-m3',
  aiModelQa: process.env.AI_MODEL_QA || 'openai/gpt-5-nano',
  resendApiKey: process.env.RESEND_API_KEY,
  resendAudienceId: process.env.RESEND_AUDIENCE_ID,
  resendFrom: process.env.RESEND_FROM || 'Buenos días, Perote <hola@crea-contenidos.com>',
  elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
  apiKeys: {
    perplexity: process.env.PERPLEXITY_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
    apify: process.env.APIFY_API_TOKEN,
  },
};
