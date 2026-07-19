// Detección + guardado de topics de RADAR (tabla `topics`).
// Preferencia: Firecrawl (scrape web pública) + chatComplete (Nous) cuando hay
// FIRECRAWL_API_KEY y URLs en FIRECRAWL_SOURCE_URLS; si no o si falla → Perplexity
// Sonar (detectTopics). Docs: docs/ia/firecrawl-integracion.md
// Verificación: docs/ia/radar-verificacion-plan.md (Fases 2–3).
//
// Compartido entre el endpoint manual (listening/index.js, POST /topics/detect)
// y el cron automático (listening-cron.js) — mismo dedupe (exacto o similarity
// pg_trgm, 24h), merge si el nuevo es mejor; trigger 'manual'|'cron' separa gasto.
const pool = require('../db/pool');
const { detectTopics, detectTopicsFromMarkdown, logActivity } = require('./ai-client');
const { scrapeMarkdown, getApiKey, getSourceUrls } = require('./firecrawl-client');
const {
  normalizeVerification,
  applyScrapeMultiSource,
  applyTrustFromSources,
  isBetterTopic,
  mergeEvidenceLists,
} = require('./topic-verification');

const MARKDOWN_PER_URL = 8000;
// Umbral de títulos “mismo tema” (pg_trgm). Canibalización de notas usa 0.35;
// acá un poco más estricto para no fusionar temas distintos de la misma región.
const TITLE_SIMILARITY_THRESHOLD = 0.45;

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

/**
 * Topic similar en las últimas 24h (título exacto o similarity > umbral).
 * @returns {Promise<object|null>}
 */
async function findRecentSimilarTopic(title) {
  const { rows } = await pool.query(
    `SELECT id, title, source, mentions, sentiment, antecedentes, actores, angulos, audiencia,
            confidence, verification_status, known_facts, unknown_facts, evidence, risk_flags,
            editorial_decision, source_count, detected_at,
            similarity(title, $1) AS sim
     FROM topics
     WHERE detected_at >= now() - interval '24 hours'
       AND (
         lower(title) = lower($1)
         OR similarity(title, $1) > $2
       )
     ORDER BY (lower(title) = lower($1)) DESC, similarity(title, $1) DESC, detected_at DESC
     LIMIT 1`,
    [title, TITLE_SIMILARITY_THRESHOLD]
  );
  return rows[0] || null;
}

/** Fuentes activas de la lista editorial (radar_sources). */
async function loadActiveRadarSources() {
  try {
    const { rows } = await pool.query(
      `SELECT domain, label, trust FROM radar_sources WHERE active = true ORDER BY length(domain) DESC`
    );
    return rows;
  } catch (err) {
    // Tabla aún no migrada en algún entorno → no tumbar detección
    if (err && err.code === '42P01') return [];
    throw err;
  }
}

/**
 * Inserta o mejora un topic normalizado.
 * - Sin similar reciente → INSERT
 * - Similar y el nuevo es peor/igual → null (skip; no inflar agenda)
 * - Similar y el nuevo es mejor → UPDATE (merge de evidence + ficha)
 *
 * @param {object} topicRaw
 * @param {{ source?: string, mentions?: number }} [overrides]
 * @param {{ scrapeUrls?: string[], trustSources?: Array }} [options]
 * @returns {Promise<object|null>}
 *   fila con `_action: 'inserted'|'upgraded'` o null
 */
