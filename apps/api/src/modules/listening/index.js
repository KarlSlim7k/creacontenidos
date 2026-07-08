const express = require('express');
const pool = require('../../db/pool');
const config = require('../../config');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { detectTopics, detectCompetitorPosts, logActivity } = require('../../lib/ai-client');
const { scrapeCompetitorPosts } = require('../../lib/competitor-scraper-client');

const router = express.Router();

// Ajustar a los competidores reales del territorio; el body de /competitors/detect
// puede sobrescribirlos por request ({ competitors: [...] }).
const DEFAULT_COMPETITORS = ['Diario de Xalapa', 'AVC Noticias', 'El Dictamen'];

// Insert a batch of competitor posts into competitor_posts with URL-based
// dedupe. Shared by both the Perplexity and the Facebook scraper code paths
// so the contract with the table is defined once.
async function insertCompetitorPosts(posts) {
  const inserted = [];
  for (const post of posts) {
    if (post.post_url) {
      const { rows: dupes } = await pool.query('SELECT id FROM competitor_posts WHERE post_url = $1', [post.post_url]);
      if (dupes.length) continue;
    }
    const postDate = post.post_date && !Number.isNaN(Date.parse(post.post_date)) ? post.post_date : null;
    const { rows } = await pool.query(
      `INSERT INTO competitor_posts (source_platform, source_account, post_url, post_text, post_date, reactions, comments, shares, views, media_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        post.source_platform || 'web',
        post.source_account || null,
        post.post_url || null,
        post.post_text || null,
        postDate,
        Number(post.reactions) || 0,
        Number(post.comments) || 0,
        Number(post.shares) || 0,
        Number(post.views) || 0,
        post.media_type || null,
      ],
    );
    inserted.push(rows[0]);
  }
  return inserted;
}

// POST /api/listening/topics/detect — detección de tendencias vía IA (Nous Portal).
router.post('/topics/detect', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  const query = (req.body && req.body.query) || 'tendencias y noticias relevantes en Perote, Veracruz, México';
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

// --- Radar de competencia (competitor_posts, migración 008) ---

// POST /api/listening/competitors/detect — escaneo de publicaciones.
//
// Acepta `source` en el body para elegir el origen de los datos:
//
//   - "facebook" (opt-in): delega al microservicio apps/competitor-scraper
//     (Playwright + cookies de sesión). Solo funciona si COMPETITOR_SCRAPER_URL
//     está configurado en el entorno del API. El body debe traer `accounts`
//     (handles o URLs de Facebook). El scraper devuelve items ya con
//     source_platform='facebook'. Inserta en competitor_posts con dedupe por
//     post_url. Log a activity_log con action='competitors_scrape_fb'.
//
//   - "perplexity" (default si se omite): usa detectCompetitorPosts (Perplexity
//     Sonar Pro). El body trae `competitors` (nombres legibles, p. ej.
//     "Diario de Xalapa"). Inserta en competitor_posts igual.
//
// Cualquier valor distinto de "facebook"/"perplexity" → 400.
router.post('/competitors/detect', requireAuth, requireRole('director', 'produccion'), async (req, res) => {
  const source = String((req.body && req.body.source) || 'perplexity').toLowerCase();

  if (source === 'facebook') {
    const accounts = Array.isArray(req.body && req.body.accounts) ? req.body.accounts.map(String).map((s) => s.trim()).filter(Boolean) : [];

    if (accounts.length === 0) {
      return res.status(400).json({ error: 'accounts must be a non-empty array of Facebook handles or URLs when source="facebook"' });
    }
    if (!config.competitorScraperUrl) {
      return res.status(503).json({ error: 'competitor_scraper_not_configured', detail: 'COMPETITOR_SCRAPER_URL no está configurado en el API. Define la env var o usa source: "perplexity".' });
    }

    try {
      const items = await scrapeCompetitorPosts({
        baseUrl: config.competitorScraperUrl,
        accounts,
        maxPostsPerAccount: req.body.maxPostsPerAccount,
        sinceDate: req.body.sinceDate,
        signal: req.signal,
        logger: req.log,
      });

      const inserted = await insertCompetitorPosts(items);

      // Log sin contenido de posts ni cookies — solo conteos.
      await logActivity(pool, 'competitors_scrape_fb', `${inserted.length} publicaciones scrapeadas de Facebook`, req.user.id, 'exito', {
        accounts_count: accounts.length,
        returned: items.length,
        inserted: inserted.length,
      });

      return res.json({ detected: inserted.length, source: 'facebook', posts: inserted });
    } catch (err) {
      await logActivity(pool, 'competitors_scrape_fb', err.message, req.user.id, 'fallo', { accounts_count: accounts.length });
      return res.status(500).json({ error: 'No se pudo escanear Facebook: ' + err.message });
    }
  }

  if (source === 'perplexity') {
    const bodyList = (req.body && req.body.competitors) || null;
    const competitors = Array.isArray(bodyList) && bodyList.length
      ? bodyList.map(String).map((s) => s.trim()).filter(Boolean)
      : DEFAULT_COMPETITORS;
    try {
      const detected = await detectCompetitorPosts(competitors);
      const inserted = await insertCompetitorPosts(detected);
      await logActivity(pool, 'competitors_detect', `${inserted.length} publicaciones de competencia detectadas`, req.user.id, 'exito', { competitors, count: inserted.length });
      return res.json({ detected: inserted.length, source: 'perplexity', posts: inserted });
    } catch (err) {
      await logActivity(pool, 'competitors_detect', err.message, req.user.id, 'fallo', { competitors });
      return res.status(500).json({ error: 'No se pudo escanear la competencia: ' + err.message });
    }
  }

  return res.status(400).json({ error: `unknown source "${source}". Use "perplexity" (default) or "facebook".` });
});

// GET /api/listening/competitors?analyzed=true|false — tab Competencia del RADAR.
router.get('/competitors', requireAuth, async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.analyzed === 'true' || req.query.analyzed === 'false') {
      params.push(req.query.analyzed === 'true');
      where = `WHERE analyzed = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, source_platform, source_account, post_url, post_text, post_date,
              reactions, comments, shares, views, media_type, scraped_at, analyzed
       FROM competitor_posts ${where} ORDER BY post_date DESC NULLS LAST, scraped_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/listening/competitors/:id — marcar analizado (o revertir).
router.patch('/competitors/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    if (typeof (req.body || {}).analyzed !== 'boolean') return res.status(400).json({ error: 'analyzed (boolean) es requerido' });
    const { rows } = await pool.query(
      'UPDATE competitor_posts SET analyzed = $1 WHERE id = $2 RETURNING *',
      [req.body.analyzed, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Publicación no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/listening/competitors/:id
router.delete('/competitors/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM competitor_posts WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Publicación no encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
