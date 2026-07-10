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
  runMigrate();
  runSeed();

  const pool = createPool();
  const server = startApi({ port: PORT, stdio: 'inherit' });

  try {
    await waitForHealth(BASE);
    const director = await login(DIRECTOR);
    const colaborador = await login(COLABORADOR);

    let n = 0;
    const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

    // --- módulos nuevos cargan sin explotar (require no dispara side effects: el
    //     cron solo arranca si se llama startListeningCron()) ---
    const { startListeningCron } = require('../src/lib/listening-cron');
    const { detectAndSaveTopics } = require('../src/lib/topic-detection');
    ok(typeof startListeningCron === 'function', 'listening-cron exporta startListeningCron');
    ok(typeof detectAndSaveTopics === 'function', 'topic-detection exporta detectAndSaveTopics');

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
