#!/usr/bin/env node
// Check ejecutable del newsletter "Buenos días, Perote".
// Uso: node scripts/check-newsletter.js   (requiere Postgres arriba)
//
// NO envía correo ni gasta en IA: ejercita los GUARD de rol y validación de
// generate/pending/preview/send, y el render del template (/preview no hace
// llamadas externas). En /send se manda un body inválido a propósito para que
// buildContent() lance 400 ANTES de tocar Resend — así probamos el guard del
// endpoint irreversible sin disparar un broadcast real.
// Brechas conocidas (cuestan/mockean): happy-path de /generate (Perplexity+Claude),
// envío real de /send (Resend) y la lógica de solapamiento del cron (necesita
// inyección de dependencias en newsletter-cron.js).
const assert = require('node:assert');
const { runMigrate, runSeed, startApi, stopApi, waitForHealth, login: loginAt, postJson } = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3996;
const BASE = `http://localhost:${PORT}`;
const DIRECTOR = 'director@crearcontenidos.com';
const PRODUCCION = 'carlos.mendoza@crearcontenidos.com';
const COLABORADOR = 'marisol.hidalgo@crearcontenidos.com';

const VALID_CONTENT = {
  weekday: 'lunes', date: '7 de julio',
  clima: 'Soleado, 22°',
  notaDelDia: { titulo: 'Nota de prueba', cuerpo: 'Cuerpo de prueba para el render.' },
  enBreve: ['Uno', 'Dos'], datoDelDia: 'Dato', agenda: 'Agenda', patrocinador: null,
};

function login(email) {
  return loginAt(BASE, email);
}

function post(pathname, token, body) {
  return postJson(BASE, pathname, token, body);
}

async function main() {
  runMigrate();
  runSeed();

  const server = startApi({ port: PORT, stdio: 'inherit' });

  try {
    await waitForHealth(BASE);
    const director = await login(DIRECTOR);
    const produccion = await login(PRODUCCION);
    const colaborador = await login(COLABORADOR);

    let n = 0;
    const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

    // --- /generate: requireRole('director','produccion') — no probamos happy-path (IA). ---
    ok((await post('/api/newsletter/generate', null, {})).status === 401, 'generate sin token → 401');
    ok((await post('/api/newsletter/generate', colaborador, {})).status === 403, 'generate colaborador → 403');

    // --- /pending: role gate + responde JSON (null o content). ---
    ok((await fetch(`${BASE}/api/newsletter/pending`)).status === 401, 'pending sin token → 401');
    const pend = await fetch(`${BASE}/api/newsletter/pending`, { headers: { Authorization: 'Bearer ' + produccion } });
    ok(pend.status === 200, 'pending con rol válido → 200');

    // --- /preview: happy-path real (arma HTML, sin llamadas externas). ---
    const badPreview = await post('/api/newsletter/preview', director, { weekday: 'lunes' }); // falta clima/notaDelDia
    ok(badPreview.status === 400, 'preview body incompleto → 400');
    const goodPreview = await post('/api/newsletter/preview', director, VALID_CONTENT);
    ok(goodPreview.status === 200, 'preview body válido → 200');
    const previewBody = await goodPreview.json();
    ok(typeof previewBody.html === 'string' && previewBody.html.includes('Nota de prueba'), 'preview devuelve HTML con la nota');

    // --- /send: SOLO director; envío irreversible. Probamos guards sin enviar:
    //     rol incorrecto → 403; director con body inválido → 400 (buildContent corta antes de Resend). ---
    ok((await post('/api/newsletter/send', colaborador, VALID_CONTENT)).status === 403, 'send colaborador → 403');
    ok((await post('/api/newsletter/send', produccion, VALID_CONTENT)).status === 403, 'send produccion → 403 (solo director)');
    ok((await post('/api/newsletter/send', director, { weekday: 'lunes' })).status === 400, 'send director con body inválido → 400 (no llega a Resend)');

    // --- /settings: lectura role-gated. ---
    const settings = await fetch(`${BASE}/api/newsletter/settings`, { headers: { Authorization: 'Bearer ' + director } });
    ok(settings.status === 200, 'settings director → 200');

    console.log(`\n✔ check-newsletter pasó (${n} asserts). Brechas conocidas: happy-path IA/Resend y solapamiento de cron (ver cabecera).`);
  } finally {
    await stopApi(server);
  }
}

main().catch((err) => {
  console.error('\n✘ check-newsletter falló:', err.message);
  process.exit(1);
});
