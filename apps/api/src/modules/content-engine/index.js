const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../../db/pool');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { generateProposal, generateDraft, qaCheck, generateImage, logActivity } = require('../../lib/ai-client');

const router = express.Router();

// Cada endpoint pega a APIs de pago (OpenRouter/Claude/Perplexity). Tope por
// usuario para que una cuenta comprometida no queme el presupuesto. Va DESPUÉS
// de requireAuth en cada ruta, así req.user.id ya existe como clave.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Demasiadas generaciones con IA. Espera unos minutos.' },
});

// POST /api/content/generate-proposal — genera una propuesta de contenido a partir de un topic de RADAR.
//
// Antes de gastar en IA:
//  0) verificación RADAR — topics con verification_status='risk' → 409 salvo {force:true}
//     (mismo override que canibalización). checking/signal se permiten con warning.
//  1) canibalización — nota PUBLICADA similar (pg_trgm) → 409 salvo force.
//  2) contexto de competencia — hasta 3 posts similares para ángulo distinto.
router.post('/generate-proposal', requireAuth, aiLimiter, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { topic_id, format, angle, force } = req.body || {};
    if (!topic_id) return res.status(400).json({ error: 'Datos inválidos', fields: { topic_id: 'Requerido' } });
    const { rows: topics } = await pool.query('SELECT * FROM topics WHERE id = $1', [topic_id]);
    if (!topics[0]) return res.status(404).json({ error: 'Topic no encontrado' });

    const topic = topics[0];
    const vStatus = topic.verification_status || null;

    if (!force && vStatus === 'risk') {
      await logActivity(pool, 'generate_proposal', `Bloqueado por verificación risk: ${topic.title}`, req.user.id, 'fallo', {
        topic_id,
        verification_status: 'risk',
        confidence: topic.confidence,
        reason: 'verification_risk',
      });
      return res.status(409).json({
        error: 'Este tema está marcado como riesgo editorial (rumor, clickbait o fuente débil). No se genera propuesta automática. Manda "force": true para forzar de todas formas.',
        code: 'verification_risk',
        verification_status: 'risk',
        confidence: topic.confidence,
        editorial_decision: topic.editorial_decision || null,
        risk_flags: topic.risk_flags || [],
      });
    }

    if (!force) {
      const { rows: similar } = await pool.query(
        `SELECT id, title, slug, similarity(title, $1) AS score FROM content_proposals
         WHERE status = 'published' AND similarity(title, $1) > 0.35
         ORDER BY score DESC LIMIT 3`,
        [topic.title]
      );
      if (similar.length) {
        return res.status(409).json({
          error: 'Ya existe contenido publicado muy similar a este tema (posible canibalización). Manda "force": true en el body para generar de todas formas.',
          similar,
        });
      }
    }

    const { rows: competitorContext } = await pool.query(
      `SELECT source_account, post_text FROM competitor_posts
       WHERE post_text IS NOT NULL AND similarity(post_text, $1) > 0.15
       ORDER BY similarity(post_text, $1) DESC LIMIT 3`,
      [topic.title]
    );

    const { proposal, usage, model } = await generateProposal(topic, format || 'nota', angle, competitorContext);
    const { rows } = await pool.query(
      `INSERT INTO content_proposals (topic_id, format, title, body, dek, section, angulo, sensibilidad, origin, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Generado con IA', 'propuesta') RETURNING *`,
      [topic_id, format || 'nota', proposal.title, proposal.body, proposal.dek, proposal.section, proposal.angulo, proposal.sensibilidad]
    );
    const warnings = [];
    if (vStatus === 'checking' || vStatus === 'signal') {
      warnings.push(
        vStatus === 'checking'
          ? 'El tema sigue en verificación: conviene corroborar fuentes antes de publicar.'
          : 'El tema es solo una señal: falta dato clave; la propuesta puede requerir más research.'
      );
    }
    if (force && vStatus === 'risk') {
      warnings.push('Propuesta forzada sobre un tema de riesgo editorial alto.');
    }
    await logActivity(pool, 'generate_proposal', `Propuesta creada: ${proposal.title}`, req.user.id, 'exito', {
      topic_id,
      format,
      model,
      usage,
      competitor_matches: competitorContext.length,
      verification_status: vStatus,
      forced: Boolean(force),
    });
    const body = rows[0];
    if (warnings.length) body.warnings = warnings;
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
});