async function insertTopicIfNew(topicRaw, overrides = {}, options = {}) {
  let merged = { ...topicRaw, ...overrides };
  if (overrides.source) merged.source = overrides.source;
  if (overrides.mentions != null) merged.mentions = overrides.mentions;

  if (options.scrapeUrls && options.scrapeUrls.length) {
    merged = applyScrapeMultiSource(merged, options.scrapeUrls);
  }

  let trustSources = options.trustSources;
  if (trustSources === undefined) {
    trustSources = await loadActiveRadarSources();
  }
  if (trustSources && trustSources.length) {
    merged = applyTrustFromSources(merged, trustSources);
  }

  const t = normalizeVerification(merged);
  if (!t) return null;

  const existing = await findRecentSimilarTopic(t.title);
  if (existing) {
    if (!isBetterTopic(t, existing)) return null;

    const evidence = mergeEvidenceLists(existing.evidence, t.evidence);
    const source_count = Math.max(
      Number(t.source_count) || 0,
      Number(existing.source_count) || 0,
      evidence.length ? evidence.length : 0
    );
    // Re-normalizar con evidence fusionada por si sube a verified
    const upgraded = normalizeVerification({
      ...t,
      title: existing.title, // conservar título canónico ya en panel
      evidence,
      source_count,
      mentions: Math.max(Number(t.mentions) || 0, Number(existing.mentions) || 0),
    });
    if (!upgraded) return null;

    const { rows } = await pool.query(
      `UPDATE topics SET
         source = $2,
         mentions = $3,
         sentiment = COALESCE($4, sentiment),
         antecedentes = COALESCE($5, antecedentes),
         actores = COALESCE($6, actores),
         angulos = COALESCE($7, angulos),
         audiencia = COALESCE($8, audiencia),
         confidence = $9,
         verification_status = $10,
         known_facts = COALESCE($11, known_facts),
         unknown_facts = COALESCE($12, unknown_facts),
         evidence = $13::jsonb,
         risk_flags = $14::jsonb,
         editorial_decision = COALESCE($15, editorial_decision),
         source_count = $16
       WHERE id = $1
       RETURNING *`,
      [
        existing.id,
        upgraded.source,
        upgraded.mentions,
        upgraded.sentiment,
        upgraded.antecedentes,
        upgraded.actores,
        upgraded.angulos,
        upgraded.audiencia,
        upgraded.confidence,
        upgraded.verification_status,
        upgraded.known_facts,
        upgraded.unknown_facts,
        JSON.stringify(upgraded.evidence),
        JSON.stringify(upgraded.risk_flags),
        upgraded.editorial_decision,
        upgraded.source_count,
      ]
    );
    if (!rows[0]) return null;
    return Object.assign(rows[0], { _action: 'upgraded' });
  }

  const { rows } = await pool.query(
    `INSERT INTO topics (
       title, source, mentions, sentiment, antecedentes, actores, angulos, audiencia,
       confidence, verification_status, known_facts, unknown_facts, evidence, risk_flags,
       editorial_decision, source_count
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13::jsonb, $14::jsonb,
       $15, $16
     ) RETURNING *`,
    [
      t.title,
      t.source,
      t.mentions,
      t.sentiment,
      t.antecedentes,
      t.actores,
      t.angulos,
      t.audiencia,
      t.confidence,
      t.verification_status,
      t.known_facts,
      t.unknown_facts,
      JSON.stringify(t.evidence),
      JSON.stringify(t.risk_flags),
      t.editorial_decision,
      t.source_count,
    ]
  );
  if (!rows[0]) return null;
  return Object.assign(rows[0], { _action: 'inserted' });
}

async function detectAndSaveTopics(query, userId, trigger) {
  let detected;
  let usage;
  let model;
  let provider;
  let metaExtra = {};
  let scrapeUrls = [];

  try {
    const viaFc = await detectViaFirecrawl(query);
    if (viaFc) {
      detected = viaFc.topics;
      usage = viaFc.usage;
      model = viaFc.model;
      provider = 'firecrawl';
      scrapeUrls = viaFc.sourcesUsed || [];
      metaExtra = {
        sources: scrapeUrls,
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

  const trustSources = await loadActiveRadarSources();
  const inserted = [];
  let upgraded = 0;
  let skipped = 0;
  for (const topic of detected) {
    const row = await insertTopicIfNew(topic, {}, { scrapeUrls, trustSources });
    if (!row) {
      skipped += 1;
      continue;
    }
    if (row._action === 'upgraded') upgraded += 1;
    inserted.push(row);
  }

  const action = trigger === 'cron' ? 'radar_detect_auto' : 'radar_detect';
  const byStatus = {};
  for (const row of inserted) {
    const k = row.verification_status || 'null';
    byStatus[k] = (byStatus[k] || 0) + 1;
  }
  await logActivity(pool, action, `${inserted.length} topics detectados`, userId, 'exito', {
    query,
    count: inserted.length,
    upgraded,
    skipped_similar: skipped,
    trust_sources_active: trustSources.length,
    provider,
    model,
    usage,
    verification_breakdown: byStatus,
    ...metaExtra,
  });
  return inserted;
}

module.exports = {
  detectAndSaveTopics,
  detectViaFirecrawl,
  insertTopicIfNew,
  findRecentSimilarTopic,
  loadActiveRadarSources,
  normalizeVerification,
  TITLE_SIMILARITY_THRESHOLD,
};
