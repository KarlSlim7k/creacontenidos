#!/usr/bin/env node
// Check ejecutable del newsletter "Buenos días, Perote".
// Uso: node scripts/check-newsletter.js   (requiere Postgres arriba)
//
// NO envía correo ni gasta en IA: ejercita los GUARD de rol y validación de
// generate/pending/preview/send, y el render del template (/preview no hace
// llamadas externas). En /send se manda un body inválido a propósito para que
// buildContent() lance 400 ANTES de tocar Resend — así probamos el guard del
// endpoint irreversible sin disparar un broadcast real.
//
// R2-35: generateContent()/replaceEditionItems() (lib/newsletter-content.js)
// SÍ se prueban con happy-path real, llamados DIRECTO en este proceso con
// withMockedFetch() (R2-02) — igual que H_AI_HAPPY_PATH en check-listening.js:
// POST /generate va al server como proceso separado (spawn), mockear fetch
// acá no llegaría ahí. Cierra la brecha "happy-path de /generate" que este
// archivo documentaba desde antes de esta fase para el camino SIN selección
// (no para /generate por HTTP, que sigue sin cobertura de happy-path).
//
// Brechas conocidas que siguen abiertas: envío real de /send (Resend) y la
// lógica de solapamiento del cron (necesita inyección de dependencias en
// newsletter-cron.js).
const assert = require('node:assert');
const {
  runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth,
  login: loginAt, postJson, patchJson, withMockedFetch, chatCompletionResponse,
} = require('./lib/check-helpers');

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

// wttr.in (weather-client.js) — forma mínima que getPeroteClima() necesita.
function wttrMock() {
  return {
    ok: true, status: 200,
    json: async () => ({
      current_condition: [{ temp_C: '18', precipMM: '0', lang_es: [{ value: 'despejado' }], weatherDesc: [{ value: 'Clear' }] }],
      weather: [{ maxtempC: '24', mintempC: '10' }],
    }),
  };
}

const EDITORIAL_PAYLOAD = JSON.stringify({
  notaDelDia: { titulo: '[check] Nota generada', cuerpo: 'Cuerpo generado por el stub de IA.' },
  enBreve: ['Breve uno', 'Breve dos'],
  datoDelDia: 'Dato de prueba',
});

const MOCK_ROUTES = [
  { match: 'wttr.in', response: wttrMock() },
  { match: 'inference-api.nousresearch.com', response: chatCompletionResponse(EDITORIAL_PAYLOAD) },
];

function login(email) {
  return loginAt(BASE, email);
}

function post(pathname, token, body) {
  return postJson(BASE, pathname, token, body);
}

function patch(pathname, token, body) {
  return patchJson(BASE, pathname, token, body);
}

