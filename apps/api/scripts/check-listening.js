#!/usr/bin/env node
// Check ejecutable de la automatización de RADAR: cron de detección
// (listening-cron.js), canibalización (content-engine/generate-proposal) y
// validación de sección (editorial draft). NO gasta en APIs de pago: guards +
// lógica SQL (similarity() de pg_trgm, filtro de metadata.usage en ai-usage)
// más el happy-path de detectAndSaveTopics() con fetch mockeado (H_AI_HAPPY_PATH,
// R2-02) — el de generación (content-engine/generate-proposal) sigue fuera
// (mismo criterio que check-content-engine.js / check-newsletter.js).
const assert = require('node:assert');
const {
  runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth,
  login: loginAt, postJson, patchJson, withMockedFetch, chatCompletionResponse,
} = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3995;
const BASE = `http://localhost:${PORT}`;
const DIRECTOR = 'director@crearcontenidos.com';
const COLABORADOR = 'marisol.hidalgo@crearcontenidos.com';

function login(email) { return loginAt(BASE, email); }
function post(pathname, token, body) { return postJson(BASE, pathname, token, body); }
function patch(pathname, token, body) { return patchJson(BASE, pathname, token, body); }

async function fetchUsage(token) {
  const res = await fetch(`${BASE}/api/content/ai-usage`, { headers: { Authorization: 'Bearer ' + token } });
  return { status: res.status, body: await res.json() };
}

