// Construcción del contenido del día: topics reales de RADAR + clima real +
// editorial vía IA barata. Compartido entre la ruta manual (POST /generate) y
// el cron automático (newsletter-cron.js) para no duplicar la lógica.
const pool = require('../db/pool');
const { generateNewsletterEditorial } = require('./ai-client');
const { getPeroteClima } = require('./weather-client');
const { renderPodcastScript } = require('./newsletter-template');
const { isValidSection, suggestSection } = require('./newsletter-sections');

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

// R2-34: "PARA ENTENDER" es aditivo — bloque nuevo, no reemplaza nada de la
// plantilla existente. Se llena SOLO si la selección trae un analysis_id
// explícito de nivel 3 (nunca "el más reciente" implícito: un editor
// eligiéndolo a propósito es justo lo que evita que sea "un tema nivel 1/2
// disfrazado" — R2-34). Compone el texto desde los campos ya sintetizados
// del análisis, no le pide nada nuevo a un modelo.
function buildParaEntender(topicTitle, analysis) {
  if (!analysis || analysis.analysis_level !== 3) return null;
  const parts = [];
  if (analysis.contexto) parts.push(analysis.contexto);
  if (analysis.por_que_importa) parts.push(analysis.por_que_importa);
  if (Array.isArray(analysis.implicaciones) && analysis.implicaciones.length) {
    parts.push(`Lo que podría pasar después: ${analysis.implicaciones.join('. ')}.`);
  }
  if (analysis.para_el_ciudadano) parts.push(analysis.para_el_ciudadano);
  if (!parts.length) return null;
  return { titulo: topicTitle, cuerpo: parts.join(' ') };
}

/**
 * Arma el contenido del día.
 * @param {{ topic_id: number, section?: string, analysis_id?: number }[]} [selection]
 *   Selección editorial explícita (R2-31). SIN selección (undefined/[]),
 *   comportamiento idéntico al de antes de esta fase — el cron y cualquier
 *   caller existente siguen funcionando sin cambios.
 * @returns {Promise<{ content: object, selectionItems: Array }>}
 *   selectionItems queda [] sin selección — no hay nada que trazar en
 *   newsletter_edition_items en el camino legacy.
 */
async function generateContent(selection) {
  let topics;
  const selectionItems = [];
  let paraEntender = null;

  if (Array.isArray(selection) && selection.length) {
    const ids = [...new Set(selection.map((s) => Number(s.topic_id)).filter((n) => Number.isInteger(n)))];
    const { rows: topicRows } = await pool.query(
      `SELECT id, title, sentiment, antecedentes, angulos, verification_status, territorial_scope, category
       FROM topics WHERE id = ANY($1::int[])`,
      [ids]
    );
    const byId = new Map(topicRows.map((r) => [r.id, r]));

    const analysisIds = [...new Set(selection.map((s) => Number(s.analysis_id)).filter((n) => Number.isInteger(n)))];
    let analysesById = new Map();
    if (analysisIds.length) {
      const { rows: analysisRows } = await pool.query('SELECT * FROM editorial_analyses WHERE id = ANY($1::int[])', [analysisIds]);
      analysesById = new Map(analysisRows.map((r) => [r.id, r]));
    }

    const ordered = [];
    let position = 0;
    for (const s of selection) {
      const topic = byId.get(Number(s.topic_id));
      // Mismo filtro de seguridad que el camino automático: risk nunca entra,
      // ni siquiera elegido a mano — el editor ya vio el badge en la ficha.
      if (!topic || topic.verification_status === 'risk') continue;
      const section = isValidSection(s.section) ? s.section : suggestSection(topic);
      const analysisId = Number.isInteger(Number(s.analysis_id)) ? Number(s.analysis_id) : null;
      const analysis = analysisId ? analysesById.get(analysisId) : null;
      if (!paraEntender && analysis && analysis.topic_id === topic.id) {
        paraEntender = buildParaEntender(topic.title, analysis);
      }
      ordered.push(topic);
      selectionItems.push({ topic_id: topic.id, analysis_id: analysis ? analysis.id : null, section, position: position++ });
    }
    if (!ordered.length) {
      const err = new Error('Ningún tema de la selección es válido (no existe, o está marcado como riesgo editorial).');
      err.status = 400;
      throw err;
    }
    topics = ordered;
  } else {
    // Camino legacy — EXACTO al de antes de R2-31 (R2-05 del README: "compatibilidad
    // hacia atrás sin flags"). Ni una coma distinta en el SQL.
    const { rows } = await pool.query(
      `SELECT title, sentiment, antecedentes, angulos FROM topics
       WHERE detected_at >= now() - interval '48 hours'
         AND (verification_status IS NULL OR verification_status <> 'risk')
       ORDER BY COALESCE(confidence, 0) DESC, mentions DESC
       LIMIT 5`
    );
    if (!rows.length) {
      const err = new Error('Sin topics detectados en las últimas 48 horas. Corre RADAR primero.');
      err.status = 409;
      throw err;
    }
    topics = rows;
  }

  const { weekday, date } = todayInSpanish();
  const [clima, editorial, events, patrocinador] = await Promise.all([
    getPeroteClima(),
    generateNewsletterEditorial(topics, weekday, date),
    pool.query(`SELECT title FROM newsletter_events WHERE event_date = CURRENT_DATE ORDER BY id`),
    pickNextSponsor(),
  ]);
  const agenda = events.rows.length ? events.rows.map((e) => e.title).join('. ') : null;
  const content = {
    weekday, date, clima: clima.texto,
    notaDelDia: editorial.notaDelDia, enBreve: editorial.enBreve || [], datoDelDia: editorial.datoDelDia,
    agenda, patrocinador,
    topicsUsed: topics.length,
    paraEntender, // R2-34: null si no hubo selección, o si ninguna traía análisis nivel 3
  };
  // Guion de podcast: arranca como el texto derivado del newsletter, pero es
  // un campo propio editable — producción puede reescribirlo sin tocar el correo.
  content.guionPodcast = renderPodcastScript(content);
  return { content, selectionItems };
}

// R2-30/R2-31: reemplaza las filas de trazabilidad de una edición (idempotente
// ante regeneración con nueva selección). No-op si selectionItems está vacío
// — el camino legacy nunca escribe acá.
async function replaceEditionItems(editionId, selectionItems) {
  await pool.query('DELETE FROM newsletter_edition_items WHERE edition_id = $1', [editionId]);
  if (!selectionItems || !selectionItems.length) return;
  const values = [];
  const params = [];
  selectionItems.forEach((item, i) => {
    const base = i * 5;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    params.push(editionId, item.topic_id, item.analysis_id, item.section, item.position);
  });
  await pool.query(
    `INSERT INTO newsletter_edition_items (edition_id, topic_id, analysis_id, section, position) VALUES ${values.join(', ')}`,
    params
  );
}

module.exports = { generateContent, todayInSpanish, replaceEditionItems };
