const express = require('express');
const pool = require('../../db/pool');
const config = require('../../config');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { detectCompetitorPosts, enrichFacebookTopics, logActivity } = require('../../lib/ai-client');
const { scrapeCompetitorPosts } = require('../../lib/competitor-scraper-client');
const { detectAndSaveTopics, insertTopicIfNew } = require('../../lib/topic-detection');

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

// Convierte publicaciones de Facebook recién scrapeadas en topics de RADAR
// (source='Facebook'). Mismo dedupe + normalización de verificación que
// POST /topics/detect (insertTopicIfNew). mentions = engagement real del post.
async function generateTopicsFromFacebookPosts(posts, userId) {
  const enriched = await enrichFacebookTopics(posts);
  const insertedTopics = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const topic = enriched[i] || {};
    const title = topic.title || String(post.post_text || '').slice(0, 120) || 'Publicación de Facebook';
    const mentions = (Number(post.reactions) || 0) + (Number(post.comments) || 0) + (Number(post.shares) || 0);
    // Si el modelo no trajo evidence, anclar al post scrapeado
    const evidence = Array.isArray(topic.evidence) && topic.evidence.length
      ? topic.evidence
      : [{
        label: post.source_account || 'Facebook',
        url: post.post_url || null,
        kind: 'social',
        supports: 'publicación en red',
        reliable: false,
      }];
    const row = await insertTopicIfNew(
      {
        ...topic,
        title,
        evidence,
        source_count: topic.source_count != null ? topic.source_count : 1,
      },
      { source: 'Facebook', mentions }
    );
    if (row) insertedTopics.push(row);
  }
  await logActivity(pool, 'radar_detect_fb', `${insertedTopics.length} topics generados desde Facebook`, userId, 'exito', {
    posts_count: posts.length,
    inserted: insertedTopics.length,
  });
  return insertedTopics;
}

// POST /api/listening/topics/detect — detección de tendencias vía IA (Perplexity).
// Lógica compartida con el cron automático (listening-cron.js, cada 6h) en
// lib/topic-detection.js — mismo dedupe, activity_log separa 'radar_detect'
// (manual) de 'radar_detect_auto' (cron).
router.post('/topics/detect', requireAuth, requireRole('director', 'produccion'), async (req, res) => {
  const query = (req.body && req.body.query) || 'tendencias y noticias relevantes en Perote, Veracruz, México';
  try {
    const inserted = await detectAndSaveTopics(query, req.user.id, 'manual');
    res.json({ detected: inserted.length, topics: inserted });
  } catch (err) {
    await logActivity(pool, 'radar_detect', err.message, req.user.id, 'fallo', { query });
    res.status(500).json({ error: 'No se pudo completar la detección de tendencias: ' + err.message });
  }
});

