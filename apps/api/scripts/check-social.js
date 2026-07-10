#!/usr/bin/env node
// Check ejecutable de Producciones CREA (social_posts + oEmbed).
// Uso: node scripts/check-social.js   (requiere Postgres arriba)
// Verifica: GET /api/public/social devuelve posts seed; POST /api/admin/social con
// URL inválida → 400; POST con URL TikTok real → 201 + fila; el endpoint on-demand
// de embed responde (no exige 200 de TikTok, sólo que el endpoint no truene).
// Limpia las filas creadas por el check para dejar el estado como estaba.
const assert = require('node:assert');
const { runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth, login: loginAt } = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3999;
const BASE = `http://localhost:${PORT}`;
const SAMPLE_URL = 'https://www.tiktok.com/@scout2015/video/6718335390845095173';

function login(email) {
  return loginAt(BASE, email);
}

async function main() {
  runMigrate();
  runSeed();

  const pool = createPool();
  const server = startApi({ port: PORT, stdio: 'inherit' });

  try {
    await waitForHealth(BASE);
    const directorToken = await login('director@crearcontenidos.com');

    // 1) GET público: el feed trae los 4 seeds (oEmbed puede o no estar resuelto).
    const publicRes = await fetch(`${BASE}/api/public/social?network=tiktok`);
    assert.strictEqual(publicRes.status, 200);
    const publicPosts = await publicRes.json();
    assert.ok(publicPosts.length >= 1, 'se esperaba al menos 1 post de muestra');

    // 2) GET admin: requiere auth.
    const noAuth = await fetch(`${BASE}/api/admin/social`);
    assert.strictEqual(noAuth.status, 401);
    const adminRes = await fetch(`${BASE}/api/admin/social`, { headers: { Authorization: 'Bearer ' + directorToken } });
    assert.strictEqual(adminRes.status, 200);

    // 3) POST con URL basura → 400.
    const badRes = await fetch(`${BASE}/api/admin/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + directorToken },
      body: JSON.stringify({ external_url: 'no es url' }),
    });
    assert.strictEqual(badRes.status, 400);

    // 4) POST con URL no reconocida → 400.
    const unknown = await fetch(`${BASE}/api/admin/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + directorToken },
      body: JSON.stringify({ external_url: 'https://example.com/video/123' }),
    });
    assert.strictEqual(unknown.status, 400);

    // 5) POST con URL TikTok real → 201 (oEmbed puede responder 200 o tirar 502;
    //    el endpoint SIEMPRE devuelve 201 si la URL es válida, aunque oEmbed falle —
    //    el post queda como borrador, lo cual también es comportamiento esperado).
    const created = await fetch(`${BASE}/api/admin/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + directorToken },
      body: JSON.stringify({ external_url: SAMPLE_URL, position: 99 }),
    });
    const createdBody = await created.json();
    assert.ok(created.status === 201, 'POST /api/admin/social esperaba 201, dio ' + created.status);
    assert.strictEqual(createdBody.network, 'tiktok');
    assert.ok(createdBody.id, 'falta id en respuesta');
    const createdId = createdBody.id;

    // 6) Embed on-demand responde (puede ser 200 con embed_html, o 200 con fallback).
    const embedRes = await fetch(`${BASE}/api/public/social/` + createdId + '/embed');
    const embedBody = await embedRes.json();
    assert.strictEqual(embedRes.status, 200);
    assert.ok('embed_html' in embedBody, 'falta embed_html en respuesta');

    // 7) PATCH toggle publicado.
    const patchRes = await fetch(`${BASE}/api/admin/social/` + createdId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + directorToken },
      body: JSON.stringify({ is_published: false }),
    });
    assert.strictEqual(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.strictEqual(patched.is_published, false);

    // 8) Conflicto por URL duplicada.
    const dup = await fetch(`${BASE}/api/admin/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + directorToken },
      body: JSON.stringify({ external_url: SAMPLE_URL }),
    });
    assert.strictEqual(dup.status, 409, 'duplicado esperaba 409, dio ' + dup.status);

    // 9) DELETE director: borra la fila del check.
    const del = await fetch(`${BASE}/api/admin/social/` + createdId, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + directorToken },
    });
    assert.strictEqual(del.status, 204);

    // 10) Después del delete, el embed endpoint debe dar 404.
    const embedAfter = await fetch(`${BASE}/api/public/social/` + createdId + '/embed');
    assert.strictEqual(embedAfter.status, 404);

    console.log('\n✔ check-social pasó (10/10).');
  } finally {
    await stopApi(server);
    // Cleanup incondicional: si un assert falla entre el POST (paso 5) y el
    // DELETE (paso 9), la fila quedaba viva y todas las corridas siguientes
    // morían en el paso 5 con 409 por URL duplicada.
    await pool.query('DELETE FROM social_posts WHERE external_url = $1', [SAMPLE_URL]).catch(() => {});
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✘ check-social falló:', err.message);
  process.exit(1);
});
