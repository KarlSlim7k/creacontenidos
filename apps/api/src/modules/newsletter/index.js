const express = require('express');
const pool = require('../../db/pool');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { renderNewsletterHtml, renderNewsletterText, renderPodcastScript } = require('../../lib/newsletter-template');
const { sendBroadcast, countActiveSubscribers } = require('../../lib/resend-client');
const { synthesizeSpeech } = require('../../lib/elevenlabs-client');
const { logActivity } = require('../../lib/ai-client');
const { generateContent } = require('../../lib/newsletter-content');

const router = express.Router();

function buildContent(body) {
  const { weekday, date, clima, notaDelDia, enBreve, datoDelDia, agenda, patrocinador } = body || {};
  if (!weekday || !date || !clima || !notaDelDia || !notaDelDia.titulo || !notaDelDia.cuerpo) {
    const err = new Error('Datos inválidos: weekday, date, clima y notaDelDia (titulo, cuerpo) son requeridos');
    err.status = 400;
    throw err;
  }
  return { weekday, date, clima, notaDelDia, enBreve: enBreve || [], datoDelDia, agenda, patrocinador: patrocinador || null };
}

// POST /api/newsletter/generate — arma el contenido del día y lo deja guardado
// como edición 'pendiente' (para que sobreviva aunque el cron lo genere sin
// que nadie tenga el panel abierto). Nunca envía nada.
router.post('/generate', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const content = await generateContent();
    await pool.query(
      `INSERT INTO newsletter_editions (edition_date, weekday, date_label, content, status, generated_at)
       VALUES (CURRENT_DATE, $1, $2, $3, 'pendiente', now())
       ON CONFLICT (edition_date) DO UPDATE SET content = $3, status = 'pendiente', generated_at = now()`,
      [content.weekday, content.date, JSON.stringify(content)]
    );
    await logActivity(pool, 'newsletter_generate', `Contenido generado para ${content.weekday} ${content.date}`, req.user.id, 'exito', { topicsUsed: content.topicsUsed });
    res.json(content);
  } catch (err) {
    await logActivity(pool, 'newsletter_generate', err.message, req.user.id, 'fallo', null);
    next(err);
  }
});

// GET /api/newsletter/pending — edición de hoy en estado 'pendiente' (si el
// cron ya la generó, o si alguien la generó manualmente y no la ha enviado).
router.get('/pending', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT content FROM newsletter_editions WHERE edition_date = CURRENT_DATE AND status = 'pendiente'`
    );
    res.json(rows[0] ? rows[0].content : null);
  } catch (err) {
    next(err);
  }
});

// POST /api/newsletter/preview — arma el HTML sin enviar nada (vista previa en el panel).
router.post('/preview', requireAuth, requireRole('director', 'produccion'), (req, res, next) => {
  try {
    const data = buildContent(req.body);
    res.json({ html: renderNewsletterHtml(data), text: renderNewsletterText(data) });
  } catch (err) {
    next(err);
  }
});

// POST /api/newsletter/send — arma el HTML y lo envía como broadcast de Resend
// a la Audiencia General. Solo director (envío real, sin vuelta atrás).
router.post('/send', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const content = buildContent(req.body);
    const subject = `Buenos días, Perote — ${content.weekday} ${content.date}`;
    const broadcast = await sendBroadcast({
      subject,
      html: renderNewsletterHtml(content),
      text: renderNewsletterText(content),
    });
    await pool.query(
      `UPDATE newsletter_editions SET status = 'enviado', sent_at = now(), sent_by = $1 WHERE edition_date = CURRENT_DATE`,
      [req.user.id]
    );
    await logActivity(pool, 'newsletter_send', `Newsletter enviado: ${subject}`, req.user.id, 'exito', { broadcastId: broadcast.id });
    res.json({ ok: true, broadcastId: broadcast.id });
  } catch (err) {
    await logActivity(pool, 'newsletter_send', err.message, req.user.id, 'fallo', null);
    next(err);
  }
});

// POST /api/newsletter/audio — TTS de prueba (ElevenLabs). NO VERIFICADO en vivo:
// la cuenta free bloquea voces vía API (402). Devuelve el MP3 directo.
router.post('/audio', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const content = buildContent(req.body);
    const script = renderPodcastScript(content);
    const audio = await synthesizeSpeech(script);
    await logActivity(pool, 'newsletter_audio', `Audio generado para ${content.weekday} ${content.date}`, req.user.id, 'exito', null);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (err) {
    await logActivity(pool, 'newsletter_audio', err.message, req.user.id, 'fallo', null);
    next(err);
  }
});

// --- Agenda (newsletter_events) ---

// GET /api/newsletter/events?from=&to= — rango de fechas, default próximos 14 días.
router.get('/events', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const from = req.query.from || null;
    const to = req.query.to || null;
    const { rows } = await pool.query(
      `SELECT id, event_date, title FROM newsletter_events
       WHERE event_date >= COALESCE($1::date, CURRENT_DATE)
         AND event_date <= COALESCE($2::date, CURRENT_DATE + interval '14 days')
       ORDER BY event_date, id`,
      [from, to]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/newsletter/events — { event_date: 'YYYY-MM-DD', title }
router.post('/events', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { event_date, title } = req.body || {};
    if (!event_date || typeof title !== 'string' || !title.trim() || title.length > 300) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { event_date: 'Requerido', title: 'Requerido, máximo 300 caracteres' } });
    }
    const { rows } = await pool.query(
      `INSERT INTO newsletter_events (event_date, title, created_by) VALUES ($1, $2, $3) RETURNING id, event_date, title`,
      [event_date, title.trim(), req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/newsletter/events/:id
router.delete('/events/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM newsletter_events WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Evento no encontrado' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/newsletter/subscribers/count — total de suscriptores activos (Resend).
router.get('/subscribers/count', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    res.json({ count: await countActiveSubscribers() });
  } catch (err) {
    next(err);
  }
});

// --- Configuración del cron (hora + activo/inactivo) ---

router.get('/settings', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT enabled, send_hour, send_minute FROM newsletter_settings WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/settings', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { enabled, send_hour, send_minute } = req.body || {};
    if (typeof enabled !== 'boolean' || !Number.isInteger(send_hour) || send_hour < 0 || send_hour > 23
      || !Number.isInteger(send_minute) || send_minute < 0 || send_minute > 59) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { enabled: 'boolean', send_hour: '0-23', send_minute: '0-59' } });
    }
    const { rows } = await pool.query(
      `UPDATE newsletter_settings SET enabled = $1, send_hour = $2, send_minute = $3, updated_at = now()
       WHERE id = 1 RETURNING enabled, send_hour, send_minute`,
      [enabled, send_hour, send_minute]
    );
    await logActivity(pool, 'newsletter_settings', `Cron ${enabled ? 'activado' : 'desactivado'} — ${String(send_hour).padStart(2, '0')}:${String(send_minute).padStart(2, '0')}`, req.user.id, 'exito', null);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
