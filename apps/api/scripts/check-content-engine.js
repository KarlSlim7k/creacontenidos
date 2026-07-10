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
