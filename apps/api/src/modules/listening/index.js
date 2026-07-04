const express = require('express');
const pool = require('../../db/pool');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { detectTopics, logActivity } = require('../../lib/ai-client');

const router = express.Router();

// POST /api/listening/topics/detect — detección de tendencias vía IA (Nous Portal).
router.post('/topics/detect', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  const query = (req.body && req.body.query) || 'tendencias y noticias relevantes en Perote, Puebla, México';
  try {
    const detected = await detectTopics(query);
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
    await logActivity(pool, 'radar_detect', `${inserted.length} topics detectados`, req.user.id, 'exito', { query, count: inserted.length });
    res.json({ detected: inserted.length, topics: inserted });
  } catch (err) {
    await logActivity(pool, 'radar_detect', err.message, req.user.id, 'fallo', { query });
    res.status(500).json({ error: 'No se pudo completar la detección de tendencias: ' + err.message });
  }
});

// GET /api/listening/topics?source=&status= — pantalla RADAR del panel admin.
router.get('/topics', requireAuth, async (req, res, next) => {
  try {
    const params = [];
    const clauses = [];
    if (req.query.source) {
      params.push(req.query.source);
      clauses.push(`source = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, title, source, mentions, sentiment, status, antecedentes, actores, angulos, audiencia, detected_at
       FROM topics ${where} ORDER BY detected_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/listening/topics/:id/approve — marca el topic como revisado.
router.patch('/topics/:id/approve', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE topics SET status = 'Revisado' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Topic no encontrado' });
    await logActivity(pool, 'radar_approve', `Topic aprobado: ${rows[0].title}`, req.user.id, 'exito', { topic_id: rows[0].id });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/listening/topics/:id — descarta un topic detectado por RADAR.
router.delete('/topics/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM topics WHERE id = $1 RETURNING id, title', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Topic no encontrado' });
    await logActivity(pool, 'radar_delete', `Topic eliminado: ${rows[0].title}`, req.user.id, 'exito', { topic_id: rows[0].id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
