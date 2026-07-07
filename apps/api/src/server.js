const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

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
const { startNewsletterCron } = require('./lib/newsletter-cron');
const { notaSsr } = require('./lib/nota-ssr');
const pool = require('./db/pool');

const app = express();

// Un hop de proxy (Traefik de Dokploy). OJO: en prod hay Cloudflare DELANTE de
// Traefik y Traefik NO preserva el XFF del cliente (verificado: el X-Forwarded-For
// que llega es la IP del edge de CF, no el visitante). Por eso los rate limiters
// NO se fían de req.ip: keyean por CF-Connecting-IP (ver lib/client-ip.js). Este
// trust proxy solo fija req.ip como fallback razonable en dev/sin CF.
app.set('trust proxy', 1);

// helmet/cors ANTES de los estáticos: express.static termina la respuesta al
// encontrar el archivo y nunca llama a next(), así que si helmet va después las
// páginas HTML (sitio + panel admin) se sirven sin CSP/X-Frame-Options/nosniff.
// CSP a medida: la default de Helmet (connect/frame heredan 'self') rompe en
// producción clima, miniaturas oEmbed y todos los embeds de video. Los scripts
// del portal son externos (assets/js/*), así que NO abrimos 'unsafe-inline'.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://api.open-meteo.com'],
      'img-src': ["'self'", 'data:', 'https:'], // miniaturas oEmbed vienen de CDNs variables
      'frame-src': ['https://www.tiktok.com', 'https://www.youtube.com', 'https://www.facebook.com'],
      'script-src': ["'self'", 'https://www.tiktok.com'], // tiktok/embed.js convierte los blockquote
    },
  },
}));
// Abierto en dev (portal en :4000, API en :3000). En producción, restringir
// con CORS_ORIGIN (lista separada por comas) en .env.
app.use(cors(config.corsOrigin ? { origin: config.corsOrigin.split(',') } : undefined));
app.use(express.json());

// SSR de nota.html: inyecta OG tags reales antes que el static la sirva estática.
// Sin slug, o si falla, cae a next() y el static entrega el HTML genérico.
const webDir = path.join(__dirname, '../../web');
app.get('/nota.html', notaSsr(webDir, pool, config.publicSiteUrl));

// sitemap.xml generado desde la BD: portada, secciones y cada nota publicada.
// robots.txt (estático en apps/web) apunta aquí.
const SITEMAP_SECTIONS = ['Local', 'Cultura', 'Economía', 'Entretenimiento', 'Deportes', 'Opinión'];
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = config.publicSiteUrl.replace(/\/$/, '');
    const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const { rows } = await pool.query(
      "SELECT slug, published_at FROM content_proposals WHERE status = 'published' ORDER BY published_at DESC LIMIT 5000"
    );
    const urls = ['/', '/comunidad.html', '/producciones.html']
      .concat(SITEMAP_SECTIONS.map((s) => '/seccion.html?s=' + encodeURIComponent(s)))
      .map((p) => `<url><loc>${xmlEsc(base + p)}</loc></url>`);
    for (const r of rows) {
      const loc = xmlEsc(base + '/nota.html?slug=' + encodeURIComponent(r.slug));
      const lastmod = r.published_at ? `<lastmod>${new Date(r.published_at).toISOString()}</lastmod>` : '';
      urls.push(`<url><loc>${loc}</loc>${lastmod}</url>`);
    }
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`
    );
  } catch (err) { next(err); }
});

// Servir archivos estáticos del frontend (apps/web/) y del panel admin (apps/admin/)
app.use(express.static(webDir));
app.use('/admin', express.static(path.join(__dirname, '../../admin')));

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
// socialRouter define tanto rutas públicas (/public/social*) como admin (/admin/social*).
app.use('/api', socialRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`CREA Command Center API listening on port ${config.port}`);
});

startNewsletterCron();
