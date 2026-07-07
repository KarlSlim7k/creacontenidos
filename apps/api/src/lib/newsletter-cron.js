// Cron del newsletter automático. Revisa cada minuto si toca generar la
// edición del día — SOLO genera y deja 'pendiente'; nunca envía. El director
// aprueba y da clic en "Enviar" desde el panel, igual que el resto del
// sistema (nada sale sin revisión humana).
const cron = require('node-cron');
const pool = require('../db/pool');
const { generateContent } = require('./newsletter-content');
const { logActivity } = require('./ai-client');

const TIMEZONE = 'America/Mexico_City';

function currentHourMinute() {
  const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE }).formatToParts(new Date());
  return {
    hour: Number(parts.find((p) => p.type === 'hour').value),
    minute: Number(parts.find((p) => p.type === 'minute').value),
  };
}

// Lock en memoria: generateContent() (Perplexity+Claude) puede tardar >60s y el
// cron corre cada minuto. Sin esto, dos ticks pasan el SELECT antes de que
// cualquiera inserte → doble generación (doble costo de API). Basta para una
// instancia, que es el diseño actual. ponytail: si escalamos a N réplicas, mover
// a un advisory lock de Postgres.
let running = false;

async function tick() {
  if (running) return;
  const { rows } = await pool.query('SELECT enabled, send_hour, send_minute FROM newsletter_settings WHERE id = 1');
  const settings = rows[0];
  if (!settings || !settings.enabled) return;

  const { hour, minute } = currentHourMinute();
  if (hour !== settings.send_hour || minute !== settings.send_minute) return;

  const { rows: existing } = await pool.query('SELECT id FROM newsletter_editions WHERE edition_date = CURRENT_DATE');
  if (existing.length) return; // ya generado (manual o cron) hoy — no duplicar

  running = true;
  try {
    const content = await generateContent();
    await pool.query(
      `INSERT INTO newsletter_editions (edition_date, weekday, date_label, content, status)
       VALUES (CURRENT_DATE, $1, $2, $3, 'pendiente')
       ON CONFLICT (edition_date) DO NOTHING`,
      [content.weekday, content.date, JSON.stringify(content)]
    );
    await logActivity(pool, 'newsletter_auto_generate', `Newsletter generado automáticamente (${content.weekday} ${content.date}) — pendiente de aprobación`, null, 'exito', { topicsUsed: content.topicsUsed });
  } catch (err) {
    await logActivity(pool, 'newsletter_auto_generate', err.message, null, 'fallo', null);
  } finally {
    running = false;
  }
}

function startNewsletterCron() {
  cron.schedule('* * * * *', () => { tick().catch(() => { /* ya logueado dentro de tick */ }); }, { timezone: TIMEZONE });
}

module.exports = { startNewsletterCron };
