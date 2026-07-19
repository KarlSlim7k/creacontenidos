#!/usr/bin/env node
// Check ejecutable de la automatización de RADAR: cron de detección
// (listening-cron.js), canibalización (content-engine/generate-proposal) y
// validación de sección (editorial draft). NO gasta en APIs de pago: solo
// guards + lógica SQL (similarity() de pg_trgm, filtro de metadata.usage en
// ai-usage) — el happy-path real de detección/generación con IA queda fuera
// (mismo criterio que check-content-engine.js / check-newsletter.js).
const assert = require('node:assert');
const {
  runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth,
  login: loginAt, postJson, patchJson,
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
    const { detectAndSaveTopics, insertTopicIfNew } = require('../src/lib/topic-detection');
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
    const { rows: afterUp } = await pool.query('SELECT count(*)::int AS n FROM topics WHERE lower(title) = lower($1) OR id = $2', [insertTitle, inserted.id]);
    ok(afterUp[0].n === 1, 'no se duplicó la fila al upgrade');
    await pool.query('DELETE FROM topics WHERE id = $1', [inserted.id]);

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

    console.log(`\n✔ check-listening pasó (${n} asserts). Brecha conocida: happy-path de detección/generación con IA real no cubierto (requiere mock de fetch).`);
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
