const express = require('express');
const pool = require('../../db/pool');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { generateProposal, generateDraft, qaCheck, logActivity } = require('../../lib/ai-client');

const router = express.Router();

// POST /api/content/generate-proposal — genera una propuesta de contenido a partir de un topic de RADAR.
router.post('/generate-proposal', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { topic_id, format, angle } = req.body || {};
    if (!topic_id) return res.status(400).json({ error: 'Datos inválidos', fields: { topic_id: 'Requerido' } });
    const { rows: topics } = await pool.query('SELECT * FROM topics WHERE id = $1', [topic_id]);
    if (!topics[0]) return res.status(404).json({ error: 'Topic no encontrado' });

    const proposal = await generateProposal(topics[0], format || 'nota', angle);
    const { rows } = await pool.query(
      `INSERT INTO content_proposals (topic_id, format, title, body, dek, section, angulo, sensibilidad, origin, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Generado con IA', 'propuesta') RETURNING *`,
      [topic_id, format || 'nota', proposal.title, proposal.body, proposal.dek, proposal.section, proposal.angulo, proposal.sensibilidad]
    );
    await logActivity(pool, 'generate_proposal', `Propuesta creada: ${proposal.title}`, req.user.id, 'exito', { topic_id, format });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/content/generate-draft — genera el borrador extendido de una propuesta (solo en estado 'borrador').
router.post('/generate-draft', requireAuth, async (req, res, next) => {
  try {
    const { proposal_id, instructions } = req.body || {};
    if (!proposal_id) return res.status(400).json({ error: 'Datos inválidos', fields: { proposal_id: 'Requerido' } });
    const { rows } = await pool.query('SELECT * FROM content_proposals WHERE id = $1', [proposal_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (rows[0].status !== 'borrador') {
      return res.status(409).json({ error: `Solo se puede generar borrador cuando el estado es 'borrador' (actual: '${rows[0].status}')` });
    }
    const body = await generateDraft(rows[0], instructions);
    await pool.query('UPDATE content_proposals SET body = $1, updated_at = now() WHERE id = $2', [body, proposal_id]);
    await logActivity(pool, 'generate_draft', `Borrador generado para propuesta ${proposal_id}`, req.user.id, 'exito', { proposal_id });
    res.json({ body });
  } catch (err) {
    next(err);
  }
});

// POST /api/content/qa-check — verifica calidad de texto (ortografía, símbolos, coherencia).
router.post('/qa-check', requireAuth, async (req, res, next) => {
  try {
    const { proposal_id } = req.body || {};
    if (!proposal_id) return res.status(400).json({ error: 'Datos inválidos', fields: { proposal_id: 'Requerido' } });
    const { rows } = await pool.query('SELECT title, body FROM content_proposals WHERE id = $1', [proposal_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (!rows[0].body || !rows[0].body.trim()) {
      return res.status(400).json({ error: 'La propuesta no tiene cuerpo que verificar' });
    }
    const result = await qaCheck(rows[0].title, rows[0].body);
    await logActivity(pool, 'qa_check', `QA para propuesta ${proposal_id}`, req.user.id, 'exito', { score: result.score, issueCount: (result.issues || []).length });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
