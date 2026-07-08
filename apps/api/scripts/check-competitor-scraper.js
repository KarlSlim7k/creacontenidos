#!/usr/bin/env node
// Check ejecutable del branch de Facebook en el endpoint
// POST /api/listening/competitors/detect. NO requiere tener el servicio
// competitor-scraper corriendo: usa un stub HTTP local que simula la respuesta.
//
// Lo que valida (sin gastar en APIs de pago ni levantar Playwright):
//   1. El handler reconoce source: 'facebook' y rechaza source desconocido.
//   2. Sin COMPETITOR_SCRAPER_URL → 503 competitor_scraper_not_configured.
//   3. Con COMPETITOR_SCRAPER_URL apuntando al stub, los items del stub se
//      insertan en competitor_posts con dedupe por post_url (idempotencia).
//   4. La columna source_platform queda en 'facebook'.
//   5. Auth/role siguen aplicando al branch nuevo (colaborador → 403).
//
// Para correr dentro del contenedor api de Dokploy (que ya tiene node + node_modules),
// usar: bash /home/karol/creacontenidos-work/run-check.sh

const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const PORT = 3998;
const BASE = `http://localhost:${PORT}`;
const STUB_PORT = 3999;
const STUB_URL = `http://localhost:${STUB_PORT}`;

const config = require(path.join(ROOT, 'src/config'));

const DEV_PASSWORD = 'crea2026';
const DIRECTOR = 'check-director@crearcontenidos.com';
const PRODUCCION = 'check-produccion@crearcontenidos.com';
const COLABORADOR = 'check-colaborador@crearcontenidos.com';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

function startStubServer() {
  const stubHits = [];
  const stubItems = [
    {
      source_platform: 'facebook',
      source_account: 'https://www.facebook.com/check-fb-1',
      post_url: 'https://www.facebook.com/check-fb-1/posts/pfbid-check-001',
      post_text: '[check] post desde stub 1',
      post_date: '2026-07-08T10:00:00.000Z',
      reactions: 12, comments: 3, shares: 1, views: 100, media_type: 'texto',
    },
    {
      source_platform: 'facebook',
      source_account: 'https://www.facebook.com/check-fb-1',
      post_url: 'https://www.facebook.com/check-fb-1/posts/pfbid-check-002',
      post_text: '[check] post desde stub 2',
      post_date: '2026-07-08T11:00:00.000Z',
      reactions: 0, comments: 0, shares: 0, views: 0, media_type: 'video',
    },
  ];

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'POST' && req.url === '/scrape') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        stubHits.push({ method: req.method, url: req.url, body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ items: stubItems, meta: { count: stubItems.length, accounts: 1, elapsedMs: 1 } }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(STUB_PORT, '127.0.0.1', () => {
      resolve({ server, getHits: () => stubHits, getItems: () => stubItems });
    });
  });
}

