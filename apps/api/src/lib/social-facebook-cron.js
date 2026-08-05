// Cron de ingesta automática: reels y videos (incl. vivos ya terminados, que Facebook
// deja como video normal en el muro al acabar) de la página propia hacia Producciones
// (social_posts). Reusa el microservicio competitor-scraper que ya usa RADAR
// (source: 'facebook' en /listening/competitors/detect) — scraping de página pública,
// nada nuevo que desplegar. Cookies de sesión (si algún día se necesitan) las resuelve
// el propio microservicio vía FB_COOKIES/FB_COOKIES_FILE.
const cron = require('node-cron');
const pool = require('../db/pool');
const config = require('../config');
const { scrapeCompetitorPosts } = require('./competitor-scraper-client');
const { insertSocialPost } = require('../modules/social');
const { logActivity } = require('./ai-client');

const TIMEZONE = 'America/Mexico_City';
// ponytail: 1 sola página propia, hardcoded. Si sale una 2da página, promover a
// config/DB como ya existe para competitor_facebook_accounts (migración 031).
const CREA_FACEBOOK_PAGE_URL = 'https://www.facebook.com/profile.php?id=100079776720617';
const MAX_POSTS_PER_RUN = 15;

// Lock en memoria, mismo criterio que listening-cron.js. ponytail: 1 sola instancia —
// si se escala a N réplicas, mover a advisory lock de Postgres.
let running = false;

async function tick() {
  if (running) return;
  if (!config.competitorScraperUrl) return; // scraper no configurado en este entorno
  running = true;
  let inserted = 0;
  let skipped = 0;
  try {
    const items = await scrapeCompetitorPosts({
      baseUrl: config.competitorScraperUrl,
      accounts: [CREA_FACEBOOK_PAGE_URL],
      maxPostsPerAccount: MAX_POSTS_PER_RUN,
      includeReels: true,
    });

    for (const item of items) {
      // media_type='video' cubre reels, videos normales y vivos ya terminados — el
      // scraper no distingue entre ellos (ver apps/competitor-scraper/src/utils.js).
      if (item.media_type !== 'video' || !item.post_url) continue;
      const result = await insertSocialPost(item.post_url, { published: true, createdBy: null });
      if (result.duplicate || result.error) { skipped += 1; continue; }
      inserted += 1;
    }

    await logActivity(pool, 'social_scrape_fb_own', `${inserted} video(s) nuevo(s) de Facebook propio a Producciones`, null, 'exito', {
      returned: items.length,
      inserted,
      skipped,
    });
  } catch (err) {
    await logActivity(pool, 'social_scrape_fb_own', err.message, null, 'fallo', {});
  } finally {
    running = false;
  }
}

function startSocialFacebookCron() {
  // Mismo horario que el cron de RADAR: 00:00, 06:00, 12:00, 18:00 hora CDMX.
  cron.schedule('0 */6 * * *', () => { tick().catch(() => { /* ya logueado dentro de tick */ }); }, { timezone: TIMEZONE });
}

module.exports = { startSocialFacebookCron };
