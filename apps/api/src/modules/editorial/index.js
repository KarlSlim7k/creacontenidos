const express = require('express');
const pool = require('../../db/pool');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

// --- Bandeja de ideas ---

// GET /api/editorial/ideas — colaborador ve solo las suyas; director/producción ven todas (kanban).
router.get('/ideas', requireAuth, async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.user.role === 'colaborador') {
      params.push(req.user.id);
      where = 'WHERE si.collaborator_id = $1';
    }
    const { rows } = await pool.query(
      `SELECT si.id, si.title, si.category, si.description, si.score, si.column_status,
              u.id AS collaborator_id, u.name AS collaborator_name
       FROM story_ideas si LEFT JOIN users u ON u.id = si.collaborator_id
       ${where} ORDER BY si.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/editorial/ideas — cualquier usuario autenticado propone una idea (a su propio nombre).
router.post('/ideas', requireAuth, async (req, res, next) => {
  try {
    const { title, category, description } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.length > 300) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { title: 'Requerido, máximo 300 caracteres' } });
    }
    const { rows } = await pool.query(
      `INSERT INTO story_ideas (title, category, description, collaborator_id, column_status)
       VALUES ($1, $2, $3, $4, 'nueva') RETURNING id, title, category, description, column_status`,
      [title.trim(), category || null, description || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/editorial/ideas/:id — mover de columna (director/producción).
const IDEA_COLUMNS = ['nueva', 'en_analisis', 'aprobada', 'descartada'];
router.patch('/ideas/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { column_status } = req.body || {};
    if (!IDEA_COLUMNS.includes(column_status)) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { column_status: 'Valor inválido' } });
    }
    const { rows } = await pool.query(
      `UPDATE story_ideas SET column_status = $1, updated_at = now() WHERE id = $2
       RETURNING id, title, category, description, column_status`,
      [column_status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Idea no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/editorial/ideas/:id — solo director.
router.delete('/ideas/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM story_ideas WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Idea no encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Propuestas / piezas (content_proposals) ---
// Pipeline: 'propuesta' → 'borrador' → 'en_revision' → 'published' (gate) | 'rechazada'.

const PROPOSAL_FIELDS = `id, topic_id, format, title, body, dek, section, slug, cover_image_url,
  angulo, sensibilidad, origin, status, author_id, review_comment, published_at, created_at, updated_at`;

// GET /api/editorial/proposals?status=a,b&author_id=
router.get('/proposals', requireAuth, async (req, res, next) => {
  try {
    const params = [];
    const clauses = [];
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean);
      params.push(statuses);
      clauses.push(`status = ANY($${params.length})`);
    }
    if (req.query.author_id) {
      params.push(req.query.author_id);
      clauses.push(`author_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${PROPOSAL_FIELDS} FROM content_proposals ${where} ORDER BY updated_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/proposals/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${PROPOSAL_FIELDS} FROM content_proposals WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

async function requireStatus(id, expected, res) {
  const { rows } = await pool.query('SELECT status FROM content_proposals WHERE id = $1', [id]);
  if (!rows[0]) {
    res.status(404).json({ error: 'No encontrada' });
    return false;
  }
  if (rows[0].status !== expected) {
    res.status(409).json({ error: `Solo aplica cuando el estado es '${expected}' (actual: '${rows[0].status}')` });
    return false;
  }
  return true;
}

// Propuestas IA: aprobar → entra al editor como borrador.
router.patch('/proposals/:id/approve', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    if (!(await requireStatus(req.params.id, 'propuesta', res))) return;
    const { rows } = await pool.query(
      `UPDATE content_proposals SET status = 'borrador', author_id = COALESCE(author_id, $1), updated_at = now()
       WHERE id = $2 RETURNING ${PROPOSAL_FIELDS}`,
      [req.user.id, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Propuestas IA: rechazar con motivo.
router.patch('/proposals/:id/reject', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    if (!(await requireStatus(req.params.id, 'propuesta', res))) return;
    const { reason } = req.body || {};
    if (typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { reason: 'Motivo requerido' } });
    }
    const { rows } = await pool.query(
      `UPDATE content_proposals SET status = 'rechazada', review_comment = $1, updated_at = now()
       WHERE id = $2 RETURNING ${PROPOSAL_FIELDS}`,
      [reason.trim(), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Editor: guardar borrador (título, cuerpo, sección, SEO...). Solo mientras está en 'borrador'.
const DRAFT_FIELDS = { title: 400, dek: 300, section: 40, slug: 200, cover_image_url: 500 };
router.patch('/proposals/:id/draft', requireAuth, async (req, res, next) => {
  try {
    if (!(await requireStatus(req.params.id, 'borrador', res))) return;
    const sets = [];
    const params = [];
    for (const [field, max] of Object.entries(DRAFT_FIELDS)) {
      if (req.body[field] === undefined) continue;
      const value = String(req.body[field]).trim();
      if (value.length > max) return res.status(400).json({ error: 'Datos inválidos', fields: { [field]: `Máximo ${max} caracteres` } });
      params.push(value || null);
      sets.push(`${field} = $${params.length}`);
    }
    if (req.body.body !== undefined) {
      params.push(String(req.body.body));
      sets.push(`body = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE content_proposals SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}
       RETURNING ${PROPOSAL_FIELDS}`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Editor: enviar a revisión.
router.patch('/proposals/:id/submit-review', requireAuth, async (req, res, next) => {
  try {
    if (!(await requireStatus(req.params.id, 'borrador', res))) return;
    const { rows } = await pool.query(
      `UPDATE content_proposals SET status = 'en_revision', updated_at = now() WHERE id = $1
       RETURNING ${PROPOSAL_FIELDS}`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Aprobación (solo director): publica — exige origen del contenido (transparencia) y slug ya definido.
const VALID_ORIGINS = ['100% humano', 'Asistido por IA', 'Generado con IA'];
router.patch('/proposals/:id/publish', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    if (!(await requireStatus(req.params.id, 'en_revision', res))) return;
    const { origin } = req.body || {};
    if (!VALID_ORIGINS.includes(origin)) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { origin: 'Origen del contenido requerido' } });
    }
    const { rows: current } = await pool.query('SELECT slug, title FROM content_proposals WHERE id = $1', [req.params.id]);
    if (!current[0].slug) {
      return res.status(400).json({ error: 'Falta asignar un slug antes de publicar (Editor de nota)' });
    }
    const { rows } = await pool.query(
      `UPDATE content_proposals SET status = 'published', origin = $1, published_at = now(), updated_at = now()
       WHERE id = $2 RETURNING ${PROPOSAL_FIELDS}`,
      [origin, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Aprobación (solo director): devolver con comentarios.
router.patch('/proposals/:id/return', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    if (!(await requireStatus(req.params.id, 'en_revision', res))) return;
    const { comment } = req.body || {};
    if (typeof comment !== 'string' || !comment.trim()) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { comment: 'Motivo requerido' } });
    }
    const { rows } = await pool.query(
      `UPDATE content_proposals SET status = 'borrador', review_comment = $1, updated_at = now()
       WHERE id = $2 RETURNING ${PROPOSAL_FIELDS}`,
      [comment.trim(), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/editorial/proposals/:id — solo propuestas rechazadas, solo director.
router.delete('/proposals/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    if (!(await requireStatus(req.params.id, 'rechazada', res))) return;
    await pool.query('DELETE FROM content_proposals WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/editorial/pipeline — estado real del boletín "Buenos días, Perote" del día,
// derivado de newsletter_editions (generación/envío) + activity_log (audio) + topics
// (listening). Antes 3 de los 6 pasos quedaban fijos en "pendiente" sin consultar nada;
// ahora sí reflejan lo que de verdad pasó hoy.
router.get('/pipeline', requireAuth, async (req, res, next) => {
  try {
    const [topicsResult, editionResult, audioResult] = await Promise.all([
      pool.query(`SELECT max(detected_at) AS at FROM topics WHERE detected_at >= now() - interval '48 hours'`),
      pool.query(`SELECT content, status, generated_at, sent_at FROM newsletter_editions WHERE edition_date = CURRENT_DATE`),
      pool.query(
        `SELECT created_at FROM activity_log
         WHERE action = 'newsletter_audio' AND status = 'exito' AND created_at >= CURRENT_DATE
         ORDER BY created_at DESC LIMIT 1`
      ),
    ]);
    const topicsAt = topicsResult.rows[0] && topicsResult.rows[0].at;
    const edition = editionResult.rows[0];
    const clima = edition && edition.content && edition.content.clima;
    const audio = audioResult.rows[0];

    const steps = [
      { label: 'Social listening', status: topicsAt ? 'completado' : 'pendiente', at: topicsAt || null },
      { label: 'Borrador generado', status: edition ? 'completado' : 'pendiente', at: edition ? edition.generated_at : null },
      { label: 'Clima agregado', status: clima ? 'completado' : 'pendiente', at: clima ? edition.generated_at : null },
      {
        label: 'Aprobación / envío manual',
        status: edition && edition.status === 'enviado' ? 'completado' : (edition && edition.status === 'pendiente' ? 'esperando' : 'pendiente'),
        at: edition && edition.status === 'enviado' ? edition.sent_at : null,
      },
      { label: 'Audio generado', status: audio ? 'completado' : 'pendiente', at: audio ? audio.created_at : null },
      { label: 'Envío', status: edition && edition.sent_at ? 'completado' : 'pendiente', at: edition ? edition.sent_at : null },
    ];
    res.json(steps);
  } catch (err) {
    next(err);
  }
});

// --- Métricas ---
// Crecimiento por canal / alcance total agregado no tienen fuente real (sin integración de
// analytics) — se devuelven vacíos a propósito; el frontend los pinta como "sin datos aún"
// en vez de simular números.
const WEEKLY_GOAL = 10;

router.get('/metrics', requireAuth, async (req, res, next) => {
  try {
    const { rows: [{ count }] } = await pool.query(
      `SELECT count(*)::int AS count FROM content_proposals
       WHERE status = 'published' AND published_at >= date_trunc('week', now())`
    );
    const { rows: weeklyPieces } = await pool.query(
      `SELECT to_char(date_trunc('week', published_at), 'YYYY-MM-DD') AS week, count(*)::int AS count
       FROM content_proposals
       WHERE status = 'published' AND published_at >= now() - interval '6 weeks'
       GROUP BY 1 ORDER BY 1`
    );
    const { rows: [{ total }] } = await pool.query(
      `SELECT count(*)::int AS total FROM content_proposals WHERE status = 'published'`
    );
    const { rows: [{ rejected }] } = await pool.query(
      `SELECT count(*)::int AS rejected FROM content_proposals WHERE status = 'rechazada'`
    );
    const { rows: [{ avg_days }] } = await pool.query(
      `SELECT avg(extract(epoch FROM (published_at - created_at)) / 86400) AS avg_days
       FROM content_proposals WHERE status = 'published' AND published_at >= created_at`
    );
    const { rows: topSections } = await pool.query(
      `SELECT section, count(*)::int AS count FROM content_proposals
       WHERE status = 'published' AND section IS NOT NULL
       GROUP BY section ORDER BY count DESC LIMIT 5`
    );
    const { rows: authors } = await pool.query(
      `SELECT u.name, count(*)::int AS published FROM content_proposals cp
       JOIN users u ON u.id = cp.author_id
       WHERE cp.status = 'published'
       GROUP BY u.name ORDER BY published DESC`
    );
    res.json({
      piecesPublished: count,
      weeklyGoal: WEEKLY_GOAL,
      weeklyPieces,
      socialChannels: [], // sin integración de analytics todavía
      totalReach: null, // sin integración de analytics todavía
      totalPieces: total,
      approvalRate: (total + rejected) > 0 ? Math.round((total / (total + rejected)) * 10000) / 100 : null,
      avgDraftDays: avg_days != null ? Math.round(Number(avg_days) * 10) / 10 : null,
      topSections,
      authors,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
