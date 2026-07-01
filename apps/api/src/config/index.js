require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  apiKeys: {
    perplexity: process.env.PERPLEXITY_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    elevenlabs: process.env.ELEVENLABS_API_KEY,
    apify: process.env.APIFY_API_TOKEN,
  },
};
