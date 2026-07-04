#!/usr/bin/env node
// Check ejecutable de Fase 3 (POST /api/public/leads).
// Uso: node scripts/check-leads.js   (requiere Postgres arriba)
// Corre migrate dos veces (idempotencia), levanta la API en :3998 y verifica:
// POST válido → 201 + fila en leads; inválidos (sin email, email malformado,
// message vacío, campos gigantes) → 400 con detalle por campo; honeypot lleno →
// 201 idéntico al éxito y CERO filas nuevas; ráfaga → 429 (límite estricto 5/15min).
// El límite es en memoria por proceso: el server se reinicia entre la fase
// funcional y la fase de ráfaga para no contaminar los conteos.
const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
const config = require(path.join(ROOT, 'src/config'));

const VALID = {
  name: 'Lead de Prueba',
  email: 'lead@example.com',
  company: 'Papas del Cofre',
  service_interest: 'Branded content',
  message: 'Quiero cotizar un paquete de branded content para temporada alta.',
  source_page: 'estudio/contacto',
};

function postLead(body) {
  return fetch(`${BASE}/api/public/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function startServer() {
  return spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch (_) { /* aún no arranca */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('La API no levantó en :' + PORT);
}

async function main() {
  // 0. migrate re-ejecutable.
  execFileSync('node', ['src/db/migrate.js'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('node', ['src/db/migrate.js'], { cwd: ROOT, stdio: 'inherit' });

  const pool = new Pool({ connectionString: config.databaseUrl });
  const leadCount = async () =>
    (await pool.query('SELECT count(*)::int AS n FROM leads')).rows[0].n;

  // Fase A: validación + inserción (5 requests exactos, bajo el límite de 5/15min).
  let server = startServer();
  try {
    await waitForHealth();
    const before = await leadCount();

    // 1. Inválidos → 400 con detalle por campo, sin insertar.
    const cases = [
      [{ ...VALID, email: undefined }, 'email', 'sin email'],
      [{ ...VALID, email: 'no-es-un-email' }, 'email', 'email malformado'],
      [{ ...VALID, message: '   ' }, 'message', 'message vacío'],
      [{ ...VALID, name: 'x'.repeat(201), message: 'x'.repeat(5001) }, 'name', 'campos gigantes'],
    ];
    for (const [body, field, label] of cases) {
      const res = await postLead(body);
      assert.strictEqual(res.status, 400, `${label}: esperaba 400, obtuve ${res.status}`);
      const json = await res.json();
      assert.ok(json.fields && json.fields[field], `${label}: falta detalle del campo "${field}"`);
    }
    const giant = await pool.query('SELECT 1 FROM leads WHERE length(name) > 200');
    assert.strictEqual(giant.rowCount, 0, 'un campo gigante llegó a la DB');
    assert.strictEqual(await leadCount(), before, 'un POST inválido insertó fila');

    // 2. Válido → 201 {ok:true}, fila en leads, sin id en la respuesta.
    const res = await postLead(VALID);
    assert.strictEqual(res.status, 201);
    const okBody = await res.json();
    assert.deepStrictEqual(okBody, { ok: true }, 'la respuesta de éxito debe ser exactamente {ok:true}');
    assert.strictEqual(await leadCount(), before + 1, 'el POST válido no insertó fila');
    const { rows: [row] } = await pool.query(
      'SELECT name, email, company, service_interest, message, source_page FROM leads ORDER BY id DESC LIMIT 1'
    );
    assert.deepStrictEqual(row, VALID, 'la fila insertada no coincide con el payload');
  } finally {
    server.kill();
  }
  await new Promise((r) => setTimeout(r, 300));

  // Fase B: honeypot + ráfaga (server nuevo = contador de rate limit en cero).
  server = startServer();
  try {
    await waitForHealth();
    const before = await leadCount();

    // 3. Honeypot lleno → respuesta idéntica al éxito, CERO filas nuevas.
    const res = await postLead({ ...VALID, website: 'http://spam.example' });
    assert.strictEqual(res.status, 201, 'honeypot: la respuesta debe ser idéntica al éxito');
    assert.deepStrictEqual(await res.json(), { ok: true });
    assert.strictEqual(await leadCount(), before, 'el honeypot insertó fila');

    // 4. Ráfaga: 7 POSTs más (8 en total) → el límite estricto de 5/15min da 429.
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await postLead(VALID)).status);
    assert.ok(statuses.includes(429), `la ráfaga nunca recibió 429 (statuses: ${statuses})`);
    assert.ok(statuses.filter((s) => s === 201).length <= 4, 'el límite estricto dejó pasar más de 5 requests');
  } finally {
    server.kill();
    await pool.query("DELETE FROM leads WHERE email = 'lead@example.com'"); // limpia filas del check
    await pool.end();
  }

  console.log('OK: POST /api/public/leads verificado (validación 400 por campo, 201+fila, honeypot silencioso, 429 estricto).');
}

main().catch((err) => {
  console.error('CHECK FAILED:', err.message);
  process.exit(1);
});
