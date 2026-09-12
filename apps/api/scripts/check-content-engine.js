#!/usr/bin/env node
// Check ejecutable del motor de contenido IA (content-engine).
// Uso: node scripts/check-content-engine.js   (requiere Postgres arriba)
//
// NO gasta en APIs de pago: solo ejercita los GUARD (auth, rol, validación,
// status 409) que cortocircuitan ANTES de llamar a OpenRouter/Claude/Perplexity,
// más el rate limit (H6) y la limpieza de imágenes huérfanas (H7, a nivel SQL).
// El happy-path de generación real (que sí cuesta) queda como brecha conocida:
// requiere mockear fetch/ai-client y está fuera de alcance de este check barato.
const assert = require('node:assert');
const { runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth, login: loginAt, postJson } = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3997;
const BASE = `http://localhost:${PORT}`;
const DIRECTOR = 'director@crearcontenidos.com';
const PRODUCCION = 'carlos.mendoza@crearcontenidos.com';
const COLABORADOR = 'marisol.hidalgo@crearcontenidos.com';
const RL_USER = 'ana.torres@crearcontenidos.com'; // produccion, aislado para el test de rate limit

function login(email) {
  return loginAt(BASE, email);
}

function post(pathname, token, body) {
  return postJson(BASE, pathname, token, body);
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
    const rlToken = await login(RL_USER);

    const { rows: borradorRows } = await pool.query("SELECT id FROM content_proposals WHERE status = 'borrador' LIMIT 1");
    const { rows: otherRows } = await pool.query("SELECT id FROM content_proposals WHERE status <> 'borrador' LIMIT 1");
    assert.ok(borradorRows[0], 'el seed debe traer al menos una propuesta en borrador');
    assert.ok(otherRows[0], 'el seed debe traer al menos una propuesta no-borrador');
    const borradorId = borradorRows[0].id;
    const nonBorradorId = otherRows[0].id;

    let n = 0;
    const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

    // --- generate-proposal: requireRole('director','produccion') ---
    ok((await post('/api/content/generate-proposal', null, { topic_id: 1 })).status === 401, 'gen-proposal sin token → 401');
    ok((await post('/api/content/generate-proposal', colaborador, { topic_id: 1 })).status === 403, 'gen-proposal colaborador → 403 (H1: sin rol no pasa)');
    ok((await post('/api/content/generate-proposal', director, {})).status === 400, 'gen-proposal sin topic_id → 400');
    ok((await post('/api/content/generate-proposal', director, { topic_id: 999999 })).status === 404, 'gen-proposal topic inexistente → 404');

    // --- generate-draft: requireAuth + status 'borrador' ---
    ok((await post('/api/content/generate-draft', null, { proposal_id: borradorId })).status === 401, 'gen-draft sin token → 401');
    ok((await post('/api/content/generate-draft', director, {})).status === 400, 'gen-draft sin proposal_id → 400');
    ok((await post('/api/content/generate-draft', director, { proposal_id: 999999 })).status === 404, 'gen-draft propuesta inexistente → 404');
    ok((await post('/api/content/generate-draft', director, { proposal_id: nonBorradorId })).status === 409, 'gen-draft status ≠ borrador → 409');

    // --- generate-image: requireAuth + prompt + status 'borrador' ---
    ok((await post('/api/content/generate-image', null, { proposal_id: borradorId, prompt: 'x' })).status === 401, 'gen-image sin token → 401');
    ok((await post('/api/content/generate-image', director, { proposal_id: borradorId })).status === 400, 'gen-image sin prompt → 400');
    ok((await post('/api/content/generate-image', director, { proposal_id: 999999, prompt: 'x' })).status === 404, 'gen-image propuesta inexistente → 404');
    ok((await post('/api/content/generate-image', director, { proposal_id: nonBorradorId, prompt: 'x' })).status === 409, 'gen-image status ≠ borrador → 409');

    // --- qa-check: requireAuth + body presente ---
    ok((await post('/api/content/qa-check', null, { proposal_id: borradorId })).status === 401, 'qa-check sin token → 401');
    ok((await post('/api/content/qa-check', director, {})).status === 400, 'qa-check sin proposal_id → 400');
    ok((await post('/api/content/qa-check', director, { proposal_id: 999999 })).status === 404, 'qa-check propuesta inexistente → 404');

    // --- H6: rate limit por usuario (30/15min). El limiter cuenta también los 400,
    //     así que disparamos requests inválidos y verificamos que el nº 31 → 429. ---
    let got429 = false;
    for (let i = 0; i < 31; i++) {
      const r = await post('/api/content/generate-image', rlToken, {}); // 400 por falta de proposal_id, pero cuenta
      if (r.status === 429) { got429 = true; break; }
    }
    ok(got429, 'H6: el request nº 31 en 15min → 429 (rate limit por usuario)');

    // --- H7: al regenerar portada se borran las imágenes previas del mismo proposal_id.
    //     Se prueba a nivel SQL (misma secuencia DELETE+INSERT del handler) para no gastar en IA. ---
    const buf = Buffer.from('fake');
    await pool.query('INSERT INTO generated_images (proposal_id, prompt, mime_type, data) VALUES ($1,$2,$3,$4),($1,$2,$3,$4)', [borradorId, 'vieja', 'image/png', buf]);
    await pool.query('DELETE FROM generated_images WHERE proposal_id = $1', [borradorId]); // <- lo nuevo del handler
    await pool.query('INSERT INTO generated_images (proposal_id, prompt, mime_type, data) VALUES ($1,$2,$3,$4)', [borradorId, 'nueva', 'image/png', buf]);
    const { rows: imgCount } = await pool.query('SELECT count(*)::int AS c FROM generated_images WHERE proposal_id = $1', [borradorId]);
    ok(imgCount[0].c === 1, 'H7: tras regenerar solo queda 1 imagen (no se acumulan huérfanas)');
    await pool.query('DELETE FROM generated_images WHERE proposal_id = $1', [borradorId]); // limpiar

    // --- R2-37/R2-38 (fase 6): POST/GET /api/content/renders. No llama IA (es
    // lib/renders/ puro sobre datos ya en DB) — cabe en este check sin costo. ---
    let renderTopicId, renderProposalId, oldAnalysisId;
    try {
      const { rows: [topic] } = await pool.query(
        `INSERT INTO topics (title) VALUES ('[check] tema para renders') RETURNING id`
      );
      renderTopicId = topic.id;
      const { rows: [proposal] } = await pool.query(
        `INSERT INTO content_proposals (topic_id, format, title, dek, status) VALUES ($1, 'nota', '[check] nota para renders', 'dek de prueba', 'borrador') RETURNING id`,
        [renderTopicId]
      );
      renderProposalId = proposal.id;

      // Guards: auth, campos, canal inválido, propuesta inexistente.
      ok((await post('/api/content/renders', null, { proposal_id: renderProposalId, channel: 'web' })).status === 401, 'renders sin token → 401');
      ok((await post('/api/content/renders', director, { channel: 'web' })).status === 400, 'renders sin proposal_id → 400');
      ok((await post('/api/content/renders', director, { proposal_id: renderProposalId, channel: 'fax' })).status === 400, 'renders canal inválido → 400');
      ok((await post('/api/content/renders', director, { proposal_id: 999999, channel: 'web' })).status === 404, 'renders propuesta inexistente → 404');
      const noAuthGet = await fetch(`${BASE}/api/content/renders?proposal_id=${renderProposalId}`);
      ok(noAuthGet.status === 401, 'GET renders sin token → 401');

      // Sin análisis todavía: el render cae al fallback (proposal.title/dek).
      const webRes = await post('/api/content/renders', director, { proposal_id: renderProposalId, channel: 'web' });
      ok(webRes.status === 201, `POST renders web → 201 (recibido ${webRes.status})`);
      const webRender = await webRes.json();
      ok(webRender.content.title === '[check] tema para renders', 'render web usa el título del topic');
      ok(webRender.analysis_id === null, 'sin análisis previo, el render queda sin analysis_id');

      const listNoAnalysis = await (await fetch(`${BASE}/api/content/renders?proposal_id=${renderProposalId}`, { headers: { Authorization: 'Bearer ' + director } })).json();
      ok(listNoAnalysis.length === 1 && listNoAnalysis[0].channel === 'web', 'GET renders lista el único canal generado hasta ahora');
      ok(listNoAnalysis[0].stale === false, 'sin análisis en el tema, el render no puede estar desactualizado');

      // Con un análisis (vigente al momento del render): analysis_id queda fijado.
      const { rows: [oldAnalysis] } = await pool.query(
        `INSERT INTO editorial_analyses (topic_id, analysis_level, que_paso, por_que_importa, created_at)
         VALUES ($1, 2, '{"resumen":"Resumen del análisis","hechos":[]}'::jsonb, 'Por qué importa', now() - interval '1 hour')
         RETURNING id`,
        [renderTopicId]
      );
      oldAnalysisId = oldAnalysis.id;
      const waRes = await post('/api/content/renders', director, { proposal_id: renderProposalId, channel: 'whatsapp' });
      ok(waRes.status === 201, 'POST renders whatsapp → 201');
      const waRender = await waRes.json();
      ok(waRender.analysis_id === oldAnalysisId, 'render whatsapp queda con el analysis_id vigente');
      ok(typeof waRender.content === 'string' && waRender.content.includes('Resumen del análisis'), 'render whatsapp usa el resumen del análisis');

      // R2-37: un análisis MÁS NUEVO deja el render anterior "desactualizado" — se
      // calcula al leer (GET), no hay columna aparte que lo marque.
      await pool.query(
        `INSERT INTO editorial_analyses (topic_id, analysis_level, que_paso, por_que_importa, created_at)
         VALUES ($1, 2, '{"resumen":"Resumen nuevo","hechos":[]}'::jsonb, 'Por qué importa (v2)', now())`,
        [renderTopicId]
      );
      const listStale = await (await fetch(`${BASE}/api/content/renders?proposal_id=${renderProposalId}`, { headers: { Authorization: 'Bearer ' + director } })).json();
      const waListed = listStale.find((r) => r.channel === 'whatsapp');
      ok(waListed && waListed.stale === true, 'R2-37: render generado antes del análisis nuevo queda stale=true');

      // Regenerar (R2-38, clic humano explícito) toma el análisis vigente y deja de estar stale.
      const waRegen = await (await post('/api/content/renders', director, { proposal_id: renderProposalId, channel: 'whatsapp' })).json();
      ok(waRegen.analysis_id !== oldAnalysisId, 'al regenerar, el render toma el análisis más nuevo');
      const listFresh = await (await fetch(`${BASE}/api/content/renders?proposal_id=${renderProposalId}`, { headers: { Authorization: 'Bearer ' + director } })).json();
      const waFresh = listFresh.find((r) => r.channel === 'whatsapp');
      ok(waFresh && waFresh.stale === false, 'tras regenerar, el render deja de estar desactualizado');
    } finally {
      if (renderProposalId) await pool.query('DELETE FROM content_renders WHERE proposal_id = $1', [renderProposalId]);
      if (renderProposalId) await pool.query('DELETE FROM content_proposals WHERE id = $1', [renderProposalId]);
      if (renderTopicId) await pool.query('DELETE FROM editorial_analyses WHERE topic_id = $1', [renderTopicId]);
      if (renderTopicId) await pool.query('DELETE FROM topics WHERE id = $1', [renderTopicId]);
    }

    console.log(`\n✔ check-content-engine pasó (${n} asserts). Brecha conocida: happy-path de IA no cubierto (requiere mock de fetch).`);
  } finally {
    await stopApi(server);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✘ check-content-engine falló:', err.message);
  process.exit(1);
});
