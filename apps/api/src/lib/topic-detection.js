// Detección + guardado de topics de RADAR (tabla `topics`), vía Perplexity
// Sonar. Compartido entre el endpoint manual (listening/index.js, POST
// /topics/detect) y el cron automático (listening-cron.js) — mismo dedupe
// (título + ventana de 24h), mismo logActivity; solo cambia quién dispara
// (trigger: 'manual'|'cron') para separar gasto manual vs automático en el
// reporte de uso de IA (GET /api/content/ai-usage).
const pool = require('../db/pool');
const { detectTopics, logActivity } = require('./ai-client');

async function detectAndSaveTopics(query, userId, trigger) {
  const { topics: detected, usage } = await detectTopics(query);
  const inserted = [];
  for (const topic of detected) {
    const { rows: dupes } = await pool.query(
      `SELECT id FROM topics WHERE lower(title) = lower($1) AND detected_at >= now() - interval '24 hours'`,
      [topic.title]
    );
    if (dupes.length) continue;
    const { rows } = await pool.query(
      `INSERT INTO topics (title, source, mentions, sentiment, antecedentes, actores, angulos, audiencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [topic.title, topic.source || 'Web Search', topic.mentions || 0, topic.sentiment || null,
        topic.antecedentes || null, topic.actores || null, topic.angulos || null, topic.audiencia || null]
    );
    inserted.push(rows[0]);
  }
  const action = trigger === 'cron' ? 'radar_detect_auto' : 'radar_detect';
  await logActivity(pool, action, `${inserted.length} topics detectados`, userId, 'exito', { query, count: inserted.length, model: 'sonar-pro', usage });
  return inserted;
}

module.exports = { detectAndSaveTopics };
