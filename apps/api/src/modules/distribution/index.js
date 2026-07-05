// Capa 4 — distribución: empuja una nota ya publicada en el sitio hacia canales
// externos (Facebook Page, WhatsApp como link para compartir, WordPress). Cada push
// se registra en published_content (bitácora, migraciones 004 + 027). Todo es
// solo-director: distribuir es el paso posterior a la puerta editorial de publicar.
const express = require('express');
const pool = require('../../db/pool');
const config = require('../../config');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { logActivity } = require('../../lib/ai-client');

const router = express.Router();

function channelList() {
  return [
    { channel: 'facebook', label: 'Facebook', connected: Boolean(config.facebookPageId && config.facebookPageToken) },
    { channel: 'whatsapp', label: 'WhatsApp', connected: true }, // wa.me no requiere credenciales
    { channel: 'wordpress', label: 'WordPress', connected: Boolean(config.wordpressUrl && config.wordpressUser && config.wordpressAppPassword) },
  ];
}

function noteUrl(slug) {
  return config.publicSiteUrl.replace(/\/+$/, '') + '/nota.html?slug=' + encodeURIComponent(slug);
}

// Solo notas con status='published' se distribuyen — nunca saltarse la puerta editorial.
async function loadPublishedProposal(id) {
  const { rows } = await pool.query(
    'SELECT id, title, dek, body, slug, status FROM content_proposals WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function logPush(proposalId, platform, url, status, detail, userId) {
  await pool.query(
    `INSERT INTO published_content (proposal_id, platform, published_at, url, status, detail, created_by)
     VALUES ($1, $2, now(), $3, $4, $5, $6)`,
    [proposalId, platform, url || null, status, detail || null, userId]
  );
}

// Valida el body, carga la nota y corta con 4xx/503 antes de tocar el canal.
function distributeHandler(channel, isConnected, pushFn) {
  return async (req, res, next) => {
    try {
      const proposalId = Number((req.body || {}).proposal_id);
      if (!Number.isInteger(proposalId)) return res.status(400).json({ error: 'proposal_id es requerido' });
      if (!isConnected()) return res.status(503).json({ error: 'Canal no configurado — faltan variables de entorno en el servidor' });
      const proposal = await loadPublishedProposal(proposalId);
      if (!proposal) return res.status(404).json({ error: 'Nota no encontrada' });
      if (proposal.status !== 'published' || !proposal.slug) {
        return res.status(400).json({ error: 'Solo se distribuyen notas publicadas' });
      }
      try {
        const result = await pushFn(proposal);
        await logPush(proposal.id, channel, result.url, 'ok', null, req.user.id);
        await logActivity(pool, 'distribute_' + channel, `«${proposal.title}» distribuida a ${channel}`, req.user.id, 'exito', null);
        res.json(result);
      } catch (err) {
        await logPush(proposal.id, channel, null, 'error', err.message, req.user.id);
        await logActivity(pool, 'distribute_' + channel, err.message, req.user.id, 'fallo', null);
        res.status(502).json({ error: `${channel} no aceptó la publicación: ${err.message}` });
      }
    } catch (err) {
      next(err);
    }
  };
}

// POST /api/distribution/facebook { proposal_id } — post en la página vía Graph API.
router.post('/facebook', requireAuth, requireRole('director'),
  distributeHandler('facebook',
    () => Boolean(config.facebookPageId && config.facebookPageToken),
    async (proposal) => {
      const message = proposal.title + (proposal.dek ? '\n\n' + proposal.dek : '');
      const resp = await fetch(`https://graph.facebook.com/v19.0/${config.facebookPageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, link: noteUrl(proposal.slug), access_token: config.facebookPageToken }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error((json && json.error && json.error.message) || `Graph API respondió ${resp.status}`);
      // id viene como "{page_id}_{post_id}" — la URL pública es facebook.com/{id}
      return { channel: 'facebook', url: json && json.id ? `https://www.facebook.com/${json.id}` : null };
    })
);

// POST /api/distribution/whatsapp { proposal_id } — sin Business API: arma el texto y
// devuelve un link wa.me para que el director lo comparta desde su propio WhatsApp.
router.post('/whatsapp', requireAuth, requireRole('director'),
  distributeHandler('whatsapp',
    () => true,
    async (proposal) => {
      const url = noteUrl(proposal.slug);
      const text = proposal.title + (proposal.dek ? '\n\n' + proposal.dek : '') + '\n\n' + url;
      return { channel: 'whatsapp', url, share_url: 'https://wa.me/?text=' + encodeURIComponent(text) };
    })
);

// POST /api/distribution/wordpress { proposal_id } — REST API con application password.
router.post('/wordpress', requireAuth, requireRole('director'),
  distributeHandler('wordpress',
    () => Boolean(config.wordpressUrl && config.wordpressUser && config.wordpressAppPassword),
    async (proposal) => {
      const content = String(proposal.body || '')
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n');
      const auth = Buffer.from(`${config.wordpressUser}:${config.wordpressAppPassword}`).toString('base64');
      const resp = await fetch(`${config.wordpressUrl.replace(/\/+$/, '')}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ title: proposal.title, content, excerpt: proposal.dek || '', status: 'publish' }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error((json && json.message) || `WordPress respondió ${resp.status}`);
      return { channel: 'wordpress', url: (json && json.link) || null };
    })
);

// GET /api/distribution/channels — qué canal está configurado (mismo espíritu que /api/admin/integrations).
router.get('/channels', requireAuth, requireRole('director'), (req, res) => {
  res.json(channelList());
});

// GET /api/distribution/log?limit= — historial de pushes con título de la nota.
router.get('/log', requireAuth, requireRole('director'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const { rows } = await pool.query(
      `SELECT pc.id, pc.proposal_id, pc.platform, pc.published_at, pc.url, pc.status, pc.detail,
              cp.title, u.name AS created_by_name
       FROM published_content pc
       LEFT JOIN content_proposals cp ON cp.id = pc.proposal_id
       LEFT JOIN users u ON u.id = pc.created_by
       ORDER BY pc.published_at DESC NULLS LAST, pc.id DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
