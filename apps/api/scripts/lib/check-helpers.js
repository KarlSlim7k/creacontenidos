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
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), ...env },
    stdio: stdio || 'ignore',
  });
  return proc;
}

// Robusto: SIGTERM, fallback SIGKILL, resuelve aunque el proceso ya haya muerto.
// El timer se limpia en 'exit' — sin eso cada stopApi dejaba el event loop
// vivo 2s extra aunque el server muriera al instante.
function stopApi(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) return resolve();
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (_) { /* ya murió */ }
      resolve();
    }, 2000);
    proc.on('exit', () => { clearTimeout(killTimer); resolve(); });
    proc.kill('SIGTERM');
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

// --- Mock de fetch para pruebas de IA sin red real (R2-02) ---
// `withMockedFetch(routes, fn)` reemplaza global.fetch durante `fn`, sin
// tocar nada más (server real, DB real). `routes` es un array de
// { match: string|RegExp, response }, evaluado en orden contra la URL de
// cada llamada. `response` puede ser un objeto fijo, una función (call) =>
// objeto, o un array usado como cola (se consume en orden; se repite la
// última entrada si se agota). Combinar con `chatCompletionResponse` /
// `errorResponse` de aquí abajo. Cualquier fase que agregue IA nueva
// (03-motor-editorial, 07-explorer-grok) debe reutilizar este mismo helper
// en vez de inventar un stub de fetch propio.
async function withMockedFetch(routes, fn) {
  const realFetch = global.fetch;
  const calls = [];
  const cursors = new Map();
  global.fetch = async (url, options) => {
    const raw = String(url);
    let body = null;
    try { body = options && options.body ? JSON.parse(options.body) : null; } catch (_) { /* body no-JSON: se ignora */ }
    calls.push({ url: raw, options, body });
    const idx = routes.findIndex((r) => (typeof r.match === 'string' ? raw.includes(r.match) : r.match.test(raw)));
    if (idx === -1) throw new Error(`[check-helpers] withMockedFetch: sin ruta mockeada para ${raw}`);
    const route = routes[idx];
    if (Array.isArray(route.response)) {
      const cursor = cursors.get(idx) || 0;
      cursors.set(idx, Math.min(cursor + 1, route.response.length - 1));
      return route.response[cursor];
    }
    return typeof route.response === 'function' ? route.response(calls[calls.length - 1]) : route.response;
  };
  try {
    return await fn(calls);
  } finally {
    global.fetch = realFetch;
  }
}

// Respuesta con forma chat-completion — Nous, OpenRouter y Perplexity Sonar
// comparten `{ choices: [{ message: { content } }], usage }` (ver
// requestNousCompletion / requestOpenRouterTextCompletion / perplexitySearch
// en lib/ai-client.js). Pon en `content` un JSON válido para el camino feliz,
// o texto no-JSON para ejercitar parseJson(). `status` >= 300 simula un error
// HTTP del proveedor (usa `errorBody` para el cuerpo de error).
function chatCompletionResponse(content, { status = 200, usage = { total_tokens: 10 }, model = 'stub/model', errorBody } = {}) {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => (ok ? { model, choices: [{ message: { content } }], usage } : (errorBody || {})),
    text: async () => (ok ? content : JSON.stringify(errorBody || {})),
  };
}

// Error HTTP simple, sin forma de chat-completion — para rutas que no
// devuelven un cuerpo de proveedor de IA.
function errorResponse(status, body) {
  return {
    ok: false,
    status,
    json: async () => body || {},
    text: async () => JSON.stringify(body || {}),
  };
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
  withMockedFetch,
  chatCompletionResponse,
  errorResponse,
};