async function waitForHealth(base) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return;
    } catch (err) {
      if (i === 49) throw new Error(`Server no levantó en ${base}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server no levantó en ' + base);
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  });
  assert.strictEqual(res.status, 200, 'login falló para ' + email);
  return (await res.json()).token;
}

function post(pathname, token, body) {
  return fetch(BASE + pathname, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(body || {}),
  });
}

function startApi(env) {
  const proc = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => process.stdout.write(`[api] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[api] ${d}`));
  proc.on('error', (err) => console.error('[api error]', err));
  proc.on('exit', (code, sig) => console.error(`[api exit] code=${code} sig=${sig}`));
  return proc;
}

function kill(server) {
  return new Promise((resolve) => {
    if (!server || server.killed) return resolve();
    server.on('exit', () => resolve());
    server.kill('SIGTERM');
    setTimeout(() => { try { server.kill('SIGKILL'); } catch (_) {} resolve(); }, 2000);
  });
}

async function restartApi(server, env) {
  await kill(server);
  await new Promise((r) => setTimeout(r, 300));
  const next = startApi(env);
  await waitForHealth(BASE);
  return next;
}

async function main() {
  execFileSync('node', ['src/db/migrate.js'], { cwd: ROOT, stdio: 'inherit' });

  const pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query(`DELETE FROM competitor_posts WHERE post_url LIKE 'https://www.facebook.com/check-fb-%'`);

  // Los seeds no son idempotentes, así que la DB de producción ya está poblada
  // con usuarios reales (no los del seed). Para poder hacer login, creamos
  // tres usuarios de check con password conocido. Si ya existen, los
  // actualizamos para que el password sea el esperado. Se eliminan al final.
  const bcrypt = require('bcrypt');
  const checkPasswordHash = await bcrypt.hash('crea2026', 10);
  for (const u of [
    { email: 'check-director@crearcontenidos.com', role: 'director', name: '[check] director' },
    { email: 'check-produccion@crearcontenidos.com', role: 'produccion', name: '[check] produccion' },
    { email: 'check-colaborador@crearcontenidos.com', role: 'colaborador', name: '[check] colaborador' },
  ]) {
    await pool.query(
      `INSERT INTO users (email, password_hash, role, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $3, name = $4`,
      [u.email, checkPasswordHash, u.role, u.name],
    );
  }

  const stub = await startStubServer();
  const stubItems = stub.getItems();

  let api = startApi({ COMPETITOR_SCRAPER_URL: STUB_URL });
  try {
    await waitForHealth(BASE);

    const director = await login(DIRECTOR);
    const produccion = await login(PRODUCCION);
    const colaborador = await login(COLABORADOR);

    // --- 1. Sin COMPETITOR_SCRAPER_URL → 503 ---
    api = await restartApi(api, { COMPETITOR_SCRAPER_URL: '' });
    {
      const r = await post('/api/listening/competitors/detect', director, {
        source: 'facebook',
        accounts: ['https://www.facebook.com/check-fb-1'],
      });
      ok(r.status === 503, `sin COMPETITOR_SCRAPER_URL → 503 (recibido ${r.status})`);
      const body = await r.json();
      ok(body.error === 'competitor_scraper_not_configured', `error body identifica "competitor_scraper_not_configured" (recibido ${body.error})`);
    }

    // --- 2. Auth/role siguen aplicando ---
    api = await restartApi(api, { COMPETITOR_SCRAPER_URL: STUB_URL });
    {
      const noToken = await post('/api/listening/competitors/detect', null, {
        source: 'facebook', accounts: ['x'],
      });
      ok(noToken.status === 401, 'sin token → 401');

      const badRole = await post('/api/listening/competitors/detect', colaborador, {
        source: 'facebook', accounts: ['x'],
      });
      ok(badRole.status === 403, 'colaborador → 403');
    }

    // --- 3. Source desconocido → 400 ---
    {
      const r = await post('/api/listening/competitors/detect', director, { source: 'instagram' });
      ok(r.status === 400, `source desconocido → 400 (recibido ${r.status})`);
    }

    // --- 4. Facebook sin accounts → 400 ---
    {
      const r = await post('/api/listening/competitors/detect', director, { source: 'facebook' });
      ok(r.status === 400, 'source=facebook sin accounts → 400');
    }

    // --- 5. Source perplexity reconocido (sin gastar API) ---
    {
      const r = await post('/api/listening/competitors/detect', director, { source: 'perplexity' });
      ok(r.status === 200 || r.status === 500, `source=perplexity reconocido (recibido ${r.status})`);
    }

    // --- 6. Happy path: con stub, items se insertan + idempotencia ---
    {
      const before = await pool.query(
        `SELECT count(*)::int AS c FROM competitor_posts WHERE source_platform = 'facebook' AND post_url LIKE 'https://www.facebook.com/check-fb-%'`,
      );
      const r = await post('/api/listening/competitors/detect', director, {
        source: 'facebook',
        accounts: ['https://www.facebook.com/check-fb-1'],
      });
      ok(r.status === 200, `source=facebook con stub → 200 (recibido ${r.status})`);
      const body = await r.json();
      ok(body.source === 'facebook', `respuesta trae source='facebook' (recibido ${body.source})`);
      ok(body.detected === stubItems.length, `inserted = ${stubItems.length} (recibido ${body.detected})`);
      ok(Array.isArray(body.posts) && body.posts.length === stubItems.length, 'posts[] tiene el mismo tamaño');

      const after = await pool.query(
        `SELECT count(*)::int AS c FROM competitor_posts WHERE source_platform = 'facebook' AND post_url LIKE 'https://www.facebook.com/check-fb-%'`,
      );
      ok(after.rows[0].c - before.rows[0].c === stubItems.length, `delta en DB = ${stubItems.length}`);

      const r2 = await post('/api/listening/competitors/detect', director, {
        source: 'facebook',
        accounts: ['https://www.facebook.com/check-fb-1'],
      });
      const body2 = await r2.json();
      ok(body2.detected === 0, `idempotencia: segunda llamada detecta 0 (recibido ${body2.detected})`);

      const hits = stub.getHits();
      ok(hits.length === 2, `stub fue llamado 2 veces (recibido ${hits.length})`);
    }

    // --- 7. Produccion también puede llamar ---
    {
      await pool.query(`DELETE FROM competitor_posts WHERE post_url = 'https://www.facebook.com/check-fb-1/posts/pfbid-check-001'`);
      const r = await post('/api/listening/competitors/detect', produccion, {
        source: 'facebook',
        accounts: ['https://www.facebook.com/check-fb-1'],
      });
      ok(r.status === 200, `produccion también puede llamar (recibido ${r.status})`);
      const body = await r.json();
      ok(body.detected === 1, `produccion insertó 1 fila nueva (recibido ${body.detected})`);
    }

    console.log(`OK: branch de Facebook en competitors/detect verificado (${n} checks, auth/rol, source param, 503 fallback, dedupe, stub idempotencia, ambos roles válidos).`);
  } finally {
    await kill(api);
    await new Promise((r) => stub.server.close(r));
    await pool.query(`DELETE FROM competitor_posts WHERE post_url LIKE 'https://www.facebook.com/check-fb-%'`);
    // Limpiar activity_log antes de borrar los users (FK constraint).
    await pool.query(`DELETE FROM activity_log WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'check-%@crearcontenidos.com')`);
    await pool.query(`DELETE FROM users WHERE email IN ('check-director@crearcontenidos.com','check-produccion@crearcontenidos.com','check-colaborador@crearcontenidos.com')`);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
