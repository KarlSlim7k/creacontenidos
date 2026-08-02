const { Sentry } = require('./instrument');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { randomBytes } = require('node:crypto');

const config = require('./config');
const { errorHandler } = require('./middleware/error-handler');

const listeningRouter = require('./modules/listening');
const contentEngineRouter = require('./modules/content-engine');
const editorialRouter = require('./modules/editorial');
const distributionRouter = require('./modules/distribution');
const publicRouter = require('./modules/public');
const authRouter = require('./modules/auth');
const commercialRouter = require('./modules/commercial');
const socialRouter = require('./modules/social');
const newsletterRouter = require('./modules/newsletter');
const telegramRouter = require('./modules/telegram');
const { startNewsletterCron } = require('./lib/newsletter-cron');
const { startListeningCron } = require('./lib/listening-cron');
const { startTelegramReviewCron } = require('./lib/telegram-review-cron');
const { SECTIONS } = require('./lib/sections');
const pool = require('./db/pool');

const app = express();

// Un hop de proxy (Traefik de Dokploy). OJO: en prod hay Cloudflare DELANTE de
// Traefik y Traefik NO preserva el XFF del cliente (verificado: el X-Forwarded-For
// que llega es la IP del edge de CF, no el visitante). Por eso los rate limiters
// NO se fían de req.ip: keyean por CF-Connecting-IP (ver lib/client-ip.js). Este
// trust proxy solo fija req.ip como fallback razonable en dev/sin CF.
app.set('trust proxy', 1);

// Un solo host indexable. Destino fijo para no convertir Host/X-Forwarded-Host
// en un open redirect; originalUrl conserva ruta y query.
app.use((req, res, next) => {
  if (req.hostname.toLowerCase() === 'www.crea-contenidos.com') {
    return res.redirect(301, `https://crea-contenidos.com${req.originalUrl}`);
  }
  next();
});

// Nonce distinto por respuesta. Astro lo recibe como local para sus dos scripts
// dinámicos; los scripts estáticos salen como archivos /_astro del mismo origen.
app.use((req, res, next) => {
  res.locals.cspNonce = randomBytes(16).toString('base64');
  next();
});

// helmet/cors ANTES de los estáticos: express.static termina la respuesta al
// encontrar el archivo y nunca llama a next(), así que si helmet va después las
// páginas HTML (sitio + panel admin) se sirven sin CSP/X-Frame-Options/nosniff.
// CSP a medida: la default de Helmet (connect/frame heredan 'self') rompe en
// producción los embeds de video. El portal (Astro) sirve su JS bundleado desde
// el mismo origen, así que NO hace falta abrir 'unsafe-inline' ni script-src externo
// (el iframe nativo de TikTok/:id ya no depende de tiktok.com/embed.js).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://api.open-meteo.com'],
      'img-src': ["'self'", 'data:', 'https:'], // miniaturas oEmbed vienen de CDNs variables
      'media-src': ["'self'", 'blob:'], // preview de audio/video subido en el pipeline usa blob: URLs
      'frame-src': ['https://www.tiktok.com', 'https://www.youtube.com', 'https://www.facebook.com'],
      'script-src': [
        "'self'",
        'https://static.cloudflareinsights.com', // beacon de Cloudflare Web Analytics
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
      ],
    },
  },
}));
// Abierto en dev (portal en :4000, API en :3000). En producción, restringir
// con CORS_ORIGIN (lista separada por comas) en .env.
app.use(cors(config.corsOrigin ? { origin: config.corsOrigin.split(',') } : undefined));
app.use(express.json());

// sitemap.xml generado desde la BD: portada, secciones y cada nota publicada.
// robots.txt (estático en apps/web) apunta aquí.
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = config.publicSiteUrl.replace(/\/$/, '');
    const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const { rows } = await pool.query(
      "SELECT slug, published_at, author_name FROM content_proposals WHERE status = 'published' ORDER BY published_at DESC LIMIT 5000"
    );
    const urls = ['/', '/comunidad', '/producciones', '/privacidad', '/terminos', '/patrocinado',
      '/estudio', '/estudio/servicios', '/estudio/tercer-tiempo', '/estudio/media-kit', '/estudio/contacto']
      .concat(SECTIONS.map((s) => '/seccion/' + encodeURIComponent(s)))
      .map((p) => `<url><loc>${xmlEsc(base + p)}</loc></url>`);
    for (const r of rows) {
      const loc = xmlEsc(base + '/notas/' + encodeURIComponent(r.slug));
      const lastmod = r.published_at ? `<lastmod>${new Date(r.published_at).toISOString()}</lastmod>` : '';
      urls.push(`<url><loc>${loc}</loc>${lastmod}</url>`);
    }
    for (const author of new Set(rows.map((r) => r.author_name).filter(Boolean))) {
      urls.push(`<url><loc>${xmlEsc(base + '/perfil/' + encodeURIComponent(author))}</loc></url>`);
    }
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
    );
  } catch (err) { next(err); }
});

// Panel admin: SPA estática, build de Vite (apps/admin/dist).
app.use('/admin', express.static(path.join(__dirname, '../../admin/dist')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/listening', listeningRouter);
app.use('/api/content', contentEngineRouter);
app.use('/api/editorial', editorialRouter);
app.use('/api/distribution', distributionRouter);
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', authRouter.adminRouter);
app.use('/api/commercial', commercialRouter);
app.use('/api/newsletter', newsletterRouter);
app.use('/api/telegram', telegramRouter);
// socialRouter define tanto rutas públicas (/public/social*) como admin (/admin/social*).
app.use('/api', socialRouter);

// Portal público (Astro, SSR): montado AL FINAL, después de todos los routers
// /api/* — su handler intenta rutear cualquier path no encontrado, así que si
// fuera antes se tragaría las rutas de la API en vez de dejarlas pasar.
// apps/api es CommonJS y el build de Astro (@astrojs/node) genera un entry
// ESM; import() dinámico (válido desde CJS) en vez de require().
async function main() {
  const { handler: astroHandler } = await import('../../web/dist/server/entry.mjs');
  const webClientDir = path.join(__dirname, '../../web/dist/client');
  // _astro/ son los bundles JS/CSS de Astro, con hash de contenido en el nombre
  // (ej. comunidad.B792ozcr.css) — cambiar el contenido cambia el nombre, así
  // que cachearlos "para siempre" es seguro. El resto de dist/client (robots.txt,
  // assets/img/* copiados tal cual desde public/) NO tiene hash, así que solo
  // cache corto: si se reemplaza el archivo, los visitantes lo ven en <1 día.
  app.use('/_astro', express.static(path.join(webClientDir, '_astro'), { maxAge: '1y', immutable: true }));
  app.use(express.static(webClientDir, { maxAge: '1d' }));
  app.use((req, res, next) => astroHandler(req, res, next, { cspNonce: res.locals.cspNonce }));
  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`CREA Command Center API listening on port ${config.port}`);
  });

  startNewsletterCron();
  startListeningCron();
  startTelegramReviewCron();
}

main();
