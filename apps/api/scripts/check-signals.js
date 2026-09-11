#!/usr/bin/env node
// Check ejecutable de la ingesta de señales externas (RADAR 2.0, R2-12/R2-16).
// NO gasta en APIs de pago: POST /api/signals no llama a ningún proveedor de
// IA (la verificación ya viene en el payload, por contrato). Cubre los 6
// casos de docs/implementaciones/radar2/02-api-senales-externas.md
// ("Verificación"): inserted, duplicate (por id y por similitud), upgraded,
// rejected (validación), 401 (sin key / revocada), y que trust=high del
// proveedor nunca produce verified automático.
const assert = require('node:assert');
const {
  runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth,
  login: loginAt, postJson, patchJson,
} = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3993;
const BASE = `http://localhost:${PORT}`;
const DIRECTOR = 'director@crearcontenidos.com';

function login(email) { return loginAt(BASE, email); }
function post(pathname, token, body) { return postJson(BASE, pathname, token, body); }
function patch(pathname, token, body) { return patchJson(BASE, pathname, token, body); }

function sendSignal(apiKey, body) {
  return fetch(`${BASE}/api/signals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
  });
}

function baseSignal(overrides = {}) {
  return {
    schemaVersion: '1.0',
    provider: 'check-provider',
    botRunId: null,
    sourceId: null,
    accessStatus: 'ok',
    signal: {
      signalId: `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `[check] Corte de agua en la colonia Reforma ${Date.now()}`,
      description: null,
      detectedAt: new Date().toISOString(),
      eventDate: null,
      locality: 'Perote',
      territorialScope: 'local',
      category: 'servicios_publicos',
      source: { name: 'CMAS check', url: 'https://cmas-check.example.mx/comunicado' },
      sourceType: 'primary',
      factualSummary: 'CMAS confirmó el corte de agua vía comunicado oficial (fixture de check).',
      confidence: 80,
      corroboratingSources: [],
      potentialRelevance: 'Fixture de check-signals.js',
      commentsAvailable: false,
      mediaAvailable: false,
      verificationStatus: 'checking',
      ...overrides.signal,
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'signal')),
  };
}

