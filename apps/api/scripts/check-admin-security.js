#!/usr/bin/env node
'use strict';

// Regresión local de fronteras del panel: no abre sockets ni usa Postgres real.
// Comprueba que requireAuth relea permisos vivos y que los routers sensibles
// mantengan su gate central aunque se agreguen endpoints nuevos.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'check-admin-security-secret';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const pool = require('../src/db/pool');
const config = require('../src/config');
const { requireAuth, requireRole } = require('../src/middleware/auth');
const { setSession } = require('../src/lib/auth-session');
const { assertSeedAllowed } = require('../src/db/seed');

function invoke(middleware, req) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, req }); },
    };
    Promise.resolve(middleware(req, response, (err) => err ? reject(err) : resolve({ status: 0, req }))).catch(reject);
  });
}

async function main() {
  const originalQuery = pool.query;
  try {
    const token = jwt.sign({ id: 7, name: 'Viejo', role: 'director', sv: 3 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const req = { method: 'GET', originalUrl: '/api/auth/session', headers: { authorization: `Bearer ${token}` } };

    pool.query = async () => ({ rows: [{ id: 7, name: 'Actual', role: 'colaborador', active: true, two_factor_enabled: true, session_version: 3 }] });
    let result = await invoke(requireAuth, req);
    assert.strictEqual(result.status, 0);
    assert.deepStrictEqual(req.user, { id: 7, name: 'Actual', role: 'colaborador', requires2faSetup: false }, 'se confió en el rol obsoleto del JWT');
    result = await invoke(requireRole('director'), req);
    assert.strictEqual(result.status, 403, 'un rol revocado conservó acceso de director');

    pool.query = async () => ({ rows: [{ id: 7, name: 'Actual', role: 'director', active: false, two_factor_enabled: true, session_version: 3 }] });
    result = await invoke(requireAuth, { method: 'GET', originalUrl: '/api/auth/session', headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(result.status, 401, 'un usuario desactivado conservó una sesión válida');

    pool.query = async () => ({ rows: [{ id: 7, name: 'Actual', role: 'director', active: true, two_factor_enabled: true, session_version: 4 }] });
    result = await invoke(requireAuth, { method: 'GET', originalUrl: '/api/auth/session', headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(result.status, 401, 'logout/cambio de credenciales no revocó el JWT anterior');

    result = await invoke(requireAuth, {
      method: 'POST', originalUrl: '/api/editorial/ideas',
      headers: { cookie: `crea_admin_session=${token}` },
      get() { return undefined; },
    });
    assert.strictEqual(result.status, 403, 'una mutación con cookie pasó sin CSRF');

    const originalNodeEnv = config.nodeEnv;
    config.nodeEnv = 'production';
    pool.query = async () => ({ rows: [{ id: 7, name: 'Actual', role: 'director', active: true, two_factor_enabled: false, session_version: 3 }] });
    result = await invoke(requireAuth, { method: 'GET', originalUrl: '/api/editorial/proposals', headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(result.status, 403, 'un director sin 2FA conservó acceso privilegiado en producción');
    result = await invoke(requireAuth, { method: 'GET', originalUrl: '/api/auth/session', headers: { authorization: `Bearer ${token}` } });
    assert.strictEqual(result.status, 0, 'el director sin 2FA quedó sin acceso a la ruta de incorporación');
    assert.strictEqual(result.req.user.requires2faSetup, true);
    config.nodeEnv = originalNodeEnv;

    const setCookies = [];
    setSession({ append(name, value) { if (name === 'Set-Cookie') setCookies.push(value); } }, token);
    assert.ok(setCookies.some((value) => value.includes('crea_admin_session=') && value.includes('HttpOnly') && value.includes('SameSite=Strict')));
    assert.ok(setCookies.some((value) => value.includes('crea_admin_csrf=') && !value.includes('HttpOnly')));

    const src = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(src('src/modules/editorial/index.js'), /router\.use\('\/proposals', requireAuth, requireRole\('director', 'produccion'\)\)/);
    assert.match(src('src/modules/content-engine/index.js'), /router\.use\(requireAuth, requireRole\('director', 'produccion'\)\)/);
    assert.match(src('src/modules/listening/index.js'), /router\.use\(requireAuth, requireRole\('director', 'produccion'\)\)/);
    assert.match(src('src/modules/auth/index.js'), /DELETE FROM push_subscriptions WHERE endpoint = \$1 AND user_id = \$2/);

    const adminSrc = fs.readdirSync(path.join(__dirname, '../../admin/src/screens'))
      .filter((file) => file.endsWith('.ts'))
      .map((file) => src(`../admin/src/screens/${file}`))
      .join('\n');
    assert.doesNotMatch(adminSrc, /\son[a-z]+=/i, 'el panel volvió a introducir handlers inline bloqueados por CSP');
    const adminAuth = src('../admin/src/auth.ts') + src('../admin/src/store.ts');
    assert.doesNotMatch(adminAuth, /crea-admin-token|localStorage\.setItem\([^,]*token/i, 'el JWT volvió a almacenamiento accesible por JavaScript');

    assert.throws(() => assertSeedAllowed('production'), /Seed bloqueado en producción/);
    assert.doesNotThrow(() => assertSeedAllowed('test'));

    console.log('OK: seguridad admin verificada (revocación, cookies HttpOnly/CSRF, seed, permisos vivos y CSP).');
  } finally {
    pool.query = originalQuery;
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FAIL:', err.stack || err);
  process.exit(1);
});
