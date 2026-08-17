const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../../db/pool');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { rateLimitKey } = require('../../lib/client-ip');

const router = express.Router();

// Este router se monta en /api (server.js), fuera del rate limiter de /api/public.
// Limitar las rutas públicas aquí: cada /embed anónimo puede disparar un refetch.
const socialPublicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, keyGenerator: rateLimitKey });

// Refrescar metadata de oEmbed solo si está vieja: evita un UPDATE por cada visita
// anónima a producciones/portada/tercer-tiempo (3 páginas × N posts × cada visitante).
const OEMBED_TTL_MS = 6 * 60 * 60 * 1000;

// --- oEmbed: por red -> endpoint público, sin token. ---
// TikTok: https://www.tiktok.com/oembed?url=<encoded>
// YouTube: https://www.youtube.com/oembed?url=<encoded>&format=json
// Facebook/Instagram: requiere App Token de Meta (developers.facebook.com).
//   Cuando se obtenga el token, se agrega a FACEBOOK_APP_TOKEN en .env y el
//   endpoint se activa automáticamente. Mientras tanto, los posts de Facebook
//   se guardan sin metadata de oEmbed y se muestran con fallback (thumbnail + link).
const OEMBED_ENDPOINTS = {
  tiktok: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  youtube: (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  facebook: (url, token) => `https://graph.facebook.com/oembed_video?url=${encodeURIComponent(url)}&access_token=${token}`,
  instagram: (url, token) => `https://graph.facebook.com/oembed_post?url=${encodeURIComponent(url)}&access_token=${token}`,
};

const URL_RE = /^https?:\/\/\S+$/i;
const TIKTOK_RE = /^https?:\/\/([a-z0-9-]+\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\//i;
const YOUTUBE_RE = /^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be)\//i;
const FACEBOOK_RE = /^https?:\/\/([a-z0-9-]+\.)?(facebook\.com|fb\.watch)\//i;
const INSTAGRAM_RE = /^https?:\/\/([a-z0-9-]+\.)?instagram\.com\//i;

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|live\/|watch\?v=|&v=)([\w-]{11})/i);
  if (m) return m[1];
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
  } catch (_) {}
  return null;
}

// Cache en memoria: 6h. oEmbed es público y barato de pedir pero no tiene sentido
// pegarle cada render del feed. Ponytail: in-process map, fine para 1 instancia;
// si escalamos a N réplicas, mover a Redis o aceptar el duplicate-fetch.
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchOembed(network, url) {
  const builder = OEMBED_ENDPOINTS[network];
  if (!builder) throw Object.assign(new Error('Red no soportada'), { status: 400 });

  // YouTube: normalizar URL hacia watch?v=... para que oEmbed siempre resuelva
  // incluso si la URL original era /live/..., /shorts/... o youtu.be/...
  let targetUrl = url;
  let ytId = null;
  if (network === 'youtube') {
    ytId = extractYouTubeId(url);
    if (ytId) targetUrl = `https://www.youtube.com/watch?v=${ytId}`;
  }

  // Facebook/Instagram requieren token de app. Si no está configurado,
  // devolvemos metadata vacía para que el post se guarde sin romper el flujo.
  const isMeta = network === 'facebook' || network === 'instagram';
  const metaToken = process.env.FACEBOOK_APP_TOKEN;
  if (isMeta && !metaToken) {
    return { title: null, author_name: null, thumbnail_url: null, _noToken: true };
  }

  const key = network + '|' + targetUrl;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;

  const endpoint = isMeta ? builder(targetUrl, metaToken) : builder(targetUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let res;
  try { res = await fetch(endpoint, { headers: { 'User-Agent': 'CREA-Contenidos/1.0' }, signal: ctrl.signal }); }
  catch (err) {
    if (network === 'youtube' && ytId) {
      return { title: null, author_name: null, thumbnail_url: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` };
    }
    throw err;
  }
  finally { clearTimeout(timer); }

  if (!res.ok) {
    if (network === 'youtube' && ytId) {
      return { title: null, author_name: null, thumbnail_url: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` };
    }
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`oEmbed respondió ${res.status}`), { status: 502, detail: body.slice(0, 200) });
  }

  const data = await res.json();
  const thumb = data.thumbnail_url || (network === 'youtube' && ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null);
  const value = {
    title: data.title || data.author_name || null,
    author_name: data.author_name || null,
    thumbnail_url: thumb,
  };
  cache.set(key, { at: now, value });
  return value;
}