async function main() {
  let n = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

  runMigrate();
  runSeed();

  const pool = createPool();
  const server = startApi({ port: PORT });
  const createdTopicIds = [];
  let providerId;

  try {
    await waitForHealth(BASE);
    const director = await login(DIRECTOR);

    // --- H_AUTH: registro y auth del proveedor (R2-11) ---
    const createRes = await post('/api/listening/signal-providers', director, { name: 'check-provider', trust: 'medium' });
    ok(createRes.status === 201, `crear proveedor → 201 (llegó ${createRes.status})`);
    const created = await createRes.json();
    providerId = created.id;
    ok(typeof created.api_key === 'string' && created.api_key.startsWith('csig_'), 'la respuesta trae la API key cruda una sola vez');
    const apiKey = created.api_key;

    const listRes = await (await fetch(`${BASE}/api/listening/signal-providers`, { headers: { Authorization: 'Bearer ' + director } })).json();
    ok(listRes.every((p) => !('api_key' in p) && !('api_key_hash' in p)), 'GET /signal-providers nunca expone key ni hash');

    ok((await sendSignal('', {})).status === 401, 'POST /signals sin Authorization → 401');
    ok((await sendSignal('csig_esto-no-existe', {})).status === 401, 'POST /signals con key inválida → 401');

    // --- H_CASE_1: señal válida nueva → 201 inserted, visible en GET /topics ---
    const s1 = baseSignal();
    const r1 = await sendSignal(apiKey, s1);
    ok(r1.status === 201, `señal nueva válida → 201 (llegó ${r1.status})`);
    const b1 = await r1.json();
    ok(b1.action === 'inserted', `action = inserted (fue ${b1.action})`);
    createdTopicIds.push(b1.topic_id);
    const topicsAfter1 = await (await fetch(`${BASE}/api/listening/topics?limit=500`, { headers: { Authorization: 'Bearer ' + director } })).json();
    const inserted = topicsAfter1.find((t) => t.id === b1.topic_id);
    ok(inserted && inserted.provider === 'check-provider' && inserted.external_id === s1.signal.signalId, 'el topic insertado trae provider/external_id del contrato');
    ok(inserted.locality === 'Perote' && inserted.territorial_scope === 'local' && inserted.category === 'servicios_publicos', 'trae locality/territorial_scope/category');
    ok(inserted.verification_status === 'checking', `verification_status = checking, nunca verified (fue ${inserted.verification_status})`);

    // --- H_CASE_2: misma (provider, external_id) enviada dos veces → duplicate ---
    const r2 = await sendSignal(apiKey, s1);
    ok(r2.status === 200, `reenvío idéntico → 200 (llegó ${r2.status})`);
    const b2 = await r2.json();
    ok(b2.action === 'duplicate' && b2.topic_id === b1.topic_id, `reenvío → duplicate, mismo topic_id (fue ${b2.action})`);
    const countAfterDupe = (await (await fetch(`${BASE}/api/listening/topics?limit=500`, { headers: { Authorization: 'Bearer ' + director } })).json()).length;
    ok(countAfterDupe === topicsAfter1.length, 'reenviar un duplicado no crea fila nueva');

    // --- H_CASE_3: título similar (>0.45) a un tema reciente → upgraded, conserva título canónico ---
    const s3 = baseSignal({
      signal: {
        signalId: `check-similar-${Date.now()}`,
        title: s1.signal.title.replace('Corte de agua', 'CORTE DE AGUA'), // similarity alta, no idéntico
        corroboratingSources: [{ label: 'Corroborante', url: 'https://ejemplo.mx/nota', kind: 'secondary', reliable: true }],
      },
    });
    const r3 = await sendSignal(apiKey, s3);
    ok(r3.status === 200, `título similar → 200 (llegó ${r3.status})`);
    const b3 = await r3.json();
    ok(b3.action === 'upgraded' && b3.topic_id === b1.topic_id, `título similar → upgraded sobre el mismo topic (fue ${b3.action}, id ${b3.topic_id})`);
    const upgradedRow = (await (await fetch(`${BASE}/api/listening/topics?limit=500`, { headers: { Authorization: 'Bearer ' + director } })).json()).find((t) => t.id === b1.topic_id);
    ok(upgradedRow.title === s1.signal.title, 'conserva el título canónico ya en panel, no el de la señal nueva');
    ok(Array.isArray(upgradedRow.evidence) && upgradedRow.evidence.length >= 2, 'upgrade fusiona evidence (fuente original + corroborante)');

    // --- H_CASE_4: payload sin campos requeridos → 400 con los campos ---
    const r4 = await sendSignal(apiKey, { schemaVersion: '1.0', provider: 'check-provider', accessStatus: 'ok', signal: {} });
    ok(r4.status === 400, `payload incompleto → 400 (llegó ${r4.status})`);
    const b4 = await r4.json();
    ok(b4.action === 'rejected' && b4.fields && b4.fields['signal.title'] && b4.fields['signal.confidence'], 'rejected reporta los campos faltantes');

    // --- H_CASE_5: key revocada → 401 ---
    const revokeRes = await patch(`/api/listening/signal-providers/${providerId}`, director, { active: false });
    ok(revokeRes.status === 200, `revocar proveedor → 200 (llegó ${revokeRes.status})`);
    const r5 = await sendSignal(apiKey, baseSignal());
    ok(r5.status === 401, `key revocada → 401 (llegó ${r5.status})`);
    await patch(`/api/listening/signal-providers/${providerId}`, director, { active: true }); // reactivar para los casos siguientes

    // --- H_CASE_6: trust=high del proveedor no produce verified automático ---
    const highRes = await post('/api/listening/signal-providers', director, { name: 'check-provider-high', trust: 'high' });
    const highCreated = await highRes.json();
    const s6 = baseSignal({
      provider: 'check-provider-high',
      signal: {
        signalId: `check-high-${Date.now()}`,
        title: `[check] Tema de proveedor trust=high ${Date.now()}`,
        confidence: 95,
        verificationStatus: 'verified', // el proveedor lo declara — debe reescribirse igual
        corroboratingSources: [
          { label: 'Corroborante 1', url: 'https://ejemplo.mx/a', kind: 'secondary', reliable: true },
          { label: 'Corroborante 2', url: 'https://ejemplo.mx/b', kind: 'secondary', reliable: true },
        ],
      },
    });
    const r6 = await sendSignal(highCreated.api_key, s6);
    ok(r6.status === 201, `señal de proveedor trust=high → 201 (llegó ${r6.status})`);
    const b6 = await r6.json();
    createdTopicIds.push(b6.topic_id);
    const topic6 = (await (await fetch(`${BASE}/api/listening/topics?limit=500`, { headers: { Authorization: 'Bearer ' + director } })).json()).find((t) => t.id === b6.topic_id);
    ok(topic6.verification_status !== 'verified', `trust=high + verificationStatus:'verified' en la entrada → NUNCA verified (fue ${topic6.verification_status})`);

    // --- H_BATCH + H_PROVIDER_MISMATCH: lote con una entrada de provider equivocado ---
    const batchRes = await sendSignal(apiKey, {
      signals: [
        baseSignal({ signal: { signalId: `check-batch-${Date.now()}`, title: `[check] Batch OK ${Date.now()}` } }),
        baseSignal({ provider: 'otro-proveedor', signal: { signalId: `check-batch-bad-${Date.now()}` } }),
      ],
    });
    ok(batchRes.status === 200, `batch → 200 (llegó ${batchRes.status})`);
    const batchBody = await batchRes.json();
    ok(Array.isArray(batchBody.results) && batchBody.results.length === 2, 'batch devuelve un resultado por señal');
    ok(batchBody.results[0].action === 'inserted', 'primera entrada del batch: inserted');
    ok(batchBody.results[1].action === 'rejected' && batchBody.results[1].fields.provider, 'segunda entrada (provider equivocado): rejected');
    if (batchBody.results[0].topic_id) createdTopicIds.push(batchBody.results[0].topic_id);

    console.log(`\n✔ check-signals pasó (${n} asserts).`);
  } finally {
    if (createdTopicIds.length) {
      await pool.query('DELETE FROM topics WHERE id = ANY($1::int[])', [createdTopicIds]).catch(() => {});
    }
    await pool.query(`DELETE FROM signal_providers WHERE name IN ('check-provider', 'check-provider-high')`).catch(() => {});
    await stopApi(server);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✘ check-signals falló:', err.message);
  process.exit(1);
});