async function main() {
  runMigrate();
  runSeed();

  const pool = createPool();
  const server = startApi({ port: PORT, stdio: 'inherit' });
  const cleanupTopicIds = [];
  const cleanupAnalysisIds = [];
  let cleanupEditionId = null;

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

    // --- /send: director o producción; envío irreversible. Probamos guards sin enviar:
    //     rol incorrecto → 403; body válido sin edición pendiente hoy → 409 (claim atómico
    //     corta antes de Resend); director con body inválido → 400. ---
    ok((await post('/api/newsletter/send', colaborador, VALID_CONTENT)).status === 403, 'send colaborador → 403 (rol sin acceso)');
    ok((await post('/api/newsletter/send', produccion, VALID_CONTENT)).status === 409, 'send produccion → 409 (sin edición pendiente hoy, no llega a Resend)');
    ok((await post('/api/newsletter/send', director, { weekday: 'lunes' })).status === 400, 'send director con body inválido → 400 (no llega a Resend)');

    // --- /pending (PATCH): guarda ediciones sin enviar. Rol incorrecto → 403;
    //     body válido sin edición pendiente hoy → 409 (mismo guard que /send). ---
    ok((await patch('/api/newsletter/pending', colaborador, VALID_CONTENT)).status === 403, 'save pending colaborador → 403');
    ok((await patch('/api/newsletter/pending', produccion, VALID_CONTENT)).status === 409, 'save pending produccion → 409 (sin edición pendiente hoy)');

    // --- /settings: lectura role-gated. ---
    const settings = await fetch(`${BASE}/api/newsletter/settings`, { headers: { Authorization: 'Bearer ' + director } });
    ok(settings.status === 200, 'settings director → 200');

    // --- H_NO_SELECTION_REGRESSION (R2-31/R2-35): sin selección, generateContent()
    //     produce exactamente lo de antes de esta fase — no solo "a ojo". ---
    const { generateContent, replaceEditionItems } = require('../src/lib/newsletter-content');

    const { rows: [topicHigh] } = await pool.query(
      `INSERT INTO topics (title, source, confidence, mentions, verification_status, detected_at)
       VALUES ($1, 'Web Search', 90, 1, 'checking', now()) RETURNING id, title`,
      [`[check] legacy alta confianza ${Date.now()}`]
    );
    const { rows: [topicLow] } = await pool.query(
      `INSERT INTO topics (title, source, confidence, mentions, verification_status, detected_at)
       VALUES ($1, 'Web Search', 60, 100, 'checking', now()) RETURNING id, title`,
      [`[check] legacy baja confianza ${Date.now()}`]
    );
    const { rows: [topicRisk] } = await pool.query(
      `INSERT INTO topics (title, source, confidence, mentions, verification_status, detected_at)
       VALUES ($1, 'Web Search', 99, 999, 'risk', now()) RETURNING id, title`,
      [`[check] legacy risk ${Date.now()}`]
    );
    cleanupTopicIds.push(topicHigh.id, topicLow.id, topicRisk.id);

    const legacyCalls = [];
    const legacy = await withMockedFetch(MOCK_ROUTES, async (calls) => {
      const result = await generateContent(); // sin argumento — camino legacy
      legacyCalls.push(...calls);
      return result;
    });
    ok(Array.isArray(legacy.selectionItems) && legacy.selectionItems.length === 0, 'sin selección: selectionItems vacío, nada que trazar');
    ok(legacy.content.paraEntender === null, 'sin selección: paraEntender queda null (no hay selección de la que salir)');
    const legacyShape = Object.keys(legacy.content).sort().join(',');
    const expectedShape = ['agenda', 'clima', 'date', 'datoDelDia', 'enBreve', 'guionPodcast', 'notaDelDia', 'paraEntender', 'patrocinador', 'topicsUsed', 'weekday'].sort().join(',');
    ok(legacyShape === expectedShape, `forma de content sin cambios respecto a antes de la fase, +paraEntender aditivo (fue: ${legacyShape})`);
    const legacyAiCall = legacyCalls.find((c) => c.url.includes('nousresearch.com'));
    const legacyPrompt = legacyAiCall.body.messages[1].content;
    ok(legacyPrompt.includes(topicHigh.title), 'camino legacy: el prompt de IA incluye el topic de mayor confidence (ORDER BY sin tocar)');
    ok(!legacyPrompt.includes(topicRisk.title), 'camino legacy: el prompt de IA nunca incluye un topic risk');

    // --- H_SELECTION (R2-31/R2-32/R2-34): selección explícita, sección, PARA ENTENDER ---
    const { rows: [topicSel] } = await pool.query(
      `INSERT INTO topics (title, source, confidence, verification_status, detected_at)
       VALUES ($1, 'Web Search', 80, 'verified', now()) RETURNING id, title`,
      [`[check] seleccionado ${Date.now()}`]
    );
    cleanupTopicIds.push(topicSel.id);
    const { rows: [analysis] } = await pool.query(
      `INSERT INTO editorial_analyses (topic_id, analysis_level, contexto, por_que_importa, implicaciones, para_el_ciudadano)
       VALUES ($1, 3, 'Contexto de prueba', 'Importa porque es una prueba', '["Implicación de prueba"]'::jsonb, 'Haz esto si te afecta')
       RETURNING id`,
      [topicSel.id]
    );
    cleanupAnalysisIds.push(analysis.id);

    const selection = [
      { topic_id: topicSel.id, section: 'PEROTE', analysis_id: analysis.id },
      { topic_id: topicRisk.id, section: 'MUNDO' }, // debe filtrarse: sigue siendo risk aunque lo elijan a mano
    ];
    const selCalls = [];
    const withSel = await withMockedFetch(MOCK_ROUTES, async (calls) => {
      const result = await generateContent(selection);
      selCalls.push(...calls);
      return result;
    });
    ok(withSel.selectionItems.length === 1, `la selección filtra el topic risk elegido a mano, queda 1 (fueron ${withSel.selectionItems.length})`);
    ok(withSel.selectionItems[0].topic_id === topicSel.id && withSel.selectionItems[0].section === 'PEROTE', 'el item trazado tiene el topic y la sección exactos de la selección');
    ok(withSel.selectionItems[0].analysis_id === analysis.id, 'el item trazado referencia el analysis_id elegido a propósito');
    ok(withSel.content.paraEntender && withSel.content.paraEntender.titulo === topicSel.title, 'PARA ENTENDER se llena con el análisis nivel 3 elegido a propósito');
    ok(withSel.content.paraEntender.cuerpo.includes('Implicación de prueba'), 'PARA ENTENDER compone el texto desde los campos ya sintetizados del análisis');
    const selAiCall = selCalls.find((c) => c.url.includes('nousresearch.com'));
    const selPrompt = selAiCall.body.messages[1].content;
    ok(selPrompt.includes(topicSel.title), 'con selección: el prompt de IA usa exactamente el tema elegido');
    ok(!selPrompt.includes(topicRisk.title) && !selPrompt.includes(topicLow.title) && !selPrompt.includes(topicHigh.title),
      'con selección: el prompt de IA NO incluye temas fuera de la selección (ni siquiera los de mayor confidence)');

    // --- H_TRACEABILITY (R2-30): replaceEditionItems() persiste y limpia bien ---
    const { rows: [fakeEdition] } = await pool.query(
      `INSERT INTO newsletter_editions (edition_date, weekday, date_label, content, status)
       VALUES (CURRENT_DATE + interval '1 day', 'x', 'x', '{}'::jsonb, 'pendiente') RETURNING id`
    );
    cleanupEditionId = fakeEdition.id;
    await replaceEditionItems(fakeEdition.id, withSel.selectionItems);
    const { rows: items } = await pool.query(
      'SELECT topic_id, section, analysis_id, position FROM newsletter_edition_items WHERE edition_id = $1 ORDER BY position',
      [fakeEdition.id]
    );
    ok(items.length === 1 && items[0].topic_id === topicSel.id && items[0].section === 'PEROTE' && items[0].analysis_id === analysis.id,
      'replaceEditionItems persiste topic_id/section/analysis_id correctos');
    await replaceEditionItems(fakeEdition.id, []); // idempotencia: regenerar sin selección limpia, no acumula
    const { rows: [afterClear] } = await pool.query('SELECT count(*)::int AS n FROM newsletter_edition_items WHERE edition_id = $1', [fakeEdition.id]);
    ok(afterClear.n === 0, 'replaceEditionItems([]) limpia sin dejar filas huérfanas (regenerar no acumula trazabilidad vieja)');

    console.log(`\n✔ check-newsletter pasó (${n} asserts). Brecha conocida: /generate por HTTP sigue sin happy-path (necesitaría mockear fetch dentro del proceso del server) — el camino que sí importa probar (generateContent()/replaceEditionItems()) está cubierto directo.`);
  } finally {
    if (cleanupEditionId) await pool.query('DELETE FROM newsletter_edition_items WHERE edition_id = $1', [cleanupEditionId]).catch(() => {});
    if (cleanupEditionId) await pool.query('DELETE FROM newsletter_editions WHERE id = $1', [cleanupEditionId]).catch(() => {});
    if (cleanupAnalysisIds.length) await pool.query('DELETE FROM editorial_analyses WHERE id = ANY($1::int[])', [cleanupAnalysisIds]).catch(() => {});
    if (cleanupTopicIds.length) await pool.query('DELETE FROM topics WHERE id = ANY($1::int[])', [cleanupTopicIds]).catch(() => {});
    await stopApi(server);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✘ check-newsletter falló:', err.message);
  process.exit(1);
});
