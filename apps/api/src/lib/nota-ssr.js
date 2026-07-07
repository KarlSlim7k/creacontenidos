// SSR mínimo para nota.html: inyecta los meta tags Open Graph reales (title,
// description, url, image) ANTES de servir el HTML. Los crawlers de
// Facebook/WhatsApp no ejecutan JS, así que el setMetaContent client-side de
// main.js no les sirve — solo veían los valores genéricos del <head> estático.
// Este middleware corre para todos (no solo bots): es barato y mejora el preview
// para cualquiera que comparta el link.
const fs = require('fs');
const path = require('path');

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Reemplaza el content="" de un <meta property|name="key"> por value ya escapado.
function setMeta(html, attr, key, value) {
  const re = new RegExp('(<meta\\s+' + attr + '="' + key + '"\\s+content=")[^"]*(")', 'i');
  return html.replace(re, '$1' + esc(value) + '$2');
}

// Pura y testeable: toma el HTML base + el artículo y devuelve el HTML con OG real.
function injectMeta(html, article, siteUrl) {
  const title = article.title + ' · CREA Contenidos';
  const desc = article.dek || '';
  const url = siteUrl.replace(/\/$/, '') + '/nota.html?slug=' + encodeURIComponent(article.slug);
  let image = article.cover_image_url || '';
  if (image && image.startsWith('/')) image = siteUrl.replace(/\/$/, '') + image;

  let out = html.replace(/<title>[^<]*<\/title>/i, '<title>' + esc(title) + '</title>');
  out = setMeta(out, 'name', 'description', desc);
  out = setMeta(out, 'property', 'og:title', title);
  out = setMeta(out, 'property', 'og:description', desc);
  out = setMeta(out, 'property', 'og:url', url);
  out = setMeta(out, 'property', 'og:image', image);
  return out;
}

// Middleware factory. webDir = ruta a apps/web; pool = pg; siteUrl = PUBLIC_SITE_URL.
function notaSsr(webDir, pool, siteUrl) {
  const notaPath = path.join(webDir, 'nota.html');
  let baseHtml = null; // cache: el archivo no cambia en runtime
  return async function (req, res, next) {
    const slug = req.query.slug;
    if (!slug) return next(); // sin slug no hay nota que resolver → static sirve el genérico
    try {
      if (baseHtml == null) baseHtml = fs.readFileSync(notaPath, 'utf8');
      const { rows } = await pool.query(
        "SELECT slug, title, dek, cover_image_url FROM content_proposals WHERE slug = $1 AND status = 'published'",
        [slug]
      );
      if (!rows[0]) return next(); // no publicada → static sirve el genérico (y el JS mostrará el 404)
      res.type('html').send(injectMeta(baseHtml, rows[0], siteUrl));
    } catch (err) {
      next(); // ante cualquier fallo, caer al static — nunca romper la nota
    }
  };
}

module.exports = { notaSsr, injectMeta };
