// Cron de ingesta automática: videos del canal de YouTube propio hacia Producciones
// (social_posts). YouTube expone un feed RSS público por canal — sin API key, sin
// scraping, sin el microservicio competitor-scraper. Solo trae los últimos ~15 videos,
// que es exactamente lo que necesitamos (novedades, no backfill histórico).
const cron = require('node-cron');
const pool = require('../db/pool');
const { insertSocialPost } = require('../modules/social');
const { logActivity } = require('./ai-client');

const TIMEZONE = 'America/Mexico_City';
// ponytail: 1 solo canal propio, hardcoded. Si sale un 2do, se promueve a config/DB
// como competitor_facebook_accounts (migración 031).
const CHANNEL_ID = 'UCz4ZiqExD6JPHZ5BxUtJcYw'; // @creacontenidos2022
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const WATCH_URL_RE = /https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}/g;

let running = false;

async function tick() {
  if (running) return;
  running = true;
  let inserted = 0;
  let skipped = 0;
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) throw new Error(`feed RSS respondió ${res.status}`);
    const xml = await res.text();
    const urls = Array.from(new Set(xml.match(WATCH_URL_RE) || []));

    for (const url of urls) {
      const result = await insertSocialPost(url, { published: true, createdBy: null });
      if (result.duplicate || result.error) { skipped += 1; continue; }
      inserted += 1;
    }

    await logActivity(pool, 'social_scrape_yt_own', `${inserted} video(s) nuevo(s) de YouTube propio a Producciones`, null, 'exito', {
      returned: urls.length,
      inserted,
      skipped,
    });
  } catch (err) {
    await logActivity(pool, 'social_scrape_yt_own', err.message, null, 'fallo', {});
  } finally {
    running = false;
  }
}

function startSocialYoutubeCron() {
  // Mismo horario que el resto de los crons de Producciones, con 5 min de offset
  // para no pegarle a la DB al mismo tiempo que social-facebook-cron.js.
  cron.schedule('5 */6 * * *', () => { tick().catch(() => { /* ya logueado dentro de tick */ }); }, { timezone: TIMEZONE });
}

module.exports = { startSocialYoutubeCron };
