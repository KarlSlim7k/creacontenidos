const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../../db/pool');
const config = require('../../config');
const { addContact, updateContact, sendEmail } = require('../../lib/resend-client');
const { makeToken, readToken, confirmEmailHtml, confirmPage } = require('../../lib/newsletter-optin');
const { rateLimitKey } = require('../../lib/client-ip');

const router = express.Router();

// Rate limit sobre toda la superficie /api/public: 300 req / 15 min por IP real
// (CF-Connecting-IP, ver client-ip.js).
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, keyGenerator: rateLimitKey }));

// Solo campos públicos: nunca exponer image_prompt/topic_id ni borradores.
const ARTICLE_FIELDS = 'slug, title, dek, section, author_name, cover_image_url, published_at, is_sponsored, sponsor_name';

function pagination(query) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 50);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  return { limit, offset };
}

// GET /api/public/articles?section=&limit=&offset= — portada y sección.
router.get('/articles', async (req, res, next) => {
  try {
    const { limit, offset } = pagination(req.query);
    const params = [];
    let where = "status = 'published'";
    if (req.query.section) {
      params.push(req.query.section);
      where += ` AND section = $${params.length}`;
    }
    if (req.query.sponsored === 'true') {
      where += ' AND is_sponsored = true';
    }
    const orderBy = req.query.sort === 'views' ? 'view_count DESC' : 'published_at DESC';
    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT ${ARTICLE_FIELDS} FROM content_proposals
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/articles/:slug — nota completa; 404 si no existe o no está publicada.
router.get('/articles/:slug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${ARTICLE_FIELDS}, body FROM content_proposals
       WHERE slug = $1 AND status = 'published'`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Artículo no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Dedupe de vistas: misma IP + slug cuenta una sola vez por hora. En memoria,
// igual que el lock del cron. ponytail: single instance; si se escala a N
// réplicas, mover a tabla o Redis con TTL.
const VIEW_TTL_MS = 60 * 60 * 1000;
const viewSeen = new Map(); // "ip|slug" -> expiry ms
function alreadyViewed(ip, slug) {
  const now = Date.now();
  const key = ip + '|' + slug;
  const exp = viewSeen.get(key);
  if (exp && exp > now) return true;
  viewSeen.set(key, now + VIEW_TTL_MS);
  if (viewSeen.size > 5000) { // purga perezosa de vencidos
    for (const [k, e] of viewSeen) if (e <= now) viewSeen.delete(k);
  }
  return false;
}

// POST /api/public/articles/:slug/view — un clic en nota.html = una vista.
// Sin body ni respuesta útil para el cliente; solo incrementa el contador.
router.post('/articles/:slug/view', async (req, res, next) => {
  try {
    if (!alreadyViewed(rateLimitKey(req), req.params.slug)) {
      await pool.query(
        `UPDATE content_proposals SET view_count = view_count + 1
         WHERE slug = $1 AND status = 'published'`,
        [req.params.slug]
      );
    }
    res.status(204).end(); // 204 siempre: el cliente no distingue si contó o no
  } catch (err) {
    next(err);
  }
});

// GET /api/public/services — catálogo activo para estudio/servicios.html.
router.get('/services', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, price_label, description, features, cta_interest
       FROM service_packages WHERE active = true ORDER BY sort_order, id`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/site-metrics — estadísticas de audiencia (estudio/*.html), editables
// en el panel admin (Configuración → Métricas del sitio). Fila única.
router.get('/site-metrics', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT monthly_reach_label, municipalities_count, tercer_tiempo_listeners_label,
              audience_age_18_24_pct, audience_age_25_44_pct, audience_age_45_plus_pct,
              updated_at
       FROM site_metrics WHERE id = 1`
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/authors — autores con al menos una nota publicada, derivado de
// content_proposals (comunidad.html → "Colaboradores activos"). Sin tabla propia.
router.get('/authors', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT author_name, COUNT(*)::int AS article_count, array_agg(DISTINCT section) AS sections
       FROM content_proposals
       WHERE status = 'published' AND author_name IS NOT NULL
       GROUP BY author_name
       ORDER BY article_count DESC
       LIMIT 12`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/authors/:name/articles — piezas publicadas por autor (perfil.html).
router.get('/authors/:name/articles', async (req, res, next) => {
  try {
    const { limit, offset } = pagination(req.query);
    const { rows } = await pool.query(
      `SELECT ${ARTICLE_FIELDS} FROM content_proposals
       WHERE author_name = $1 AND status = 'published'
       ORDER BY published_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.name, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// --- Leads (formulario de contacto de Estudio) ---

// Rate limit estricto adicional SOLO para el POST de leads: 5 req / 15 min por IP,
// encima del límite general del router (300/15min).
const leadsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: rateLimitKey });

// Campo: [requerido, longitud máxima]. Validación en la frontera antes de tocar Postgres.
const LEAD_FIELDS = {
  name: [true, 200],
  email: [true, 320],
  message: [true, 5000],
  company: [false, 200],
  service_interest: [false, 200],
  source_page: [false, 200],
};
// Formato razonable, no RFC completo: algo@algo.tld sin espacios.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLead(body) {
  if (typeof body !== 'object' || body === null) return { errors: { body: 'Se esperaba un objeto JSON' } };
  const errors = {};
  const lead = {};
  for (const [field, [required, max]] of Object.entries(LEAD_FIELDS)) {
    const raw = body[field];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      if (required) errors[field] = 'Campo requerido';
      else lead[field] = null;
      continue;
    }
    if (typeof raw !== 'string') {
      errors[field] = 'Debe ser texto';
      continue;
    }
    const value = raw.trim();
    if (value.length > max) {
      errors[field] = `Máximo ${max} caracteres`;
      continue;
    }
    lead[field] = value;
  }
  if (!errors.email && lead.email && !EMAIL_RE.test(lead.email)) {
    errors.email = 'Formato de email inválido';
  }
  return Object.keys(errors).length ? { errors } : { lead };
}

// POST /api/public/leads — único endpoint público de escritura. Solo inserta en
// `leads` (nunca en tablas de contenido: el gate editorial no se toca).
router.post('/leads', leadsLimiter, async (req, res, next) => {
  try {
    // Honeypot: humanos no ven el campo `website`; si trae contenido es un bot.
    // Respuesta idéntica al éxito para no dar señal, pero sin insertar.
    if (req.body && typeof req.body === 'object' && req.body.website) {
      return res.status(201).json({ ok: true });
    }
    const { errors, lead } = validateLead(req.body);
    if (errors) return res.status(400).json({ error: 'Datos inválidos', fields: errors });
    await pool.query(
      `INSERT INTO leads (name, email, company, service_interest, message, source_page)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [lead.name, lead.email, lead.company, lead.service_interest, lead.message, lead.source_page]
    );
    // Sin fila ni id en la respuesta: el cliente público no necesita nada más.
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Newsletter "Buenos días, Perote" ---
// Fuente de verdad de suscriptores: Audiencia "General" en Resend (sin tabla propia).

const EMAIL_RE_NEWS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newsletterLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: rateLimitKey });

// POST /api/public/newsletter/subscribe
router.post('/newsletter/subscribe', newsletterLimiter, async (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object' && req.body.website) {
      return res.status(201).json({ ok: true });
    }
    const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim() : '';
    if (!email || email.length > 320 || !EMAIL_RE_NEWS.test(email)) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { email: 'Formato de email inválido' } });
    }
    // Doble opt-in: alta pendiente (unsubscribed) + correo de confirmación con
    // token firmado. Evita suscribir el correo de un tercero sin su consentimiento.
    await addContact(email, true);
    const confirmUrl = `${config.publicSiteUrl}/api/public/newsletter/confirm?token=${makeToken(email)}`;
    await sendEmail({
      to: email,
      subject: 'Confirma tu suscripción a "Buenos días, Perote"',
      html: confirmEmailHtml(confirmUrl),
      text: `Confirma tu suscripción a "Buenos días, Perote": ${confirmUrl}`,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/newsletter/confirm?token= — abierto desde el correo. Verifica
// el token y pasa el contacto a activo en Resend. Idempotente.
router.get('/newsletter/confirm', async (req, res, next) => {
  try {
    const email = readToken(req.query.token);
    if (!email) {
      return res.status(400).type('html').send(confirmPage('Enlace inválido', 'El enlace de confirmación no es válido o está incompleto. Suscríbete de nuevo desde el sitio.'));
    }
    await updateContact(email, false);
    res.type('html').send(confirmPage('¡Suscripción confirmada!', 'Ya recibirás "Buenos días, Perote" cada mañana. Gracias por leernos.'));
  } catch (err) {
    next(err);
  }
});

// GET /api/public/images/:id — sirve imágenes de portada generadas con IA
// (generated_images, migración 029). Público sin auth: el portal las renderiza
// en <img src>. UUID inválido = 404, no 500 (el cast a uuid lo valida Postgres).
router.get('/images/:id', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'Imagen no encontrada' });
    const etag = `"${req.params.id}"`;
    // Contenido inmutable por UUID: si el cliente/proxy ya lo tiene, 304 sin leer
    // el BYTEA de Postgres (ahorra la lectura completa ante revalidaciones).
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    const { rows } = await pool.query('SELECT mime_type, data FROM generated_images WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Imagen no encontrada' });
    res.set('Content-Type', rows[0].mime_type);
    res.set('ETag', etag);
    // Inmutable: cada generación crea una fila nueva con UUID nuevo, nunca se reescribe.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
