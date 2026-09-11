#!/usr/bin/env node
// Check ejecutable del Motor Editorial CREA (RADAR 2.0, R2-19/R2-20/R2-23).
// NO gasta en APIs de pago: usa withMockedFetch()/chatCompletionResponse()
// (R2-02, apps/api/scripts/lib/check-helpers.js) — mismo helper que
// H_AI_HAPPY_PATH en check-listening.js, no uno propio.
//
// startApi() levanta el server como PROCESO SEPARADO (spawn) — mockear
// global.fetch en este script no llega ahí. Por eso, igual que
// H_AI_HAPPY_PATH, los casos que llaman a IA usan createEditorialAnalysis()
// (editorial-engine.js) DIRECTO en este proceso, con el mismo pool de DB;
// la ruta HTTP (POST /topics/:id/analyze) es una envoltura delgada sobre esa
// misma función, así que esto sí ejercita la lógica real. Los casos que no
// necesitan IA (validación, roles, 404, historial) sí van por HTTP real.
// Brecha conocida: la traducción de err.code==='incomplete_analysis' a 502 en
// la ruta HTTP no se ejercita end-to-end (requeriría mockear fetch DENTRO del
// proceso del server, no de este script) — sí se verifica que
// createEditorialAnalysis() lanza con ese código exacto (H_INCOMPLETE), que
// es lo que esa rama de la ruta consume.
const assert = require('node:assert');
const {
  runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth,
  login: loginAt, postJson, withMockedFetch, chatCompletionResponse,
} = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3992;
const BASE = `http://localhost:${PORT}`;
const DIRECTOR = 'director@crearcontenidos.com';
const COLABORADOR = 'marisol.hidalgo@crearcontenidos.com';

function login(email) { return loginAt(BASE, email); }
function post(pathname, token, body) { return postJson(BASE, pathname, token, body); }
function analyzeUrl(topicId) { return `/api/listening/topics/${topicId}/analyze`; }

