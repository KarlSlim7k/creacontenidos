const express = require('express');
const pool = require('../../db/pool');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

const PIPELINE_STAGES = ['identificado', 'contactado', 'propuesta_enviada', 'cerrado'];

// GET /api/commercial/clients?stage= — kanban de prospectos.
router.get('/clients', requireAuth, requireRole('comercial', 'director'), async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.stage) {
      params.push(req.query.stage);
      where = `WHERE pipeline_stage = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, name, business_name, package, phone, email, active, pipeline_stage,
              interest, estimated_value, last_contact_at, owner_id, website_url, sponsor_copy, last_sponsored_at
       FROM clients ${where} ORDER BY last_contact_at DESC NULLS LAST`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/commercial/clients — alta manual de prospecto.
router.post('/clients', requireAuth, requireRole('comercial', 'director'), async (req, res, next) => {
  try {
    const { name, business_name, package: pkg, phone, email, pipeline_stage } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { name: 'Requerido' } });
    }
    const stage = pipeline_stage && PIPELINE_STAGES.includes(pipeline_stage) ? pipeline_stage : 'identificado';
    const { rows } = await pool.query(
      `INSERT INTO clients (name, business_name, package, phone, email, pipeline_stage, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, business_name, package, phone, email, active, pipeline_stage,
                 interest, estimated_value, last_contact_at, owner_id`,
      [name.trim(), business_name || null, pkg || null, phone || null, email || null, stage, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/commercial/clients/:id — solo director.
router.delete('/clients/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM clients WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// PATCH /api/commercial/clients/:id — mover de columna / actualizar seguimiento.
router.patch('/clients/:id', requireAuth, requireRole('comercial', 'director'), async (req, res, next) => {
  try {
    const { pipeline_stage, interest, estimated_value, website_url, sponsor_copy } = req.body || {};
    if (pipeline_stage !== undefined && !PIPELINE_STAGES.includes(pipeline_stage)) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { pipeline_stage: 'Valor inválido' } });
    }
    const { rows } = await pool.query(
      `UPDATE clients SET
         pipeline_stage = COALESCE($1, pipeline_stage),
         interest = COALESCE($2, interest),
         estimated_value = COALESCE($3, estimated_value),
         website_url = COALESCE($4, website_url),
         sponsor_copy = COALESCE($5, sponsor_copy),
         last_contact_at = now()
       WHERE id = $6
       RETURNING id, name, business_name, pipeline_stage, interest, estimated_value, last_contact_at, website_url, sponsor_copy`,
      [pipeline_stage || null, interest || null, estimated_value || null, website_url || null, sponsor_copy || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// --- Catálogo de servicios (servicios.html) — CRUD exclusivo de Director ---
// El sitio público lo lee vía GET /api/public/services (solo activos).

const SERVICE_FIELDS = 'id, name, price_label, description, features, cta_interest, sort_order, active';

function validateService(body, { partial } = {}) {
  const errors = {};
  const out = {};
  const str = (field, max, required) => {
    const raw = body[field];
    if (raw === undefined) { if (required && !partial) errors[field] = 'Requerido'; return; }
    if (typeof raw !== 'string' || !raw.trim()) { errors[field] = 'Requerido'; return; }
    if (raw.trim().length > max) { errors[field] = `Máximo ${max} caracteres`; return; }
    out[field] = raw.trim();
  };
  str('name', 200, true);
  str('price_label', 100, true);
  str('description', 1000, true);
  str('cta_interest', 100, false);
  if (body.features !== undefined) {
    if (!Array.isArray(body.features) || !body.features.every((f) => typeof f === 'string')) {
      errors.features = 'Debe ser una lista de texto';
    } else {
      out.features = body.features.map((f) => f.trim()).filter(Boolean);
    }
  }
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    out.sort_order = Number.isFinite(n) ? n : 0;
  }
  if (body.active !== undefined) out.active = !!body.active;
  return Object.keys(errors).length ? { errors } : { data: out };
}

// GET /api/commercial/services — catálogo completo (activos e inactivos) para el panel.
router.get('/services', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SERVICE_FIELDS} FROM service_packages ORDER BY sort_order, id`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/commercial/services — nuevo paquete.
router.post('/services', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { errors, data } = validateService(req.body || {});
    if (errors) return res.status(400).json({ error: 'Datos inválidos', fields: errors });
    const { rows } = await pool.query(
      `INSERT INTO service_packages (name, price_label, description, features, cta_interest, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SERVICE_FIELDS}`,
      [data.name, data.price_label, data.description, JSON.stringify(data.features || []),
       data.cta_interest || 'Otro', data.sort_order || 0, data.active !== undefined ? data.active : true]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/commercial/services/:id — editar campos / activar-desactivar.
router.patch('/services/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { errors, data } = validateService(req.body || {}, { partial: true });
    if (errors) return res.status(400).json({ error: 'Datos inválidos', fields: errors });
    const { rows } = await pool.query(
      `UPDATE service_packages SET
         name = COALESCE($1, name),
         price_label = COALESCE($2, price_label),
         description = COALESCE($3, description),
         features = COALESCE($4, features),
         cta_interest = COALESCE($5, cta_interest),
         sort_order = COALESCE($6, sort_order),
         active = COALESCE($7, active),
         updated_at = now()
       WHERE id = $8
       RETURNING ${SERVICE_FIELDS}`,
      [data.name || null, data.price_label || null, data.description || null,
       data.features ? JSON.stringify(data.features) : null, data.cta_interest || null,
       data.sort_order !== undefined ? data.sort_order : null,
       data.active !== undefined ? data.active : null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/commercial/services/:id
router.delete('/services/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM service_packages WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
