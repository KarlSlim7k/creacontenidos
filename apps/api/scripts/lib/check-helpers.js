// Helpers comunes para los checks ejecutables de apps/api/scripts.
// Extraídos de duplicación real en 3+ scripts (waitForHealth, login, post,
// runMigrate/runSeed, kill robusto). No agregar nada que no elimine
// duplicación existente.
const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..', '..');
const config = require(path.join(ROOT, 'src/config'));

const DEV_PASSWORD = process.env.CHECK_PASSWORD || 'crea2026';
const DEFAULT_CHECK_HOST = 'http://127.0.0.1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runMigrate() {
  execFileSync('node', ['src/db/migrate.js'], { cwd: ROOT, stdio: 'inherit' });
}

function runSeed() {
  execFileSync('node', ['src/db/seed.js'], { cwd: ROOT, stdio: 'inherit' });
}

function createPool() {
  return new Pool({ connectionString: config.databaseUrl });
}

function startApi({ port, env, stdio } = {}) {
  const proc = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ...env },
    stdio: stdio || 'ignore',
  });
  return proc;
}

// Robusto: SIGTERM, fallback SIGKILL, resuelve aunque el proceso ya haya muerto.
function stopApi(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) return resolve();
    proc.on('exit', () => resolve());
    proc.kill('SIGTERM');
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) { /* ya murió */ }
      resolve();
    }, 2000);
  });
}

async function waitForHealth(base, options = {}) {
  const retries = options.retries || 50;
  const intervalMs = options.intervalMs || 200;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch (err) {
      if (i === retries - 1) throw new Error(`Server no levantó en ${base}: ${err.message}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Server no levantó en ${base}`);
}

async function login(base, email, password = DEV_PASSWORD) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.strictEqual(res.status, 200, `login falló para ${email}`);
  return (await res.json()).token;
}

function auth(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(token) {
  return { 'Content-Type': 'application/json', ...auth(token) };
}

async function getJson(url, options = {}) {
  const res = await fetch(url, options);
  return { status: res.status, body: res.status === 429 ? null : await res.json() };
}

function postJson(base, pathname, token, body) {
  return fetch(base + pathname, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
}

function patchJson(base, pathname, token, body) {
  return fetch(base + pathname, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(body || {}),
  });
}

function deleteJson(base, pathname, token) {
  return fetch(base + pathname, {
    method: 'DELETE',
    headers: auth(token),
  });
}

module.exports = {
  DEV_PASSWORD,
  DEFAULT_CHECK_HOST,
  sleep,
  runMigrate,
  runSeed,
  createPool,
  startApi,
  stopApi,
  waitForHealth,
  login,
  auth,
  jsonHeaders,
  getJson,
  postJson,
  patchJson,
  deleteJson,
};
