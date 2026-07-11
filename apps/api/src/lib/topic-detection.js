// Detección + guardado de topics de RADAR (tabla `topics`).
// Preferencia: Firecrawl (scrape web pública) + chatComplete (Nous) cuando hay
// FIRECRAWL_API_KEY y URLs en FIRECRAWL_SOURCE_URLS; si no o si falla → Perplexity
// Sonar (detectTopics). Docs: docs/ia/firecrawl-integracion.md (Fase 2).
//
// Compartido entre el endpoint manual (listening/index.js, POST /topics/detect)
// y el cron automático (listening-cron.js) — mismo dedupe (lower(title) + 24h),
// mismo logActivity; trigger 'manual'|'cron' separa gasto en ai-usage.
const pool = require('../db/pool');
const { detectTopics, detectTopicsFromMarkdown, logActivity } = require('./ai-client');
const { scrapeMarkdown, getApiKey, getSourceUrls } = require('./firecrawl-client');

const MARKDOWN_PER_URL = 8000;

async function detectViaFirecrawl(query) {
  const urls = getSourceUrls();
  if (!getApiKey() || !urls.length) return null;

  const sources = [];
  const scrapeErrors = [];
  for (const url of urls) {
    try {
      const page = await scrapeMarkdown(url);
      if (page.markdown && page.markdown.trim()) {
        sources.push({
          url: page.url || url,
          markdown: page.markdown.slice(0, MARKDOWN_PER_URL),
        });
      }
    } catch (err) {
      scrapeErrors.push({ url, message: String(err && err.message || err).slice(0, 200) });
    }
  }
  if (!sources.length) {
    const err = new Error(
      scrapeErrors.length
        ? `Firecrawl: ninguna fuente con markdown (${scrapeErrors.map((e) => e.message).join('; ')})`
        : 'Firecrawl: sin markdown útil en las URLs configuradas'
    );
    err.scrapeErrors = scrapeErrors;
    throw err;
  }

  const result = await detectTopicsFromMarkdown(query, sources);
  return {
    ...result,
    sourcesUsed: sources.map((s) => s.url),
    scrapeErrors,
  };
}

async function detectAndSaveTopics(query, userId, trigger) {
  let detected;
  let usage;
  let model;
  let provider;
  let metaExtra = {};

  try {
    const viaFc = await detectViaFirecrawl(query);
    if (viaFc) {
      detected = viaFc.topics;
      usage = viaFc.usage;
      model = viaFc.model;
      provider = 'firecrawl';
      metaExtra = {
        sources: viaFc.sourcesUsed,
        scrape_errors: viaFc.scrapeErrors && viaFc.scrapeErrors.length ? viaFc.scrapeErrors : undefined,
      };
    }
  } catch (err) {
    metaExtra = {
      firecrawl_fallback: true,
      firecrawl_error: String(err && err.message || err).slice(0, 300),
    };
  }

  if (!detected) {
    const viaPplx = await detectTopics(query);
    detected = viaPplx.topics;
    usage = viaPplx.usage;
    model = viaPplx.model || 'sonar-pro';
    provider = 'perplexity';
  }

  if (!Array.isArray(detected)) detected = [];

  const inserted = [];
  for (const topic of detected) {
    if (!topic || !topic.title) continue;
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

  const action = trigger === 'cron' ? 'radar_detect_auto' : 'radar_detect';
  await logActivity(pool, action, `${inserted.length} topics detectados`, userId, 'exito', {
    query,
    count: inserted.length,
    provider,
    model,
    usage,
    ...metaExtra,
  });
  return inserted;
}

module.exports = { detectAndSaveTopics, detectViaFirecrawl };
