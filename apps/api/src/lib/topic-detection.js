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
const { calculateCreaScore } = require('./crea-score');

const MARKDOWN_PER_URL = 8000;
// Umbral de títulos “mismo tema” (pg_trgm). Canibalización de notas usa 0.35;
// acá un poco más estricto para no fusionar temas distintos de la misma región.
const TITLE_SIMILARITY_THRESHOLD = 0.45;

/** Hostname normalizado de una URL (sin "www."), o '' si no es una URL válida. */
function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * R2-54 (fase 09): refleja en radar_sources el resultado del último intento de
 * scrape de esta URL, si su dominio está en la lista editorial curada. No crea
 * filas nuevas (radar_sources es una lista curada por el editor, no un cache
 * de lo que Firecrawl tocó) y nunca tumba la detección de temas por esto —
 * best-effort puro, igual que loadMaxSimilarityToPublished() en este archivo.
 */
async function recordRadarSourceHealth(url, { ok, errorMessage }) {
  const domain = hostnameOf(url);
  if (!domain) return;
  try {
    await pool.query(
      `UPDATE radar_sources SET last_crawl_at = now(), engine = 'firecrawl', status = $1, last_error = $2
       WHERE lower(domain) = $3`,
      [ok ? 'ok' : 'error', ok ? null : String(errorMessage || '').slice(0, 500), domain]
    );
  } catch {
    // Tabla aún no migrada, o cualquier otro fallo de escritura: no es crítico.
  }
}

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
        await recordRadarSourceHealth(url, { ok: true });
      } else {
        await recordRadarSourceHealth(url, { ok: false, errorMessage: 'Firecrawl devolvió markdown vacío' });
      }
    } catch (err) {
      scrapeErrors.push({ url, message: String(err && err.message || err).slice(0, 200) });
      await recordRadarSourceHealth(url, { ok: false, errorMessage: err && err.message });
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
 * CREA Score, factor "originalidad" (R2-25/R2-26): similarity() contra
 * content_proposals publicadas, mismo mecanismo que ya usa la canibalización
 * en content-engine/index.js. Sin publicadas todavía → 0 (nada que
 * canibalizar, plenamente original) — null solo si la consulta falla, para
 * no tumbar la detección por esto.
 */
async function loadMaxSimilarityToPublished(title) {
  try {
    const { rows } = await pool.query(
      `SELECT max(similarity(title, $1)) AS s FROM content_proposals WHERE status = 'published'`,
      [title]
    );
    const s = rows[0] && rows[0].s;
    return s == null ? 0 : Number(s);
  } catch (err) {
    return null;
  }
}

/** Análisis del Motor Editorial más reciente de un topic, o null (R2-26: se
 * recalcula el score al hacer upgrade — un tema ya analizado puede volver a
 * traer sus factores impacto_potencial/implicaciones_practicas). */
async function loadLatestAnalysis(topicId) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM editorial_analyses WHERE topic_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [topicId]
    );
    return rows[0] || null;
  } catch (err) {
    if (err && err.code === '42P01') return null; // tabla aún no migrada
    throw err;
  }
}

/**
 * Calcula { crea_score, crea_score_breakdown } para un topic normalizado.
 * @param {object} t salida de normalizeVerification()
 * @param {object|null} [analysis] análisis más reciente, si existe
 */