// GET /api/listening/topics?source=&status=&verification_status=&limit=&offset= — pantalla RADAR.
// verification_status: verified|checking|signal|risk|none (none = IS NULL; independiente
// de status Nuevo/Revisado). Topics pre-migración: confidence y verification_status
// pueden ser null (sin evaluar). Sin limit devuelve todo (compat con checks/legacy);
// con limit la respuesta sigue siendo un array — el admin pide limit+1 para saber
// si hay más páginas sin necesidad de un COUNT extra.
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
    if (req.query.verification_status === 'none') {
      clauses.push('verification_status IS NULL');
    } else if (req.query.verification_status) {
      params.push(req.query.verification_status);
      clauses.push(`verification_status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    let paging = '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 500);
    if (limit > 0) {
      params.push(limit);
      paging += ` LIMIT $${params.length}`;
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      if (offset > 0) {
        params.push(offset);
        paging += ` OFFSET $${params.length}`;
      }
    }
    const { rows } = await pool.query(
      `SELECT id, title, source, mentions, sentiment, status, antecedentes, actores, angulos, audiencia,
              confidence, verification_status, known_facts, unknown_facts, evidence, risk_flags,
              editorial_decision, source_count, detected_at
       FROM topics ${where} ORDER BY detected_at DESC${paging}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/listening/topics/summary — totales por verification_status + lista de
// sources distintos. Alimenta las tarjetas de resumen y los chips de fuente del
// RADAR, que ya no pueden derivarse del array paginado en el cliente.
router.get('/topics/summary', requireAuth, async (req, res, next) => {
  try {
    const { rows: counts } = await pool.query(
      `SELECT COALESCE(verification_status, 'none') AS vs, count(*)::int AS n
       FROM topics GROUP BY 1`
    );
    const byVerification = {};
    let total = 0;
    for (const r of counts) {
      byVerification[r.vs] = r.n;
      total += r.n;
    }
    const { rows: sources } = await pool.query(
      `SELECT DISTINCT source FROM topics WHERE source IS NOT NULL ORDER BY source`
    );
    res.json({
      total,
      by_verification: byVerification,
      sources: sources.map((r) => r.source),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/listening/topics — vacía el RADAR de una vez (reemplaza al
// "limpiar todo" del admin que hacía N DELETEs paralelos con fallo parcial
// posible). content_proposals.topic_id queda NULL por ON DELETE SET NULL (024).
router.delete('/topics', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM topics');
    await logActivity(pool, 'radar_clear', `${result.rowCount} topics eliminados (limpiar todo)`, req.user.id, 'exito', { deleted: result.rowCount });
    res.json({ deleted: result.rowCount });
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
//     está configurado en el entorno del API. El body puede traer `accounts`
//     (handles o URLs de Facebook); si se omite, usa las cuentas activas de
//     competitor_facebook_accounts (Configuración → Cuentas FB).
//     El scraper devuelve items ya con source_platform='facebook'. Inserta en
//     competitor_posts con dedupe por post_url. Log a activity_log con
//     action='competitors_scrape_fb'. Además, con los posts recién insertados
//     genera temas de RADAR (tabla topics, source='Facebook') vía
//     enrichFacebookTopics — best-effort: si la IA falla, el scrape ya quedó
//     guardado y la respuesta HTTP no falla por eso. Log de esa parte con
//     action='radar_detect_fb'.
//
//   - "perplexity" (default si se omite): usa detectCompetitorPosts (Perplexity
//     Sonar Pro). El body trae `competitors` (nombres legibles, p. ej.
//     "Diario de Xalapa"). Inserta en competitor_posts igual.
//
// Cualquier valor distinto de "facebook"/"perplexity" → 400.
router.post('/competitors/detect', requireAuth, requireRole('director', 'produccion'), async (req, res) => {
  const source = String((req.body && req.body.source) || 'perplexity').toLowerCase();

  if (source === 'facebook') {
    if (!config.competitorScraperUrl) {
      return res.status(503).json({ error: 'competitor_scraper_not_configured', detail: 'COMPETITOR_SCRAPER_URL no está configurado en el API. Define la env var o usa source: "perplexity".' });
    }
    const bodyAccounts = Array.isArray(req.body && req.body.accounts) ? req.body.accounts.map(String).map((s) => s.trim()).filter(Boolean) : [];
    let accounts = bodyAccounts;

    try {
      if (!accounts.length) {
        const { rows } = await pool.query('SELECT handle_or_url FROM competitor_facebook_accounts WHERE active = true ORDER BY label');
        accounts = rows.map((r) => r.handle_or_url);
      }
      if (accounts.length === 0) {
        return res.status(400).json({ error: 'No hay cuentas de Facebook activas. Agrega al menos una en Configuración → Cuentas FB, o manda "accounts" en el body.' });
      }

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

      let insertedTopics = [];
      if (inserted.length) {
        try {
          insertedTopics = await generateTopicsFromFacebookPosts(inserted, req.user.id);
        } catch (topicsErr) {
          await logActivity(pool, 'radar_detect_fb', topicsErr.message, req.user.id, 'fallo', { posts_count: inserted.length });
        }
      }

      return res.json({ detected: inserted.length, source: 'facebook', posts: inserted, topics: insertedTopics });
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

// --- Cuentas de Facebook para el scraper (competitor_facebook_accounts, migración 031) ---
// CRUD puro de configuración (Configuración → Cuentas FB). Sin FKs de otras tablas
// apuntándole, a diferencia de `users` — acá el DELETE sí borra la fila de verdad.

// GET /api/listening/competitors/accounts
router.get('/competitors/accounts', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, label, handle_or_url, active, created_at FROM competitor_facebook_accounts ORDER BY label');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/listening/competitors/accounts
router.post('/competitors/accounts', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { label, handle_or_url: handleOrUrl } = req.body || {};
    const errors = {};
    if (typeof label !== 'string' || !label.trim()) errors.label = 'Campo requerido';
    if (typeof handleOrUrl !== 'string' || !handleOrUrl.trim()) errors.handle_or_url = 'Campo requerido';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Datos inválidos', fields: errors });

    const active = req.body.active === undefined ? true : Boolean(req.body.active);
    const { rows } = await pool.query(
      'INSERT INTO competitor_facebook_accounts (label, handle_or_url, active) VALUES ($1, $2, $3) RETURNING *',
      [label.trim(), handleOrUrl.trim(), active]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/listening/competitors/accounts/:id
router.patch('/competitors/accounts/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { label, handle_or_url: handleOrUrl, active } = req.body || {};
    if (label === undefined && handleOrUrl === undefined && active === undefined) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    const { rows } = await pool.query(
      `UPDATE competitor_facebook_accounts SET
         label = COALESCE($1, label),
         handle_or_url = COALESCE($2, handle_or_url),
         active = COALESCE($3, active)
       WHERE id = $4 RETURNING *`,
      [label === undefined ? null : String(label).trim(), handleOrUrl === undefined ? null : String(handleOrUrl).trim(), active === undefined ? null : Boolean(active), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/listening/competitors/accounts/:id
router.delete('/competitors/accounts/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM competitor_facebook_accounts WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/listening/radar-stats?days=30 — calibración RADAR (Fase 6).
// Distribución de verification_status, gate risk, propuestas por status, detecciones.
// Solo lectura; no gasta IA. Auth: cualquier usuario autenticado.
router.get('/radar-stats', requireAuth, async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);

    const { rows: statusRows } = await pool.query(
      `SELECT
         COALESCE(verification_status, 'unevaluated') AS status,
         count(*)::int AS count,
         round(avg(confidence)::numeric, 1) AS avg_confidence
       FROM topics
       WHERE detected_at >= now() - ($1 || ' days')::interval
       GROUP BY 1
       ORDER BY 2 DESC`,
      [days]
    );

    const totalTopics = statusRows.reduce((s, r) => s + r.count, 0);
    const byStatus = {};
    for (const r of statusRows) {
      byStatus[r.status] = {
        count: r.count,
        pct: totalTopics ? Math.round((r.count / totalTopics) * 1000) / 10 : 0,
        avg_confidence: r.avg_confidence != null ? Number(r.avg_confidence) : null,
      };
    }

    const { rows: propRows } = await pool.query(
      `SELECT
         COALESCE(metadata->>'verification_status', 'unknown') AS vstatus,
         count(*)::int AS count
       FROM activity_log
       WHERE action = 'generate_proposal'
         AND status = 'exito'
         AND created_at >= now() - ($1 || ' days')::interval
       GROUP BY 1`,
      [days]
    );
    const proposalsByStatus = {};
    let proposalsGenerated = 0;
    for (const r of propRows) {
      proposalsByStatus[r.vstatus] = r.count;
      proposalsGenerated += r.count;
    }

    const { rows: blockRows } = await pool.query(
      `SELECT count(*)::int AS n FROM activity_log
       WHERE action = 'generate_proposal'
         AND status = 'fallo'
         AND metadata->>'reason' = 'verification_risk'
         AND created_at >= now() - ($1 || ' days')::interval`,
      [days]
    );
    const blockedRisk = blockRows[0] ? blockRows[0].n : 0;

    const { rows: forcedRows } = await pool.query(
      `SELECT count(*)::int AS n FROM activity_log
       WHERE action = 'generate_proposal'
         AND status = 'exito'
         AND (metadata->>'forced')::boolean = true
         AND metadata->>'verification_status' = 'risk'
         AND created_at >= now() - ($1 || ' days')::interval`,
      [days]
    );
    const forcedRisk = forcedRows[0] ? forcedRows[0].n : 0;

    const { rows: detectRows } = await pool.query(
      `SELECT
         count(*)::int AS runs,
         coalesce(sum((metadata->>'count')::int), 0)::int AS inserted,
         coalesce(sum((metadata->>'upgraded')::int), 0)::int AS upgraded,
         coalesce(sum((metadata->>'skipped_similar')::int), 0)::int AS skipped_similar
       FROM activity_log
       WHERE action IN ('radar_detect', 'radar_detect_auto', 'radar_detect_fb')
         AND status = 'exito'
         AND created_at >= now() - ($1 || ' days')::interval`,
      [days]
    );
    const detection = detectRows[0] || { runs: 0, inserted: 0, upgraded: 0, skipped_similar: 0 };

    const { rows: srcRows } = await pool.query(
      `SELECT trust, count(*)::int AS n FROM radar_sources WHERE active = true GROUP BY trust`
    );
    const sourcesByTrust = { high: 0, medium: 0, low: 0 };
    let sourcesActive = 0;
    for (const r of srcRows) {
      sourcesByTrust[r.trust] = r.n;
      sourcesActive += r.n;
    }

    // Hints de calibración (reglas simples, no ML)
    const hints = [];
    const riskPct = (byStatus.risk && byStatus.risk.pct) || 0;
    const verifiedPct = (byStatus.verified && byStatus.verified.pct) || 0;
    if (totalTopics >= 5 && riskPct >= 40) {
      hints.push('≥40% de topics en risk: revisar falsos positivos en prompts o lista de fuentes low.');
    }
    if (totalTopics >= 5 && verifiedPct >= 70) {
      hints.push('≥70% verified: puede haber over-trust del modelo; el cap de multi-fuente debería estar activo.');
    }
    if (blockedRisk === 0 && (byStatus.risk && byStatus.risk.count > 0) && proposalsGenerated > 0) {
      hints.push('Hay topics risk pero 0 bloqueos del gate: nadie intentó generar desde risk (o no hay logs recientes).');
    }
    if (forcedRisk >= 3) {
      hints.push(`Se forzó propuesta desde risk ${forcedRisk} veces: revisar si el gate es demasiado estricto o la agenda está sucia.`);
    }
    if (detection.skipped_similar > detection.inserted && detection.runs > 0) {
      hints.push('Más skips por similitud que inserts: dedupe activo; si faltan temas legítimos, bajar TITLE_SIMILARITY_THRESHOLD.');
    }
    if (!hints.length) {
      hints.push('Sin alertas automáticas en la ventana. Revisá docs/ia/radar-calibracion.md para umbrales.');
    }

    res.json({
      days,
      topics: { total: totalTopics, by_status: byStatus },
      proposals: {
        generated: proposalsGenerated,
        by_verification_status: proposalsByStatus,
        blocked_risk: blockedRisk,
        forced_from_risk: forcedRisk,
      },
      detection: {
        runs: detection.runs,
        inserted: detection.inserted,
        upgraded: detection.upgraded,
        skipped_similar: detection.skipped_similar,
      },
      sources: { active: sourcesActive, by_trust: sourcesByTrust },
      hints,
      knobs: {
        confidence_verified_min: 75,
        confidence_risk_max: 39,
        title_similarity: 0.45,
        scrape_multi_bonus: 10,
        trust_high_bonus: 8,
        trust_medium_bonus: 2,
        trust_low_malus: 12,
        doc: 'docs/ia/radar-calibracion.md',
      },
    });
  } catch (err) {
    next(err);
  }
});

// --- Lista editorial de fuentes RADAR (radar_sources, migración 035) ---

function normalizeDomain(raw) {
  let d = String(raw || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].replace(/^\./, '');
  return d;
}

// GET /api/listening/radar-sources — panel RADAR tab Fuentes (cualquier auth).
router.get('/radar-sources', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, domain, label, trust, active, notes, created_at
       FROM radar_sources ORDER BY trust ASC, label ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/listening/radar-sources — director | produccion
router.post('/radar-sources', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const domain = normalizeDomain(req.body && req.body.domain);
    const label = req.body && typeof req.body.label === 'string' ? req.body.label.trim() : '';
    const trust = String((req.body && req.body.trust) || 'medium').toLowerCase();
    const notes = req.body && req.body.notes != null ? String(req.body.notes).slice(0, 500) : null;
    const errors = {};
    if (!domain || !domain.includes('.')) errors.domain = 'Dominio inválido (ej. perote.gob.mx)';
    if (!label) errors.label = 'Campo requerido';
    if (!['high', 'medium', 'low'].includes(trust)) errors.trust = 'Debe ser high, medium o low';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Datos inválidos', fields: errors });

    const active = req.body.active === undefined ? true : Boolean(req.body.active);
    const { rows } = await pool.query(
      `INSERT INTO radar_sources (domain, label, trust, active, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [domain, label, trust, active, notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Ese dominio ya está en la lista' });
    }
    next(err);
  }
});

// PATCH /api/listening/radar-sources/:id
router.patch('/radar-sources/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { label, trust, active, notes } = req.body || {};
    if (label === undefined && trust === undefined && active === undefined && notes === undefined) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }
    if (trust !== undefined && !['high', 'medium', 'low'].includes(String(trust).toLowerCase())) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { trust: 'Debe ser high, medium o low' } });
    }
    const { rows } = await pool.query(
      `UPDATE radar_sources SET
         label = COALESCE($1, label),
         trust = COALESCE($2, trust),
         active = COALESCE($3, active),
         notes = COALESCE($4, notes)
       WHERE id = $5 RETURNING *`,
      [
        label === undefined ? null : String(label).trim(),
        trust === undefined ? null : String(trust).toLowerCase(),
        active === undefined ? null : Boolean(active),
        notes === undefined ? null : (notes == null ? null : String(notes).slice(0, 500)),
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Fuente no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/listening/radar-sources/:id — solo director
router.delete('/radar-sources/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM radar_sources WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Fuente no encontrada' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