// Escapa TODO lo peligroso en un atributo HTML (no solo comillas dobles): un
// title con `"><script>` rompía el atributo e inyectaba HTML — el embed se mete
// vía innerHTML en el sitio público (main.js), así que esto es XSS almacenado.
function escAttr(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function buildEmbedHtml(network, externalUrl, title) {
  if (network === 'tiktok') {
    const m = externalUrl.match(/\/video\/(\d+)/);
    if (!m) return null;
    const safeTitle = escAttr(title);
    return '<iframe src="https://www.tiktok.com/embed/v2/' + m[1] + '" title="' + safeTitle + '" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="width:100%;height:100%;border:0;"></iframe>';
  }
  if (network === 'youtube') {
    const ytId = extractYouTubeId(externalUrl);
    if (!ytId) return null;
    const safeTitle = escAttr(title);
    return '<iframe src="https://www.youtube.com/embed/' + ytId + '?rel=0" title="' + safeTitle + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" style="width:100%;height:100%;border:0;"></iframe>';
  }
  // Facebook: el Video Plugin y Post Plugin (facebook.com/plugins/...) son públicos y no
  // requieren App Token. Cubre videos, reels, emisiones en vivo de Tercer Tiempo y posts.
  if (network === 'facebook') {
    const isReelOrVideo = /\/(videos|reel|watch|share\/v|share\/r)\//i.test(externalUrl) || /fb\.watch/i.test(externalUrl);
    if (isReelOrVideo) {
      const src = 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(externalUrl) + '&show_text=false&width=560&t=0';
      return '<iframe src="' + src + '" style="width:100%;height:100%;min-height:280px;border:0;" scrolling="no" frameborder="0" allowfullscreen loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>';
    }
    const src = 'https://www.facebook.com/plugins/post.php?href=' + encodeURIComponent(externalUrl) + '&show_text=true&width=500';
    return '<iframe src="' + src + '" style="width:100%;height:100%;min-height:280px;border:0;" scrolling="no" frameborder="0" allowfullscreen loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>';
  }
  if (network === 'instagram') {
    const cleanUrl = externalUrl.split('?')[0].replace(/\/+$/, '');
    return '<iframe src="' + cleanUrl + '/embed" style="width:100%;height:100%;min-height:380px;border:0;" frameborder="0" scrolling="no" allowtransparency="true" loading="lazy"></iframe>';
  }
  return null;
}

// Facebook (y solo Facebook) entrega al editor un <iframe> al presionar "Insertar",
// no una URL pelada. En vez de pedirle al editor que la extraiga a mano, aceptamos
// también ese snippet: sacamos el src del iframe y, de ahí, el "href" (la URL real
// del video) que trae adentro.
function extractVideoUrl(input) {
  var value = (input || '').trim();
  var iframeMatch = value.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  var src = iframeMatch ? iframeMatch[1] : value;
  try {
    var parsed = new URL(src);
    if (parsed.hostname === 'www.facebook.com' && parsed.pathname === '/plugins/video.php') {
      var href = parsed.searchParams.get('href');
      if (href) return href;
    }
  } catch (err) { /* no es una URL válida; se deja tal cual para que falle la validación normal */ }
  return src;
}

function detectNetwork(url) {
  if (TIKTOK_RE.test(url)) return 'tiktok';
  if (YOUTUBE_RE.test(url)) return 'youtube';
  if (FACEBOOK_RE.test(url)) return 'facebook';
  if (INSTAGRAM_RE.test(url)) return 'instagram';
  return null;
}

const POST_FIELDS = 'id, network, external_url, title, author_name, thumbnail_url, is_published, position, created_at, updated_at, fetched_at';

// Inserta un post ya validado en social_posts: detecta red, resuelve oEmbed (best-effort)
// e inserta. Compartido por POST /admin/social (URL manual del editor) y por
// social-facebook-cron.js (ingesta automática de la página propia). Devuelve
// { error: 'unrecognized_network' } o { duplicate: true } en vez de tirar, para que
// ambos llamadores decidan qué hacer sin try/catch de códigos Postgres duplicado.
async function insertSocialPost(externalUrl, { position = 0, published = true, createdBy = null, title = null, authorName = null, thumbnailUrl = null } = {}) {
  const network = detectNetwork(externalUrl);
  if (!network) return { error: 'unrecognized_network' };

  let oembed = { title, author_name: authorName, thumbnail_url: thumbnailUrl };
  let oembedFailed = false;
  try {
    const fetched = await fetchOembed(network, externalUrl);
    if (fetched.title) oembed.title = fetched.title;
    if (fetched.author_name) oembed.author_name = fetched.author_name;
    if (fetched.thumbnail_url) oembed.thumbnail_url = fetched.thumbnail_url;
  } catch (err) {
    oembedFailed = true;
  }

  // Si es YouTube y no tiene thumbnail, garantizamos el de i.ytimg.com
  if (network === 'youtube' && !oembed.thumbnail_url) {
    const ytId = extractYouTubeId(externalUrl);
    if (ytId) oembed.thumbnail_url = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  }

  const safeTitle = (oembed.title || '').slice(0, 300) || null;
  const safeAuthor = (oembed.author_name || '').slice(0, 200) || null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO social_posts (network, external_url, title, author_name, thumbnail_url,
                                  is_published, position, created_by, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $3::text IS NULL AND $4::text IS NULL THEN NULL ELSE now() END)
       RETURNING ${POST_FIELDS}`,
      [network, externalUrl, safeTitle, safeAuthor, oembed.thumbnail_url, published, position, createdBy]
    );
    return { row: rows[0], oembedFailed };
  } catch (err) {
    if (err.code === '23505') return { duplicate: true };
    throw err;
  }
}

// --- público ---

// GET /api/public/social?network=tiktok&limit=12
// Solo posts publicados, ordenados por position asc y luego recientes.
// NO devuelve embed_html para no inflar el payload: el frontend hace
// GET /api/public/social/:id/embed cuando renderiza el iframe.
router.get('/public/social', socialPublicLimiter, async (req, res, next) => {
  try {
    const network = req.query.network;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const params = [];
    let where = "is_published = true";
    if (network) { params.push(network); where += ` AND network = $${params.length}`; }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT ${POST_FIELDS} FROM social_posts
       WHERE ${where}
       ORDER BY position ASC, created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/public/social/:id/embed — el frontend lo pide on-demand por cada tarjeta.
// Devuelve el iframe HTML construido a partir de la URL. Si la red no expone
// oEmbed, igual servimos el iframe nativo (TikTok /embed/v2/:id, YouTube /embed/:id)
// sin necesidad del script embed.js.
router.get('/public/social/:id/embed', socialPublicLimiter, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT network, external_url, title, author_name, thumbnail_url, fetched_at
       FROM social_posts WHERE id = $1 AND is_published = true`,
      [req.params.id]
    );
    const post = rows[0];
    if (!post) return res.status(404).json({ error: 'Post no encontrado' });

    // Refrescar metadata de oEmbed solo si está vieja (>6h): sin esto, cada visita
    // anónima escribía la BD.
    const stale = !post.fetched_at || (Date.now() - new Date(post.fetched_at).getTime() > OEMBED_TTL_MS);

    // YouTube (a diferencia de TikTok/Facebook) responde 401 en su oEmbed cuando el
    // dueño del video deshabilitó el embed en otros sitios — ahí sí hay que creerle:
    // el iframe cargaría pero YouTube muestra "Error 153" adentro. Por eso este caso
    // se resuelve SÍNCRONO (no en background) antes de decidir si mandamos iframe o
    // fallback; se cachea 6h vía fetchOembed así que no pega dos veces seguidas.
    let embeddingBlocked = false;
    if (stale && post.network === 'youtube') {
      try {
        const fresh = await fetchOembed('youtube', post.external_url);
        await pool.query(
          `UPDATE social_posts SET title = COALESCE($1, title), author_name = COALESCE($2, author_name),
            thumbnail_url = COALESCE($3, thumbnail_url), fetched_at = now(), updated_at = now() WHERE id = $4`,
          [fresh.title, fresh.author_name, fresh.thumbnail_url, req.params.id]
        );
        post.title = fresh.title || post.title;
        post.thumbnail_url = fresh.thumbnail_url || post.thumbnail_url;
      } catch (err) {
        embeddingBlocked = true;
      }
    } else if (stale) {
      fetchOembed(post.network, post.external_url)
        .then(async (fresh) => {
          await pool.query(
            `UPDATE social_posts SET title = COALESCE($1, title), author_name = COALESCE($2, author_name),
              thumbnail_url = COALESCE($3, thumbnail_url), fetched_at = now(), updated_at = now() WHERE id = $4`,
            [fresh.title, fresh.author_name, fresh.thumbnail_url, req.params.id]
          );
        })
        .catch(() => { /* oEmbed falló; la metadata existente se conserva */ });
    }

    // El iframe nativo siempre se puede construir mientras la URL sea válida, salvo
    // que ya sepamos (arriba) que YouTube lo va a rechazar.
    const iframe = embeddingBlocked ? null : buildEmbedHtml(post.network, post.external_url, post.title);

    if (iframe) {
      return res.json({ embed_html: iframe, title: post.title, author_name: post.author_name });
    }

    // No se pudo construir (URL malformada para esta red). Devolvemos fallback
    // con thumbnail + link externo en vez de 500, para que el feed siempre renderice.
    res.json({
      embed_html: null,
      title: post.title,
      author_name: post.author_name,
      fallback: { thumbnail_url: post.thumbnail_url, external_url: post.external_url },
    });
  } catch (err) { next(err); }
});