async function computeCreaScoreFields(t, analysis) {
  const maxSimilarityToPublished = await loadMaxSimilarityToPublished(t.title);
  const { score, breakdown } = calculateCreaScore(t, analysis, { maxSimilarityToPublished });
  return { crea_score: score, crea_score_breakdown: breakdown };
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

    // R2-26: recalcular el score al enriquecer — un tema que ya tenía
    // análisis conserva sus factores impacto_potencial/implicaciones_practicas.
    const existingAnalysis = await loadLatestAnalysis(existing.id);
    // detected_at no lo toca el UPDATE (queda el de la detección original) —
    // se lo pasamos explícito para el factor "actualidad": t/upgraded nunca
    // lo traen, es una columna con DEFAULT de la DB, no un campo normalizado.
    const { crea_score, crea_score_breakdown } = await computeCreaScoreFields(
      { ...upgraded, detected_at: existing.detected_at },
      existingAnalysis
    );

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
         source_count = $16,
         event_date = COALESCE($17, event_date),
         locality = COALESCE($18, locality),
         territorial_scope = COALESCE($19, territorial_scope),
         category = COALESCE($20, category),
         provider = COALESCE($21, provider),
         external_id = COALESCE($22, external_id),
         media_available = COALESCE($23, media_available),
         crea_score = $24,
         crea_score_breakdown = $25::jsonb
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
        upgraded.event_date,
        upgraded.locality,
        upgraded.territorial_scope,
        upgraded.category,
        upgraded.provider,
        upgraded.external_id,
        upgraded.media_available,
        crea_score,
        JSON.stringify(crea_score_breakdown),
      ]
    );
    if (!rows[0]) return null;
    return Object.assign(rows[0], { _action: 'upgraded' });
  }

  // R2-26: score al insertar — sin topic_id todavía, así que sin análisis
  // (uno recién detectado nunca tiene editorial_analyses previo). detected_at
  // tampoco lo trae `t` (columna con DEFAULT now() de la DB, no un campo
  // normalizado) — se lo damos explícito para el factor "actualidad".
  const { crea_score, crea_score_breakdown } = await computeCreaScoreFields(
    { ...t, detected_at: new Date().toISOString() },
    null
  );

  const { rows } = await pool.query(
    `INSERT INTO topics (
       title, source, mentions, sentiment, antecedentes, actores, angulos, audiencia,
       confidence, verification_status, known_facts, unknown_facts, evidence, risk_flags,
       editorial_decision, source_count, event_date, locality, territorial_scope, category,
       provider, external_id, media_available, crea_score, crea_score_breakdown
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13::jsonb, $14::jsonb,
       $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb
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
      t.event_date,
      t.locality,
      t.territorial_scope,
      t.category,
      t.provider,
      t.external_id,
      t.media_available,
      crea_score,
      JSON.stringify(crea_score_breakdown),
    ]
  );
  if (!rows[0]) return null;
  return Object.assign(rows[0], { _action: 'inserted' });
}

// Registry de proveedores de descubrimiento (R2-14). Orden = prioridad: el
// primero cuyo detect() devuelva un array de topics gana; uno que devuelve
// `null` (no configurado) se salta en silencio; uno que devuelve
// `{ topics: null, metaExtra }` (lo intentó, falló) deja su metaExtra y pasa
// al siguiente. Añadir un proveedor nuevo (ej. Grok — 07-explorer-grok.md)
// es agregar una entrada acá, sin tocar detectAndSaveTopics().
const DISCOVERY_PROVIDERS = [
  {
    name: 'firecrawl',
    async detect(query) {
      try {
        const viaFc = await detectViaFirecrawl(query);
        if (!viaFc) return null; // sin FIRECRAWL_API_KEY/URLs: no configurado
        const scrapeUrls = viaFc.sourcesUsed || [];
        return {
          topics: viaFc.topics,
          usage: viaFc.usage,
          model: viaFc.model,
          provider: 'firecrawl',
          usedFallback: Boolean(viaFc.usedFallback),
          scrapeUrls,
          metaExtra: {
            sources: scrapeUrls,
            scrape_errors: viaFc.scrapeErrors && viaFc.scrapeErrors.length ? viaFc.scrapeErrors : undefined,
          },
        };
      } catch (err) {
        return {
          topics: null, // lo intentó y falló → el loop sigue al próximo proveedor
          metaExtra: {
            firecrawl_fallback: true,
            firecrawl_error: String(err && err.message || err).slice(0, 300),
          },
        };
      }
    },
  },
  {
    name: 'perplexity',
    async detect(query) {
      const viaPplx = await detectTopics(query);
      return {
        topics: viaPplx.topics,
        usage: viaPplx.usage,
        model: viaPplx.model || 'sonar-pro',
        provider: 'perplexity',
      };
    },
  },
];

async function detectAndSaveTopics(query, userId, trigger) {
  let detected;
  let usage;
  let model;
  let provider;
  let usedFallback = false;
  let metaExtra = {};
  let scrapeUrls = [];

  for (const discoveryProvider of DISCOVERY_PROVIDERS) {
    const result = await discoveryProvider.detect(query);
    if (!result) continue;
    if (result.metaExtra) metaExtra = { ...metaExtra, ...result.metaExtra };
    if (!Array.isArray(result.topics)) continue; // intentó y falló: sigue al próximo
    detected = result.topics;
    usage = result.usage;
    model = result.model;
    provider = result.provider;
    usedFallback = Boolean(result.usedFallback);
    scrapeUrls = result.scrapeUrls || [];
    break;
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
    used_fallback: usedFallback,
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
  loadMaxSimilarityToPublished,
  loadLatestAnalysis,
  computeCreaScoreFields,
  normalizeVerification,
  TITLE_SIMILARITY_THRESHOLD,
};
