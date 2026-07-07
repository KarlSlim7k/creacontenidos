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

// helmet/cors ANTES de los estáticos: express.static termina la respuesta al
// encontrar el archivo y nunca llama a next(), así que si helmet va después las
// páginas HTML (sitio + panel admin) se sirven sin CSP/X-Frame-Options/nosniff.
app.use(helmet());
// Abierto en dev (portal en :4000, API en :3000). En producción, restringir
// con CORS_ORIGIN (lista separada por comas) en .env.
app.use(cors(config.corsOrigin ? { origin: config.corsOrigin.split(',') } : undefined));
app.use(express.json());

// SSR de nota.html: inyecta OG tags reales antes que el static la sirva estática.
// Sin slug, o si falla, cae a next() y el static entrega el HTML genérico.
const webDir = path.join(__dirname, '../../web');
app.get('/nota.html', notaSsr(webDir, pool, config.publicSiteUrl));

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