async function main() {
  // --- H_NORMALIZE: reglas de verificación post-IA (sin DB ni API de pago) ---
  let n = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

  const {
    normalizeVerification,
    applyScrapeMultiSource,
    applyTrustFromSources,
    matchScrapeSources,
    countIndependentSources,
    isBetterTopic,
    resolveSourceTrust,
  } = require('../src/lib/topic-verification');
  ok(normalizeVerification(null) === null, 'normalize: null → null');
  ok(normalizeVerification({}) === null, 'normalize: sin title → null');

  const verifiedOk = normalizeVerification({
    title: 'Corte de agua con comunicado',
    confidence: 92,
    verification_status: 'verified',
    source_count: 2,
    evidence: [
      { label: 'CMAS', kind: 'primary', url: 'https://example.com/cmas', reliable: true },
      { label: 'Medio', kind: 'secondary', reliable: true },
    ],
    risk_flags: [],
  });
  ok(verifiedOk.verification_status === 'verified' && verifiedOk.confidence === 92, 'normalize: multi-fuente verified se mantiene');

  const fakeVerified = normalizeVerification({
    title: 'Solo un post viral',
    confidence: 95,
    verification_status: 'verified',
    source_count: 1,
    evidence: [{ label: 'FB', kind: 'social' }],
    risk_flags: [],
  });
  ok(fakeVerified.verification_status !== 'verified', 'normalize: cap verified sin primaria ni multi-fuente');
  ok(fakeVerified.confidence <= 74, 'normalize: confidence capada al bajar de verified');

  const rumor = normalizeVerification({
    title: 'Se dice que…',
    confidence: 80,
    verification_status: 'checking',
    source_count: 1,
    evidence: [],
    risk_flags: ['rumor', 'clickbait'],
  });
  ok(rumor.verification_status === 'risk' && rumor.confidence <= 39, 'normalize: hard risk → risk + cap 39');

  const bogusUrl = normalizeVerification({
    title: 'Con url basura',
    confidence: 50,
    verification_status: 'checking',
    evidence: [{ label: 'X', url: 'not-a-url', kind: 'social' }],
  });
  ok(bogusUrl.evidence[0].url === null, 'normalize: URL no-http → null');

  const derived = normalizeVerification({
    title: 'Sin status del modelo',
    confidence: 20,
    evidence: [],
  });
  ok(derived.verification_status === 'risk', 'normalize: conf baja deriva risk');

  // --- H_CREA_SCORE: fórmula pura, sin DB (R2-25) ---
  const { calculateCreaScore } = require('../src/lib/crea-score');
  const scoreNoData = calculateCreaScore({}, null, {});
  ok(scoreNoData.score === null, 'crea-score: sin ningún factor presente, score es null (no 0)');
  ok(Object.values(scoreNoData.breakdown).every((f) => !f.present && f.score === null), 'crea-score: breakdown marca todos los factores ausentes');

  const scorePartial = calculateCreaScore({ detected_at: new Date().toISOString(), mentions: 0, source_count: 0, evidence: [] }, null, {});
  ok(scorePartial.score != null, 'crea-score: con solo actualidad/fuentes/interés presentes, igual da un score (promedio de lo presente)');
  ok(!scorePartial.breakdown.relevancia_local.present && !scorePartial.breakdown.impacto_potencial.present, 'crea-score: factores sin insumo quedan ausentes, no en 0');

  const scoreFull = calculateCreaScore(
    {
      detected_at: new Date(Date.now() - 86400000).toISOString(), // ayer
      mentions: 100, source_count: 4,
      evidence: [{ reliable: true }, { reliable: true }, { reliable: false }],
      territorial_scope: 'local',
    },
    { implicaciones: ['a', 'b', 'c', 'd'], para_el_ciudadano: 'haz x', conversacion: null },
    { maxSimilarityToPublished: 0 }
  );
  ok(scoreFull.score >= 80, `crea-score: tema completo y favorable → score alto (fue ${scoreFull.score})`);
  ok(scoreFull.breakdown.conversacion.present === false, 'crea-score: conversacion siempre ausente hoy (regla no negociable de la fase 03)');
  ok(scoreFull.breakdown.interes_ciudadano.weight === 5, 'crea-score: interés ciudadano pesa 5 (el más bajo) — sesgo a Facebook documentado');

  // --- H_MULTISOURCE: scrape match + hosts independientes (sin API de pago) ---
  const scrapeUrls = [
    'https://ayuntamiento.perote.gob.mx/noticias/1',
    'https://medio-local.mx/nota/1',
    'https://otro.mx/x',
  ];
  const multiRaw = applyScrapeMultiSource({
    title: 'Obra en Reforma',
    confidence: 60,
    verification_status: 'checking',
    source_count: 1,
    risk_flags: ['single_source'],
    evidence: [
      { label: 'Ayuntamiento', url: 'https://ayuntamiento.perote.gob.mx/noticias/1', kind: 'primary' },
      { label: 'Medio', url: 'https://medio-local.mx/nota/1', kind: 'secondary' },
    ],
  }, scrapeUrls);
  ok(multiRaw.source_count >= 2, `multi-scrape sube source_count (fue ${multiRaw.source_count})`);
  ok(multiRaw.confidence >= 70, `multi-scrape +10 conf (fue ${multiRaw.confidence})`);
  ok(matchScrapeSources(multiRaw.evidence, scrapeUrls).length === 2, 'matchScrapeSources cuenta 2');
  const multiNorm = normalizeVerification(multiRaw);
  ok(multiNorm.source_count >= 2, 'normalize respeta multi-fuente estructural');
  ok(countIndependentSources(multiNorm.evidence) === 2, 'countIndependentSources = 2 hosts');

  ok(isBetterTopic(
    { verification_status: 'verified', confidence: 80, source_count: 2 },
    { verification_status: 'signal', confidence: 90, source_count: 1 }
  ), 'isBetterTopic: verified > signal');
  ok(!isBetterTopic(
    { verification_status: 'risk', confidence: 10, source_count: 1 },
    { verification_status: 'checking', confidence: 50, source_count: 1 }
  ), 'isBetterTopic: risk no mejora checking');

  // --- H_TRUST: lista editorial high/low (sin DB) ---
  const trustList = [
    { domain: 'perote.gob.mx', trust: 'high', label: 'Ayuntamiento' },
    { domain: 'facebook.com', trust: 'low', label: 'FB' },
  ];
  ok(resolveSourceTrust('www.perote.gob.mx', trustList)?.trust === 'high', 'resolveSourceTrust subdominio high');
  const trusted = applyTrustFromSources({
    title: 'Comunicado',
    confidence: 50,
    verification_status: 'checking',
    evidence: [{ label: 'Ayto', url: 'https://perote.gob.mx/aviso', kind: 'primary' }],
  }, trustList);
  ok(trusted.confidence >= 58, `trust high +8 conf (fue ${trusted.confidence})`);
  const lowOnly = applyTrustFromSources({
    title: 'Viral',
    confidence: 80,
    verification_status: 'verified',
    evidence: [{ label: 'FB', url: 'https://facebook.com/posts/1', kind: 'social' }],
  }, trustList);
  ok(lowOnly.confidence <= 68, `trust low penaliza conf (fue ${lowOnly.confidence})`);
  ok(lowOnly.verification_status !== 'verified', 'solo low no queda verified');
  ok(
    Array.isArray(lowOnly.risk_flags) && lowOnly.risk_flags.some((f) => String(f).includes('low_trust')),
    'flag low_trust_source'
  );

  runMigrate();
  runSeed();

  const pool = createPool();
  const server = startApi({ port: PORT, stdio: 'inherit' });

  try {
    await waitForHealth(BASE);
    const director = await login(DIRECTOR);
    const colaborador = await login(COLABORADOR);

    // --- módulos nuevos cargan sin explotar (require no dispara side effects: el
    //     cron solo arranca si se llama startListeningCron()) ---
    const { startListeningCron } = require('../src/lib/listening-cron');
    const { detectAndSaveTopics, insertTopicIfNew, detectViaFirecrawl } = require('../src/lib/topic-detection');
    ok(typeof startListeningCron === 'function', 'listening-cron exporta startListeningCron');
    ok(typeof detectAndSaveTopics === 'function', 'topic-detection exporta detectAndSaveTopics');
    ok(typeof insertTopicIfNew === 'function', 'topic-detection exporta insertTopicIfNew');

    // --- H_INSERT_VERIFY: INSERT normalizado persiste confidence/evidence ---
    const insertTitle = `[check] Verificación insert ${Date.now()}`;
    const inserted = await insertTopicIfNew({
      title: insertTitle,
      source: 'Web Search',
      mentions: 3,
      confidence: 90,
      verification_status: 'verified',
      source_count: 1,
      evidence: [{ label: 'Solo una', kind: 'social' }],
      risk_flags: [],
      known_facts: 'Hecho de prueba check-listening',
      editorial_decision: 'Test only',
    });
    ok(inserted && inserted.id, 'insertTopicIfNew devuelve fila');
    ok(inserted.verification_status === 'checking' || inserted.verification_status === 'signal',
      `insert aplica cap verified (fue ${inserted.verification_status})`);
    ok(Number(inserted.confidence) <= 74, 'insert confidence capada');
    ok(Array.isArray(inserted.evidence), 'insert evidence es array/jsonb');
    ok(inserted.crea_score != null, `insertTopicIfNew calcula crea_score real, no queda NULL (R2-26) (fue ${inserted.crea_score})`);
    ok(inserted.crea_score_breakdown && inserted.crea_score_breakdown.actualidad.present === true,
      'crea_score_breakdown.actualidad presente — detected_at se pasa aunque t no lo traiga (bug real que se corrigió acá)');
    const dupe = await insertTopicIfNew({ title: insertTitle, confidence: 10, verification_status: 'risk' });
    ok(dupe === null, 'insertTopicIfNew dedupe 24h peor/igual → null');

    // Título casi igual + mejor verificación → upgrade (merge), no segunda fila
    const similarTitle = insertTitle.replace('insert', 'INSERT'); // similarity alta
    const upgraded = await insertTopicIfNew({
      title: similarTitle,
      confidence: 88,
      verification_status: 'verified',
      source_count: 2,
      evidence: [
        { label: 'Oficial', kind: 'primary', url: 'https://ejemplo.gob.mx/a' },
        { label: 'Medio', kind: 'secondary', url: 'https://medio.mx/b' },
      ],
      risk_flags: [],
      known_facts: 'Actualizado con mejor evidencia',
    });
    ok(upgraded && upgraded._action === 'upgraded', `similar mejor → upgraded (action=${upgraded && upgraded._action})`);
    ok(upgraded.id === inserted.id, 'upgrade reusa el mismo id');
    ok(Number(upgraded.confidence) >= 75, 'upgrade sube confidence');
    ok(upgraded.crea_score != null, `upgrade también recalcula crea_score (R2-26) (fue ${upgraded.crea_score})`);
    const { rows: afterUp } = await pool.query('SELECT count(*)::int AS n FROM topics WHERE lower(title) = lower($1) OR id = $2', [insertTitle, inserted.id]);
    ok(afterUp[0].n === 1, 'no se duplicó la fila al upgrade');
    await pool.query('DELETE FROM topics WHERE id = $1', [inserted.id]);

    // --- H_AI_HAPPY_PATH: detectAndSaveTopics() de punta a punta con IA
    //     mockeada (R2-02) — sin red real, sin gastar en API de pago. Prueba
    //     el pipeline completo fetch → parseJson() → normalizeVerification()
    //     → insertTopicIfNew(), y falla si cualquiera de esos tres se rompe. ---
    const config = require('../src/config');
    const { rows: directorRow } = await pool.query('SELECT id FROM users WHERE email = $1', [DIRECTOR]);
    const directorId = directorRow[0].id;
    const realFirecrawlKey = config.firecrawlApiKey;
    config.firecrawlApiKey = null; // fuerza el camino Perplexity, determinista sin importar el .env local

    const happyTitle = `[check] IA happy path ${Date.now()}`;
    const validPayload = JSON.stringify([{
      title: happyTitle,
      source: 'Web Search',
      mentions: 12,
      sentiment: 'neutral',
      antecedentes: 'CMAS confirmó el corte para mantenimiento el 10 de septiembre.',
      actores: 'CMAS, ayuntamiento de Perote',
      angulos: 'Impacto en colonias sin servicio',
      audiencia: 'Vecinos de Perote',
      confidence: 90,
      verification_status: 'verified',
      known_facts: 'CMAS confirmó el corte de agua vía comunicado oficial.',
      unknown_facts: 'Hora exacta de restablecimiento del servicio.',
      evidence: [{ label: 'CMAS comunicado', url: 'https://cmas.example.mx/comunicado', kind: 'primary', supports: true, reliable: true }],
      risk_flags: [],
      source_count: 1,
    }]);

    try {
      const happyRows = await withMockedFetch(
        [{ match: 'api.perplexity.ai', response: chatCompletionResponse(validPayload) }],
        async (calls) => {
          const rows = await detectAndSaveTopics(happyTitle, directorId, 'manual');
          ok(calls.length === 1, 'H_AI_HAPPY_PATH: una sola llamada de red (Perplexity), Firecrawl deshabilitado');
          return rows;
        }
      );
      ok(happyRows.length === 1, `H_AI_HAPPY_PATH: detectAndSaveTopics inserta 1 topic (fueron ${happyRows.length})`);
      ok(happyRows[0]._action === 'inserted', 'H_AI_HAPPY_PATH: acción = inserted');
      ok(happyRows[0].verification_status === 'verified', 'H_AI_HAPPY_PATH: pipeline completo produce verified con fuente primaria');
      ok(Number(happyRows[0].confidence) === 90, 'H_AI_HAPPY_PATH: confidence viaja intacta desde el modelo hasta la fila');

      // JSON malformado del modelo → parseJson() revienta, nada se inserta.
      let malformedThrew = false;
      try {
        await withMockedFetch(
          [{ match: 'api.perplexity.ai', response: chatCompletionResponse('esto no es JSON en absoluto') }],
          () => detectAndSaveTopics('check IA json malformado', directorId, 'manual')
        );
      } catch (_) { malformedThrew = true; }
      ok(malformedThrew, 'H_AI_HAPPY_PATH: contenido no-JSON del modelo revienta en parseJson(), no inserta silenciosamente');

      // Error HTTP del proveedor → detectAndSaveTopics propaga el fallo.
      let httpErrorThrew = false;
      try {
        await withMockedFetch(
          [{ match: 'api.perplexity.ai', response: chatCompletionResponse('', { status: 503, errorBody: { error: 'rate limited' } }) }],
          () => detectAndSaveTopics('check IA error http', directorId, 'manual')
        );
      } catch (_) { httpErrorThrew = true; }
      ok(httpErrorThrew, 'H_AI_HAPPY_PATH: error HTTP del proveedor propaga el fallo, no queda fila a medias');
    } finally {
      config.firecrawlApiKey = realFirecrawlKey;
      await pool.query('DELETE FROM topics WHERE title = $1', [happyTitle]);
    }

    // --- H_RADAR_SOURCE_HEALTH: detectViaFirecrawl() refleja salud en
    //     radar_sources (R2-54, fase 09) — con fetch mockeado, sin red real. ---
    {
      const realBaseUrl = config.firecrawlBaseUrl;
      const realSourceUrls = config.firecrawlSourceUrls;
      config.firecrawlApiKey = 'check-key';
      config.firecrawlBaseUrl = 'https://firecrawl.check.test/v1';
      const untrackedDomain = 'no-catalogado-check.example.com';
      const okFirecrawlResponse = (call) => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { markdown: '# Contenido de prueba\nAlgo pasó en Perote.', metadata: { sourceURL: call.body.url } } }),
        text: async () => '',
      });

      try {
        // Caso éxito: perote.gob.mx (en radar_sources, seed 035) queda 'ok';
        // el dominio no catalogado no inserta fila nueva (radar_sources es
        // lista curada, no cache de lo que Firecrawl tocó).
        config.firecrawlSourceUrls = `https://perote.gob.mx/,https://${untrackedDomain}/`;
        await withMockedFetch(
          [
            { match: 'firecrawl.check.test', response: okFirecrawlResponse },
            { match: 'openrouter.ai', response: chatCompletionResponse('[]') },
          ],
          () => detectViaFirecrawl('[check] salud de fuentes')
        );
        const { rows: [okHealth] } = await pool.query(
          `SELECT status, last_crawl_at, engine, last_error FROM radar_sources WHERE domain = 'perote.gob.mx'`
        );
        ok(okHealth.status === 'ok', `H_RADAR_SOURCE_HEALTH: perote.gob.mx queda 'ok' tras scrape exitoso (fue ${okHealth.status})`);
        ok(okHealth.last_crawl_at !== null, 'H_RADAR_SOURCE_HEALTH: last_crawl_at se setea tras scrape exitoso');
        ok(okHealth.engine === 'firecrawl', `H_RADAR_SOURCE_HEALTH: engine = 'firecrawl' (fue ${okHealth.engine})`);
        ok(okHealth.last_error === null, 'H_RADAR_SOURCE_HEALTH: last_error se limpia tras scrape exitoso');

        const { rows: untrackedRows } = await pool.query(
          'SELECT count(*)::int AS n FROM radar_sources WHERE domain = $1', [untrackedDomain]
        );
        ok(untrackedRows[0].n === 0, 'H_RADAR_SOURCE_HEALTH: dominio no catalogado no crea fila nueva en radar_sources');

        // Caso fallo: la única fuente configurada revienta → detectViaFirecrawl
        // propaga el error, pero la salud del dominio ya quedó registrada.
        config.firecrawlSourceUrls = 'https://perote.gob.mx/';
        let threw = false;
        try {
          await withMockedFetch(
            [{ match: 'firecrawl.check.test', response: { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' } }],
            () => detectViaFirecrawl('[check] salud de fuentes con fallo')
          );
        } catch (_) { threw = true; }
        ok(threw, 'H_RADAR_SOURCE_HEALTH: sin fuentes con markdown, detectViaFirecrawl propaga el error');

        const { rows: [errHealth] } = await pool.query(
          `SELECT status, last_error FROM radar_sources WHERE domain = 'perote.gob.mx'`
        );
        ok(errHealth.status === 'error', `H_RADAR_SOURCE_HEALTH: perote.gob.mx queda 'error' tras scrape fallido (fue ${errHealth.status})`);
        ok(!!errHealth.last_error, 'H_RADAR_SOURCE_HEALTH: last_error queda poblado tras scrape fallido');
      } finally {
        config.firecrawlApiKey = realFirecrawlKey;
        config.firecrawlBaseUrl = realBaseUrl;
        config.firecrawlSourceUrls = realSourceUrls;
        await pool.query(
          `UPDATE radar_sources SET status = 'ok', last_crawl_at = NULL, engine = NULL, last_error = NULL WHERE domain = 'perote.gob.mx'`
        );
      }
    }

    // --- H_VERIFY_SCHEMA: columnas de verificación (034) expuestas en GET /topics ---
    const topicsRes = await fetch(`${BASE}/api/listening/topics`, {
      headers: { Authorization: 'Bearer ' + director },
    });
    ok(topicsRes.status === 200, `GET /topics → 200 (llegó ${topicsRes.status})`);
    const topicsBody = await topicsRes.json();
    ok(Array.isArray(topicsBody), 'GET /topics devuelve array');
    ok(topicsBody.length > 0, 'GET /topics tiene al menos un topic (seed)');
    const sample = topicsBody[0];
    for (const key of [
      'confidence', 'verification_status', 'known_facts', 'unknown_facts',
      'evidence', 'risk_flags', 'editorial_decision', 'source_count',
    ]) {
      ok(Object.prototype.hasOwnProperty.call(sample, key), `GET /topics incluye campo ${key}`);
    }
    const withVerify = topicsBody.find((t) => t.verification_status != null);
    ok(withVerify, 'seed demo trae al menos un topic con verification_status');
    ok(
      ['verified', 'checking', 'signal', 'risk'].includes(withVerify.verification_status),
      `verification_status válido (fue ${withVerify.verification_status})`,
    );
    const filterRes = await fetch(`${BASE}/api/listening/topics?verification_status=risk`, {
      headers: { Authorization: 'Bearer ' + director },
    });
    ok(filterRes.status === 200, 'GET /topics?verification_status=risk → 200');
    const riskTopics = await filterRes.json();
    ok(Array.isArray(riskTopics) && riskTopics.every((t) => t.verification_status === 'risk'),
      'filtro verification_status=risk solo devuelve risk');

    // --- H_TOPICS_PAGING: limit/offset + verification_status=none ---
    const authDirector = { headers: { Authorization: 'Bearer ' + director } };
    const page1 = await (await fetch(`${BASE}/api/listening/topics?limit=1&offset=0`, authDirector)).json();
    const page2 = await (await fetch(`${BASE}/api/listening/topics?limit=1&offset=1`, authDirector)).json();
    ok(page1.length === 1 && page2.length === 1, 'limit=1 devuelve 1 fila por página');
    const allTopics = await (await fetch(`${BASE}/api/listening/topics?limit=500`, authDirector)).json();
    ok(allTopics.length === topicsBody.length, 'limit=500 devuelve todo el seed');
    const noneTopics = await (await fetch(`${BASE}/api/listening/topics?verification_status=none`, authDirector)).json();
    ok(Array.isArray(noneTopics) && noneTopics.every((t) => t.verification_status == null),
      'filtro verification_status=none solo devuelve nulls');

    // --- H_ORDER_SCORE (R2-27): ?order=score es explícito, no cambia el default ---
    const defaultOrder = await (await fetch(`${BASE}/api/listening/topics?limit=500`, authDirector)).json();
    const byScoreOrder = await (await fetch(`${BASE}/api/listening/topics?limit=500&order=score`, authDirector)).json();
    ok(byScoreOrder.length === defaultOrder.length, 'order=score no cambia cuántos topics devuelve, solo el orden');
    ok(defaultOrder.map((t) => t.id).join(',') !== '' , 'sanity: hay topics para comparar orden');
    const scored = byScoreOrder.filter((t) => t.crea_score != null).map((t) => t.crea_score);
    ok(scored.every((s, i) => i === 0 || scored[i - 1] >= s), 'order=score: los que tienen score quedan de mayor a menor');
    const firstNullIdx = byScoreOrder.findIndex((t) => t.crea_score == null);
    const lastScoredIdx = byScoreOrder.map((t) => t.crea_score != null).lastIndexOf(true);
    ok(firstNullIdx === -1 || lastScoredIdx === -1 || firstNullIdx > lastScoredIdx, 'order=score: los NULL quedan al final (NULLS LAST)');
    ok(defaultOrder[0].id === topicsBody[0].id, 'sin order=, sigue cronológico (mismo primero que antes)');

    // --- H_TOPICS_SUMMARY: totales + sources coherentes con la lista ---
    const sumRes = await fetch(`${BASE}/api/listening/topics/summary`, authDirector);
    ok(sumRes.status === 200, `GET /topics/summary → 200 (llegó ${sumRes.status})`);
    const sum = await sumRes.json();
    ok(typeof sum.total === 'number' && sum.by_verification && Array.isArray(sum.sources), 'summary shape');
    const sumParts = Object.values(sum.by_verification).reduce((a, b) => a + b, 0);
    ok(sumParts === sum.total, `by_verification suma total (${sumParts} vs ${sum.total})`);
    ok(sum.total === topicsBody.length, `summary.total = lista sin paginar (${sum.total} vs ${topicsBody.length})`);
    ok((sum.by_verification.none || 0) === noneTopics.length, 'summary.none = filtro none');
    ok(sum.sources.includes('Web Search'), 'summary.sources incluye Web Search');
    ok((await fetch(`${BASE}/api/listening/topics/summary`)).status === 401, 'summary sin token → 401');

    // --- H_SCORE_BANDS (R2-27/R2-28): bandas del CREA Score, etiqueta, nunca filtro ---
    ok(sum.by_score_band && typeof sum.by_score_band.alta === 'number', 'summary trae by_score_band');
    const bandParts = Object.values(sum.by_score_band).reduce((a, b) => a + b, 0);
    ok(bandParts === sum.total, `by_score_band suma total (${bandParts} vs ${sum.total})`);

    // --- H_TODAY_SYNTHESIS (R2-29): síntesis operativa, números reales ---
    ok(sum.today && typeof sum.today.since_last_cutoff === 'number', 'summary.today.since_last_cutoff existe');
    ok(typeof sum.today.discarded === 'number' && sum.today.discarded >= 0, 'summary.today.discarded existe y no es negativo');
    ok(sum.today.signals === (sum.by_verification.signal || 0), 'summary.today.signals coincide con by_verification.signal');
    ok(sum.today.to_contextualize === (sum.by_verification.checking || 0), 'summary.today.to_contextualize = checking');
    ok(typeof sum.today.crea_analyses === 'number', 'summary.today.crea_analyses existe');

    // --- H_RADAR_SOURCES: lista editorial ---
    const srcRes = await fetch(`${BASE}/api/listening/radar-sources`, {
      headers: { Authorization: 'Bearer ' + director },
    });
    ok(srcRes.status === 200, `GET radar-sources → 200 (llegó ${srcRes.status})`);
    const srcBody = await srcRes.json();
    ok(Array.isArray(srcBody) && srcBody.length > 0, 'radar_sources seed tiene filas');
    ok(srcBody.some((s) => s.trust === 'high' && s.domain), 'hay al menos una fuente high');
    ok((await fetch(`${BASE}/api/listening/radar-sources`)).status === 401, 'radar-sources sin token → 401');

    // --- H_RADAR_STATS: calibración Fase 6 ---
    const statsRes = await fetch(`${BASE}/api/listening/radar-stats?days=30`, {
      headers: { Authorization: 'Bearer ' + director },
    });
    ok(statsRes.status === 200, `GET radar-stats → 200 (llegó ${statsRes.status})`);
    const stats = await statsRes.json();
    ok(typeof stats.days === 'number' && stats.topics && typeof stats.topics.total === 'number', 'radar-stats shape topics');
    ok(stats.proposals && typeof stats.proposals.blocked_risk === 'number', 'radar-stats proposals');
    ok(stats.detection && typeof stats.detection.runs === 'number', 'radar-stats detection');
    ok(Array.isArray(stats.hints) && stats.hints.length > 0, 'radar-stats hints');
    ok(stats.knobs && stats.knobs.confidence_verified_min === 75, 'radar-stats knobs');
    ok(stats.reasons && typeof stats.reasons.total === 'number' && typeof stats.reasons.by_code === 'object', 'radar-stats: agregado de motivos (R2-09)');
    ok((await fetch(`${BASE}/api/listening/radar-stats`)).status === 401, 'radar-stats sin token → 401');

    // --- H_RISK_GATE: topic risk → 409 sin force (no gasta IA) ---
    const RISK_TITLE = `[check] Tema risk gate ${Date.now()}`;
    const { rows: riskTopicRows } = await pool.query(
      `INSERT INTO topics (title, source, verification_status, confidence, risk_flags, editorial_decision)
       VALUES ($1, 'Web Search', 'risk', 18, '["rumor"]'::jsonb, 'No titular como hecho')
       RETURNING id`,
      [RISK_TITLE]
    );
    const riskId = riskTopicRows[0].id;
    const riskBlocked = await post('/api/content/generate-proposal', director, { topic_id: riskId, format: 'nota' });
    const riskBody = await riskBlocked.json();
    ok(riskBlocked.status === 409, `H_RISK_GATE: risk sin force → 409 (llegó ${riskBlocked.status})`);
    ok(riskBody.code === 'verification_risk', 'H_RISK_GATE: code verification_risk');
    ok(riskBody.verification_status === 'risk', 'H_RISK_GATE: reporta verification_status');
    // force:true pasa el gate de risk; puede fallar después por IA o canibal — solo
    // comprobamos que NO sea 409 verification_risk (si no hay keys, 500 es ok).
    const riskForced = await post('/api/content/generate-proposal', director, {
      topic_id: riskId, format: 'nota', force: true,
    });
    const riskForcedBody = await riskForced.json().catch(() => ({}));
    ok(
      riskForced.status !== 409 || riskForcedBody.code !== 'verification_risk',
      `H_RISK_FORCE: force no devuelve verification_risk (status ${riskForced.status})`
    );
    // Si force sí generó una propuesta real, no debe quedar viva: además de ensuciar
    // 'propuesta' para otros checks, arrastra el snapshot 'ai_generated' (R2-50) que
    // infla el avgCorrectionRate de GET /editorial/metrics en checks posteriores.
    if (riskForced.status === 201 && riskForcedBody.id) {
      await pool.query('DELETE FROM content_proposal_versions WHERE proposal_id = $1', [riskForcedBody.id]);
      await pool.query('DELETE FROM content_proposals WHERE id = $1', [riskForcedBody.id]);
    }
    await pool.query('DELETE FROM topics WHERE id = $1', [riskId]);

    // --- H_CANIBAL: topic muy similar a una nota ya publicada → 409 ANTES de gastar en IA ---
    const TITLE = 'Balacera en el centro de Perote deja tres heridos';
    const SLUG = 'balacera-centro-perote-check';
    await pool.query('DELETE FROM topics WHERE title = $1', [TITLE]);
    await pool.query(
      `INSERT INTO content_proposals (format, title, body, section, status, slug, origin, published_at)
       VALUES ('nota', $1, 'cuerpo de prueba', 'Local', 'published', $2, '100% humano', now())
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, status = 'published'`,
      [TITLE, SLUG]
    );
    const { rows: topicRows } = await pool.query(
      `INSERT INTO topics (title, source) VALUES ($1, 'Web Search') RETURNING id`,
      [TITLE]
    );
    const canibalHttpRes = await post('/api/content/generate-proposal', director, { topic_id: topicRows[0].id });
    const canibalBody = await canibalHttpRes.json();
    ok(canibalHttpRes.status === 409, `H_CANIBAL: topic idéntico a nota publicada → 409 (llegó ${canibalHttpRes.status})`);
    ok(Array.isArray(canibalBody.similar) && canibalBody.similar.some((s) => s.slug === SLUG), 'H_CANIBAL: reporta la nota publicada similar');

    // --- H_SECTION: editorial draft rechaza secciones fuera de la taxonomía fija ---
    const { rows: borradorRows } = await pool.query(`SELECT id FROM content_proposals WHERE status = 'borrador' LIMIT 1`);
    assert.ok(borradorRows[0], 'el seed debe traer al menos una propuesta en borrador');
    const badSection = await patch(`/api/editorial/proposals/${borradorRows[0].id}/draft`, director, { section: 'NoExiste' });
    ok(badSection.status === 400, `H_SECTION: sección fuera de taxonomía → 400 (llegó ${badSection.status})`);
    const goodSection = await patch(`/api/editorial/proposals/${borradorRows[0].id}/draft`, director, { section: 'Local' });
    ok(goodSection.status === 200, `H_SECTION: sección válida → 200 (llegó ${goodSection.status})`);

    // --- ai-usage: guards de rol ---
    ok((await fetch(`${BASE}/api/content/ai-usage`)).status === 401, 'ai-usage sin token → 401');
    ok((await fetchUsage(colaborador)).status === 403, 'ai-usage colaborador → 403 (solo director)');

    // --- H_USAGE: suma tokens reales y EXCLUYE filas con usage:null (delta, tolera
    //     activity_log acumulado de corridas previas del check) ---
    const before = await fetchUsage(director);
    ok(before.status === 200, 'ai-usage director → 200');
    await pool.query(
      `INSERT INTO activity_log (action, detail, status, metadata) VALUES
       ('generate_proposal', '[check] con usage', 'exito', '{"model":"test/model","usage":{"total_tokens":12345}}'::jsonb),
       ('generate_proposal', '[check] sin usage',  'exito', '{"model":"test/model","usage":null}'::jsonb)`
    );
    const after = await fetchUsage(director);
    const beforeCalls = (before.body.byAction.generate_proposal || { calls: 0 }).calls;
    const afterCalls = (after.body.byAction.generate_proposal || { calls: 0 }).calls;
    ok(after.body.totalTokens - before.body.totalTokens === 12345, `H_USAGE: delta de tokens = 12345 (fue ${after.body.totalTokens - before.body.totalTokens})`);
    ok(afterCalls - beforeCalls === 1, `H_USAGE_NULL: la fila con usage:null no cuenta como call (delta calls=${afterCalls - beforeCalls}, esperado 1)`);

    // --- H_DISCARD_REASON: reason_code obligatorio al descartar (R2-07) ---
    const DISCARD_TITLE = `[check] Descarte con motivo ${Date.now()}`;
    const { rows: discardRows } = await pool.query(
      `INSERT INTO topics (title, source, verification_status) VALUES ($1, 'Web Search', 'signal') RETURNING id`,
      [DISCARD_TITLE]
    );
    const discardId = discardRows[0].id;
    ok(
      (await fetch(`${BASE}/api/listening/topics/${discardId}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + director } })).status === 400,
      'DELETE /topics/:id sin reason_code → 400'
    );
    ok(
      (await fetch(`${BASE}/api/listening/topics/${discardId}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + director, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_code: 'no_existe' }),
      })).status === 400,
      'DELETE /topics/:id con reason_code fuera de taxonomía → 400'
    );
    const discardRes = await fetch(`${BASE}/api/listening/topics/${discardId}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + director, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason_code: 'poca_relevancia' }),
    });
    ok(discardRes.status === 204, `DELETE /topics/:id con reason_code válido → 204 (llegó ${discardRes.status})`);
    const discardLog = await pool.query(
      `SELECT metadata FROM activity_log WHERE action = 'radar_delete' AND metadata->>'topic_id' = $1 ORDER BY created_at DESC LIMIT 1`,
      [String(discardId)]
    );
    ok(discardLog.rows[0] && discardLog.rows[0].metadata.reason_code === 'poca_relevancia', 'radar_delete deja bitácora con reason_code (R2-06/R2-07)');

    const BATCH_TITLES = [`[check] batch A ${Date.now()}`, `[check] batch B ${Date.now()}`];
    const { rows: batchRows } = await pool.query(
      `INSERT INTO topics (title, source) VALUES ($1, 'Web Search'), ($2, 'Web Search') RETURNING id`,
      BATCH_TITLES
    );
    const batchIds = batchRows.map((r) => r.id);
    ok(
      (await post('/api/listening/topics/batch-delete', director, { ids: batchIds })).status === 400,
      'batch-delete sin reason_code → 400'
    );
    const batchRes = await post('/api/listening/topics/batch-delete', director, { ids: batchIds, reason_code: 'tema_viejo' });
    ok(batchRes.status === 200, `batch-delete con reason_code válido → 200 (llegó ${batchRes.status})`);
    const batchBody = await batchRes.json();
    ok(batchBody.deleted === 2, `batch-delete elimina 2 (fue ${batchBody.deleted})`);
    const batchLog = await pool.query(
      `SELECT metadata FROM activity_log WHERE action = 'radar_batch_delete' ORDER BY created_at DESC LIMIT 1`
    );
    ok(batchLog.rows[0] && batchLog.rows[0].metadata.reason_code === 'tema_viejo', 'radar_batch_delete deja bitácora con reason_code');

    // --- H_TOPICS_BULK_DELETE: DELETE /topics vacía el RADAR (re-seed al final
    //     para no dejar la BD sin topics para los checks siguientes) ---
    ok((await fetch(`${BASE}/api/listening/topics`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + colaborador } })).status === 403,
      'bulk delete colaborador → 403');
    const bulkRes = await fetch(`${BASE}/api/listening/topics`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + director } });
    ok(bulkRes.status === 200, `bulk delete director → 200 (llegó ${bulkRes.status})`);
    const bulk = await bulkRes.json();
    ok(typeof bulk.deleted === 'number' && bulk.deleted > 0, 'bulk delete devuelve deleted > 0');
    const afterBulk = await (await fetch(`${BASE}/api/listening/topics`, authDirector)).json();
    ok(afterBulk.length === 0, 'bulk delete vacía topics');
    runSeed();

    console.log(`\n✔ check-listening pasó (${n} asserts). Happy-path de detección cubierto con fetch mockeado (H_AI_HAPPY_PATH). Brecha restante: generación (content-engine/generate-proposal) con IA real no cubierta aquí.`);
  } finally {
    // La nota 'published' del fixture de canibalización no debe quedar viva:
    // infla el conteo de check-public-api.js (asume 30 publicados fijos del seed).
    await pool.query('DELETE FROM content_proposals WHERE slug = $1', ['balacera-centro-perote-check']).catch(() => {});
    await pool.query('DELETE FROM topics WHERE title = $1', ['Balacera en el centro de Perote deja tres heridos']).catch(() => {});
    await stopApi(server);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✘ check-listening falló:', err.message);
  process.exit(1);
});
