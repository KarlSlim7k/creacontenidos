// Cron de detección automática de RADAR (temas). Corre cada 6h y llama a
// Perplexity Sonar — gasto real de API. Por diseño SOLO detecta y guarda
// topics; generar propuesta de contenido sigue siendo un click humano
// (POST /api/content/generate-proposal), así el gasto automático queda
// acotado a 1 llamada Perplexity por tick (~4/día). Ver GET
// /api/content/ai-usage para el gasto real medido en tokens.
const cron = require('node-cron');
const pool = require('../db/pool');
const { detectAndSaveTopics } = require('./topic-detection');
const { logActivity } = require('./ai-client');

const TIMEZONE = 'America/Mexico_City';
const QUERY = 'tendencias y noticias relevantes en Perote, Veracruz, México';

// Lock en memoria, mismo criterio que newsletter-cron.js: detectAndSaveTopics
// puede tardar varios segundos y dos ticks no deben pisarse. ponytail: solo
// para una instancia — si se escala a N réplicas, mover a advisory lock de Postgres.
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await detectAndSaveTopics(QUERY, null, 'cron');
  } catch (err) {
    await logActivity(pool, 'radar_detect_auto', err.message, null, 'fallo', { query: QUERY });
  } finally {
    running = false;
  }
}

function startListeningCron() {
  // Minuto 0 de cada 6 horas: 00:00, 06:00, 12:00, 18:00 hora CDMX.
  cron.schedule('0 */6 * * *', () => { tick().catch(() => { /* ya logueado dentro de tick */ }); }, { timezone: TIMEZONE });
}

module.exports = { startListeningCron };