// --- admin ---

// GET /api/admin/social — todos los posts, publicados o no.
router.get('/admin/social', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sp.id, sp.network, sp.external_url, sp.title, sp.author_name, sp.thumbnail_url,
              sp.is_published, sp.position, sp.created_at, sp.updated_at, sp.fetched_at,
              u.name AS created_by_name
       FROM social_posts sp LEFT JOIN users u ON u.id = sp.created_by
       ORDER BY sp.is_published DESC, sp.position ASC, sp.created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin/social — agregar URL. Valida formato, detecta red, resuelve oEmbed.
// Si oEmbed falla (URL privada, red caída), el post queda guardado igual con
// is_published=false para que el editor decida qué hacer.
const POST_BODY_MAX = 600;
router.post('/admin/social', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const rawInput = (req.body && req.body.external_url) || '';
    const external_url = typeof rawInput === 'string' ? extractVideoUrl(rawInput) : rawInput;
    const { is_published, position } = req.body || {};
    if (typeof external_url !== 'string' || !URL_RE.test(external_url) || external_url.length > POST_BODY_MAX) {
      return res.status(400).json({ error: 'Datos inválidos', fields: { external_url: 'URL pública requerida (http/https), máximo ' + POST_BODY_MAX + ' caracteres' } });
    }
    // El iframe se construye on-demand desde la URL; no guardamos embed_html.
    // Si oEmbed falla (red caída, IP bloqueada), el post queda como borrador —
    // igual se puede mostrar porque el iframe nativo (TikTok /embed/v2/:id)
    // funciona sin oEmbed.
    const published = is_published !== false;
    const pos = Number.isFinite(position) ? Math.max(0, parseInt(position, 10)) : 0;

    const result = await insertSocialPost(external_url, { position: pos, published, createdBy: req.user.id });
    if (result.error === 'unrecognized_network') {
      return res.status(400).json({ error: 'Datos inválidos', fields: { external_url: 'URL no reconocida (soportamos TikTok, YouTube, Facebook e Instagram)' } });
    }
    if (result.duplicate) return res.status(409).json({ error: 'Esta URL ya está agregada' });
    if (result.oembedFailed) {
      return res.status(201).json(Object.assign(result.row, { warning: 'oEmbed no respondió (el video se puede mostrar de todas formas).' }));
    }
    res.status(201).json(result.row);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/social/:id — toggle publicado, mover posición, re-resolver embed.
router.patch('/admin/social/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const { rows: current } = await pool.query('SELECT * FROM social_posts WHERE id = $1', [req.params.id]);
    if (!current[0]) return res.status(404).json({ error: 'Post no encontrado' });
    const sets = [];
    const params = [];
    if (typeof req.body.is_published === 'boolean') {
      params.push(req.body.is_published); sets.push(`is_published = $${params.length}`);
    }
    if (Number.isFinite(req.body.position)) {
      params.push(Math.max(0, parseInt(req.body.position, 10))); sets.push(`position = $${params.length}`);
    }
    if (req.body.refetch === true) {
      try {
        // fetchOembed() no devuelve embed_html (el iframe se construye on-demand en
        // GET /public/social/:id/embed); escribirlo aquí anulaba la columna en cada refetch.
        const fresh = await fetchOembed(current[0].network, current[0].external_url);
        if (fresh.title) { params.push(fresh.title.slice(0, 300)); sets.push(`title = $${params.length}`); }
        if (fresh.author_name) { params.push(fresh.author_name.slice(0, 200)); sets.push(`author_name = $${params.length}`); }
        if (fresh.thumbnail_url) { params.push(fresh.thumbnail_url); sets.push(`thumbnail_url = $${params.length}`); }
        sets.push('fetched_at = now()');
      } catch (err) {
        return res.status(502).json({ error: 'oEmbed no respondió: ' + err.message });
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
    sets.push('updated_at = now()');
    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE social_posts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, network, external_url, title, author_name, thumbnail_url, is_published, position, created_at, updated_at, fetched_at`,
      params
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE — solo director.
router.delete('/admin/social/:id', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM social_posts WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Post no encontrado' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /api/admin/social/sync-facebook — Sincronización manual bajo demanda de los
// videos recientes (Tercer Tiempo, emisiones en directo y reels) de la página de Facebook de CREA.
const CREA_FACEBOOK_PAGE_URL = 'https://www.facebook.com/profile.php?id=100079776720617';
router.post('/admin/social/sync-facebook', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => {
  try {
    const config = require('../../config');
    const { scrapeCompetitorPosts } = require('../../lib/competitor-scraper-client');
    const { logActivity } = require('../../lib/ai-client');

    if (!config.competitorScraperUrl) {
      return res.status(503).json({ error: 'El servicio scraper no está configurado.' });
    }

    const maxPosts = Math.min(Math.max(parseInt(req.body && req.body.limit, 10) || 12, 1), 30);
    const items = await scrapeCompetitorPosts({
      baseUrl: config.competitorScraperUrl,
      accounts: [CREA_FACEBOOK_PAGE_URL],
      maxPostsPerAccount: maxPosts,
      includeReels: true,
    });

    let inserted = 0;
    let skipped = 0;
    for (const item of items) {
      if (item.media_type !== 'video' || !item.post_url) continue;
      const title = item.post_text ? item.post_text.slice(0, 180) : 'Programa CREA Contenidos';
      const result = await insertSocialPost(item.post_url, {
        published: true,
        createdBy: req.user.id,
        title,
        authorName: item.source_account || 'CREA Contenidos',
      });
      if (result.duplicate || result.error) { skipped += 1; continue; }
      inserted += 1;
    }

    await logActivity(pool, 'social_sync_facebook_manual', `${inserted} videos sincronizados desde Facebook`, req.user.id, 'exito', {
      returned: items.length,
      inserted,
      skipped,
    });

    // Devolver lista actualizada
    const { rows: allPosts } = await pool.query(
      `SELECT sp.id, sp.network, sp.external_url, sp.title, sp.author_name, sp.thumbnail_url,
              sp.is_published, sp.position, sp.created_at, sp.updated_at, sp.fetched_at,
              u.name AS created_by_name
       FROM social_posts sp LEFT JOIN users u ON u.id = sp.created_by
       ORDER BY sp.is_published DESC, sp.position ASC, sp.created_at DESC`
    );

    res.json({ inserted, skipped, posts: allPosts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.insertSocialPost = insertSocialPost;
