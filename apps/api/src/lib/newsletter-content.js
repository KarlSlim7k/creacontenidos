// Construcción del contenido del día: topics reales de RADAR + clima real +
// editorial vía IA barata. Compartido entre la ruta manual (POST /generate) y
// el cron automático (newsletter-cron.js) para no duplicar la lógica.
const pool = require('../db/pool');
const { generateNewsletterEditorial } = require('./ai-client');
const { getPeroteClima } = require('./weather-client');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function todayInSpanish() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: 'America/Mexico_City' }).format(now);
  const parts = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'America/Mexico_City' }).formatToParts(now);
  const day = parts.find((p) => p.type === 'day').value;
  const month = Number(parts.find((p) => p.type === 'month').value) - 1;
  const year = parts.find((p) => p.type === 'year').value;
  return { weekday, date: `${day} de ${MESES[month]} de ${year}` };
}

// Rota entre clientes cerrados con datos de patrocinio reales cargados (nunca
// inventa copy/link). El menos usado recientemente entra primero — reparte
// las menciones entre todos los patrocinadores activos en vez de repetir uno.
async function pickNextSponsor() {
  const { rows } = await pool.query(
    `SELECT id, COALESCE(business_name, name) AS nombre, sponsor_copy, website_url FROM clients
     WHERE pipeline_stage = 'cerrado' AND active = true
       AND website_url IS NOT NULL AND sponsor_copy IS NOT NULL
     ORDER BY last_sponsored_at NULLS FIRST, id LIMIT 1`
  );
  if (!rows.length) return null;
  const sponsor = rows[0];
  // Link con esquema válido o nada: un typo en website_url (ej. "www.x.com" sin
  // http) produce un enlace roto en el correo ante 1K+ lectores. Mejor sin link.
  const link = /^https?:\/\//i.test(sponsor.website_url) ? sponsor.website_url : null;
  if (!link) return null;
  await pool.query('UPDATE clients SET last_sponsored_at = now() WHERE id = $1', [sponsor.id]);
  return { nombre: sponsor.nombre, copy: sponsor.sponsor_copy, link };
}

// agenda sí tiene fuente real (newsletter_events, cargados a mano en el panel);
// si no hay eventos hoy, queda null igual — nunca se inventa un evento.
async function generateContent() {
  // Excluir risk: no alimentar el newsletter con rumor/clickbait (RADAR Fase 5).
  // null (legacy) y checking/signal/verified sí entran; prioriza score alto si existe.
  const { rows: topics } = await pool.query(
    `SELECT title, sentiment, antecedentes, angulos FROM topics
     WHERE detected_at >= now() - interval '48 hours'
       AND (verification_status IS NULL OR verification_status <> 'risk')
     ORDER BY COALESCE(confidence, 0) DESC, mentions DESC
     LIMIT 5`
  );
  if (!topics.length) {
    const err = new Error('Sin topics detectados en las últimas 48 horas. Corre RADAR primero.');
    err.status = 409;
    throw err;
  }
  const { weekday, date } = todayInSpanish();
  const [clima, editorial, events, patrocinador] = await Promise.all([
    getPeroteClima(),
    generateNewsletterEditorial(topics, weekday, date),
    pool.query(`SELECT title FROM newsletter_events WHERE event_date = CURRENT_DATE ORDER BY id`),
    pickNextSponsor(),
  ]);
  const agenda = events.rows.length ? events.rows.map((e) => e.title).join('. ') : null;
  return {
    weekday, date, clima: clima.texto,
    notaDelDia: editorial.notaDelDia, enBreve: editorial.enBreve || [], datoDelDia: editorial.datoDelDia,
    agenda, patrocinador,
    topicsUsed: topics.length,
  };
}

module.exports = { generateContent, todayInSpanish };