// GET /api/content/ai-usage?days=30 — gasto real de IA agregado desde
// activity_log.metadata (tokens reportados por la API en cada llamada, NO
// estimados por caracteres). Cubre radar_detect(_auto) y generate_proposal —
// las únicas rutas donde ai-client.js hoy bubblea `usage` hacia arriba.
router.get('/ai-usage', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const { rows } = await pool.query(
      `SELECT action, metadata->>'model' AS model, (metadata->'usage'->>'total_tokens')::int AS total_tokens
       FROM activity_log
       WHERE action IN ('radar_detect', 'radar_detect_auto', 'generate_proposal')
         AND (metadata->'usage'->>'total_tokens') IS NOT NULL
         AND created_at >= now() - ($1 || ' days')::interval`,
      [days]
    );
    const byAction = {};
    let totalTokens = 0;
    for (const row of rows) {
      totalTokens += row.total_tokens;
      byAction[row.action] = byAction[row.action] || { calls: 0, tokens: 0, model: row.model };
      byAction[row.action].calls += 1;
      byAction[row.action].tokens += row.total_tokens;
    }
    res.json({
      days, calls: rows.length, totalTokens, byAction,
      note: 'Tokens reportados por la API (no estimados). Multiplica totalTokens / 1e6 por tu tarifa real de Nous Portal / Perplexity para calcular el costo en $.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/content/generate-draft — genera el borrador extendido de una propuesta (solo en estado 'borrador').
router.post('/generate-draft', requireAuth, aiLimiter, async (req, res, next) => {
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

// POST /api/content/generate-image — genera imagen de portada con IA para una propuesta
// en borrador. El prompt viaja desde el cliente (refleja el título/dek en pantalla aunque
// no estén guardados). La imagen queda en generated_images y cover_image_url apunta a
// /api/public/images/:id (ruta relativa: web y admin se sirven desde el mismo origen).
router.post('/generate-image', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { proposal_id, prompt } = req.body || {};
    if (!proposal_id) return res.status(400).json({ error: 'Datos inválidos', fields: { proposal_id: 'Requerido' } });
    if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: 'Datos inválidos', fields: { prompt: 'Requerido' } });
    const { rows } = await pool.query('SELECT id, status FROM content_proposals WHERE id = $1', [proposal_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (rows[0].status !== 'borrador') {
      return res.status(409).json({ error: `Solo se puede generar imagen cuando el estado es 'borrador' (actual: '${rows[0].status}')` });
    }
    const cleanPrompt = String(prompt).trim();
    const image = await generateImage(cleanPrompt);
    // Borrar portadas previas de esta propuesta: cover_image_url solo apunta a la
    // última, las anteriores quedaban huérfanas (BYTEA) acumulando espacio en cada regen.
    await pool.query('DELETE FROM generated_images WHERE proposal_id = $1', [proposal_id]);
    const { rows: imgRows } = await pool.query(
      'INSERT INTO generated_images (proposal_id, prompt, mime_type, data) VALUES ($1, $2, $3, $4) RETURNING id',
      [proposal_id, cleanPrompt, image.mimeType, image.buffer]
    );
    const coverUrl = `/api/public/images/${imgRows[0].id}`;
    await pool.query(
      'UPDATE content_proposals SET cover_image_url = $1, image_prompt = $2, updated_at = now() WHERE id = $3',
      [coverUrl, cleanPrompt, proposal_id]
    );
    await logActivity(pool, 'generate_image', `Imagen de portada generada para propuesta ${proposal_id}`, req.user.id, 'exito', { proposal_id, model: 'openrouter' });
    res.json({ cover_image_url: coverUrl });
  } catch (err) {
    next(err);
  }
});

// POST /api/content/qa-check — verifica calidad de texto (ortografía, símbolos, coherencia).
router.post('/qa-check', requireAuth, aiLimiter, async (req, res, next) => {
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