async function main() {
  let n = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

  const { createEditorialAnalysis, sanitizeAnalysis, buildPrompt, isValidLevel } = require('../src/lib/editorial-engine');

  // --- H_PURE: buildPrompt/sanitizeAnalysis, sin red ni DB ---
  ok(isValidLevel(1) && isValidLevel(2) && isValidLevel(3) && !isValidLevel(4) && !isValidLevel(0), 'isValidLevel acepta solo 1|2|3');
  const p1 = buildPrompt(1, { title: 'x' });
  ok(p1.modelKey === 'default', 'nivel 1 usa modelo default');
  const p3 = buildPrompt(3, { title: 'x' });
  ok(p3.modelKey === 'complex', 'nivel 3 usa modelo complex (más costoso)');
  ok(
    sanitizeAnalysis(1, { que_paso: { resumen: 'r', hechos: ['h'] }, para_el_ciudadano: 'x' }) !== null,
    'sanitize nivel 1 completo → objeto'
  );
  ok(sanitizeAnalysis(1, { que_paso: { resumen: 'r', hechos: [] } }) === null, 'sanitize nivel 1 incompleto (sin para_el_ciudadano) → null, se rechaza');
  const sane3 = sanitizeAnalysis(3, {
    que_paso: { resumen: 'r', hechos: ['h'] }, por_que_importa: 'x', contexto: 'x',
    datos: [{ label: 'a', value: 'b' }], implicaciones: ['x'], pendientes: 'x',
    para_el_ciudadano: 'x', relevancia_perote: 'x', conversacion: 'esto se debe ignorar',
  });
  ok(sane3 && sane3.conversacion === null, 'conversacion siempre null, sin importar lo que mande el modelo (regla no negociable)');

  runMigrate();
  runSeed();

  const pool = createPool();
  const server = startApi({ port: PORT });
  let topicId;

  try {
    await waitForHealth(BASE);
    const director = await login(DIRECTOR);
    const colaborador = await login(COLABORADOR);
    const { rows: [directorRow] } = await pool.query('SELECT id FROM users WHERE email = $1', [DIRECTOR]);

    const { rows: [topic] } = await pool.query(
      `INSERT INTO topics (title, source, verification_status, confidence, known_facts, locality, category)
       VALUES ($1, 'Web Search', 'checking', 70, 'CMAS confirmó el corte de agua.', 'Perote', 'servicios_publicos')
       RETURNING *`,
      [`[check] Motor Editorial ${Date.now()}`]
    );
    topicId = topic.id;

    // --- H_HTTP: validación, roles, 404 — sin gastar en IA ---
    ok((await post(analyzeUrl(topicId), colaborador, { level: 1 })).status === 403, 'colaborador no puede disparar análisis → 403');
    ok((await post(analyzeUrl(999999), director, { level: 1 })).status === 404, 'topic inexistente → 404');
    ok((await post(analyzeUrl(topicId), director, { level: 4 })).status === 400, 'level fuera de 1|2|3 → 400');
    ok((await post(analyzeUrl(topicId), director, {})).status === 400, 'sin level → 400');

    // --- H_LEVEL_1/2/3: createEditorialAnalysis() directo, con IA mockeada ---
    const level1Payload = JSON.stringify({
      que_paso: { resumen: 'CMAS confirmó un corte de agua programado.', hechos: ['Afecta 4 colonias', 'Dura desde las 08:00'] },
      para_el_ciudadano: 'Junta agua antes de las 08:00 si vives en las colonias afectadas.',
    });
    const a1 = await withMockedFetch(
      [{ match: 'inference-api.nousresearch.com', response: chatCompletionResponse(level1Payload) }],
      () => createEditorialAnalysis(pool, topic, 1, directorRow.id)
    );
    ok(a1.analysis_level === 1, 'nivel 1: analysis_level = 1');
    ok(a1.que_paso && a1.que_paso.resumen && a1.para_el_ciudadano, 'nivel 1 trae que_paso + para_el_ciudadano');
    ok(a1.por_que_importa == null && a1.contexto == null && a1.datos == null, 'nivel 1 NO rellena campos de niveles superiores');
    ok(a1.conversacion === null, 'conversacion siempre null (nunca se inventa aquí)');
    ok(typeof a1.model === 'string' && typeof a1.tokens_used === 'number', 'trazabilidad de modelo/tokens persistida');

    const level2Payload = JSON.stringify({
      que_paso: { resumen: 'r', hechos: ['h'] },
      por_que_importa: 'Afecta el suministro de agua de varias colonias.',
      contexto: 'Es la segunda vez este mes que ocurre un corte programado.',
      para_el_ciudadano: 'Junta agua con anticipación.',
      relevancia_perote: 'Recurrente en la temporada seca de Perote.',
    });
    const a2 = await withMockedFetch(
      [{ match: 'inference-api.nousresearch.com', response: chatCompletionResponse(level2Payload) }],
      () => createEditorialAnalysis(pool, topic, 2, directorRow.id)
    );
    ok(a2.analysis_level === 2 && a2.contexto && a2.relevancia_perote, 'nivel 2 trae contexto + relevancia_perote');
    ok(a2.datos == null && a2.implicaciones == null, 'nivel 2 NO rellena campos exclusivos de nivel 3');

    const level3Payload = JSON.stringify({
      que_paso: { resumen: 'r', hechos: ['h1', 'h2'] },
      por_que_importa: 'importa',
      contexto: 'contexto amplio',
      datos: [{ label: 'Colonias afectadas', value: '4', source: 'CMAS' }],
      implicaciones: ['Podría repetirse el próximo mes'],
      pendientes: 'Falta confirmar hora exacta de restablecimiento',
      para_el_ciudadano: 'Junta agua con anticipación',
      relevancia_perote: 'Recurrente en Perote',
    });
    const a3 = await withMockedFetch(
      [{ match: 'inference-api.nousresearch.com', response: chatCompletionResponse(level3Payload) }],
      () => createEditorialAnalysis(pool, topic, 3, directorRow.id)
    );
    ok(a3.analysis_level === 3, 'nivel 3: analysis_level = 3');
    ok(Array.isArray(a3.datos) && a3.datos.length === 1, 'nivel 3 trae datos');
    ok(Array.isArray(a3.implicaciones) && a3.implicaciones.length === 1, 'nivel 3 trae implicaciones');
    ok(a3.pendientes, 'nivel 3 trae pendientes');
    ok(a3.conversacion === null, 'nivel 3 tampoco inventa conversacion (regla no negociable)');

    // --- H_INCOMPLETE: salida incompleta del modelo → rechaza, no persiste a medias ---
    const beforeIncomplete = Number((await pool.query('SELECT count(*)::int AS n FROM editorial_analyses WHERE topic_id = $1', [topicId])).rows[0].n);
    const incompletePayload = JSON.stringify({ que_paso: { resumen: 'r', hechos: [] } }); // falta para_el_ciudadano (nivel 1)
    let incompleteThrew = false;
    let incompleteCode = null;
    try {
      await withMockedFetch(
        [{ match: 'inference-api.nousresearch.com', response: chatCompletionResponse(incompletePayload) }],
        () => createEditorialAnalysis(pool, topic, 1, directorRow.id)
      );
    } catch (err) {
      incompleteThrew = true;
      incompleteCode = err.code;
    }
    ok(incompleteThrew && incompleteCode === 'incomplete_analysis', 'salida incompleta lanza con code incomplete_analysis');
    const afterIncomplete = Number((await pool.query('SELECT count(*)::int AS n FROM editorial_analyses WHERE topic_id = $1', [topicId])).rows[0].n);
    ok(afterIncomplete === beforeIncomplete, 'una salida incompleta NO agrega fila a editorial_analyses');

    // --- H_HISTORY: GET /analysis trae los 3 análisis completos, más reciente primero ---
    const history = await (await fetch(`${BASE}/api/listening/topics/${topicId}/analysis`, { headers: { Authorization: 'Bearer ' + director } })).json();
    ok(history.length === 3, `GET /analysis trae los 3 análisis completos (fueron ${history.length})`);
    ok(history[0].analysis_level === 3 && history[1].analysis_level === 2 && history[2].analysis_level === 1, 'ordenado por created_at DESC (más reciente primero)');
    ok((await fetch(`${BASE}/api/listening/topics/${topicId}/analysis`)).status === 401, 'GET /analysis sin token → 401');

    console.log(`\n✔ check-editorial-engine pasó (${n} asserts).`);
  } finally {
    if (topicId) {
      await pool.query('DELETE FROM editorial_analyses WHERE topic_id = $1', [topicId]).catch(() => {});
      await pool.query('DELETE FROM topics WHERE id = $1', [topicId]).catch(() => {});
    }
    await stopApi(server);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✘ check-editorial-engine falló:', err.message);
  process.exit(1);
});
