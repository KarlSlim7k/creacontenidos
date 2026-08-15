#!/usr/bin/env node
// Check ejecutable de "Confiar en este dispositivo" (2FA → trusted_devices).
// Uso: node scripts/check-2fa-devices.js   (requiere Postgres arriba)
//
// Cubre: la cookie de dispositivo salta el segundo paso en el login siguiente,
// el flag `current` en GET /devices depende de la cookie de CADA request (no es
// un estado guardado), revocar un dispositivo (scoped a su dueño) le quita el
// salto de verdad al login (no solo desaparece del listado), revocar todos, y
// los tres eventos que deben barrer la tabla completa: desactivar 2FA, cambiar
// contraseña (PATCH /me) y reset-password. Usa un usuario descartable propio
// (se borra al final) para no interferir con las cuentas que usan otros checks.
const assert = require('node:assert');
const { authenticator } = require('otplib');
const { makeToken } = require('../src/lib/password-reset');
const { DEV_PASSWORD, runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth, auth } = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3998;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 'check-2fa-devices@crearcontenidos.com';
// Mismo hash que el seed usa para DEV_PASSWORD ('crea2026') — evita traer bcrypt
// solo para este check (ver apps/api/src/db/seeds/003_admin_seed.sql).
const DEV_PASSWORD_HASH = '$2b$10$g3ubKCDcsuo18Lm/ktS2XeN.8T1zScn2M64E7UWFSGpmSdWo4D93y';

function json(res) { return res.json(); }

async function login(email, password = DEV_PASSWORD) {
  return json(await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }));
}

async function verify(pendingToken, secret, remember) {
  const res = await fetch(`${BASE}/api/auth/2fa/verify`, {
    method: 'POST', headers: { ...auth(pendingToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: authenticator.generate(secret), remember_device: remember }),
  });
  return { body: await res.json(), setCookies: res.headers.getSetCookie() };
}

function deviceCookieValue(setCookies) {
  const raw = setCookies.find((c) => c.startsWith('crea_admin_device='));
  return raw ? raw.split(';', 1)[0].slice('crea_admin_device='.length) : null;
}

// Repite el ciclo login pendiente → verify con remember_device:true, como si
// fuera un navegador nuevo cada vez (útil para simular "2 dispositivos").
async function trustNewDevice(secret) {
  const pending = await login(EMAIL);
  assert.strictEqual(pending.requires_2fa, true, 'sin cookie de dispositivo, el login debe pedir 2FA');
  const { body, setCookies } = await verify(pending.token, secret, true);
  const raw = deviceCookieValue(setCookies);
  assert.ok(raw, 'remember_device:true debe emitir la cookie crea_admin_device');
  return { sessionToken: body.token, rawDevice: raw };
}

async function main() {
  runMigrate();
  runSeed();

  const pool = createPool();
  const server = startApi({ port: PORT });

  try {
    await waitForHealth(BASE);

    // Usuario descartable: producción, sin 2FA al principio.
    const { rows: [testUser] } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, active) VALUES ('Check 2FA Devices', $1, $2, 'produccion', true) RETURNING id`,
      [EMAIL, DEV_PASSWORD_HASH]
    );
    const directorToken = (await login('director@crearcontenidos.com')).token;

    // 1. Activar 2FA para el usuario de prueba.
    const token0 = (await login(EMAIL)).token;
    const setup = await json(await fetch(`${BASE}/api/auth/2fa/setup`, { method: 'POST', headers: auth(token0) }));
    const enabled = await json(await fetch(`${BASE}/api/auth/2fa/enable`, {
      method: 'POST', headers: { ...auth(token0), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: authenticator.generate(setup.secret) }),
    }));
    assert.ok(enabled.token, '2fa/enable debe emitir sesión completa');

    // 2. Login normal (sin cookie de dispositivo) pide 2FA; verify con
    //    remember_device:true emite una cookie propia con las flags correctas.
    const pending1 = await login(EMAIL);
    assert.strictEqual(pending1.requires_2fa, true);
    const v1 = await verify(pending1.token, setup.secret, true);
    assert.ok(v1.body.token, 'verify válido debe emitir sesión completa');
    const rawDevice = deviceCookieValue(v1.setCookies);
    assert.ok(rawDevice, 'debe emitir crea_admin_device');
    const deviceSetCookie = v1.setCookies.find((c) => c.startsWith('crea_admin_device='));
    assert.ok(deviceSetCookie.includes('HttpOnly') && deviceSetCookie.includes('SameSite=Strict') && deviceSetCookie.includes('Path=/api/auth') && deviceSetCookie.includes('Max-Age=2592000'),
      'la cookie de dispositivo debe ser HttpOnly, SameSite=Strict, acotada a /api/auth y durar 30 días');

    // 3. El siguiente login CON esa cookie salta el 2FA directo a sesión completa.
    const skip = await json(await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `crea_admin_device=${rawDevice}` },
      body: JSON.stringify({ email: EMAIL, password: DEV_PASSWORD }),
    }));
    assert.strictEqual(skip.requires_2fa, undefined, 'con dispositivo confiable no debe pedir 2FA');
    assert.ok(skip.user && skip.token, 'debe emitir sesión completa directo');

    // 4. GET /devices: `current` depende de la cookie de ESTE request, no de un
    //    flag guardado — con la cookie es true, sin ella (mismo usuario) es false.
    let devices = await json(await fetch(`${BASE}/api/auth/devices`, { headers: { ...auth(skip.token), Cookie: `crea_admin_device=${rawDevice}` } }));
    assert.strictEqual(devices.length, 1);
    assert.strictEqual(devices[0].current, true);
    devices = await json(await fetch(`${BASE}/api/auth/devices`, { headers: auth(skip.token) }));
    assert.strictEqual(devices[0].current, false, 'sin la cookie en el request, current debe ser false');

    // 5. Revocar el dispositivo de OTRO usuario (director) por id ajeno → 404: el
    //    scoping por user_id es lo que impide adivinar el id de otra cuenta.
    assert.strictEqual(
      (await fetch(`${BASE}/api/auth/devices/${devices[0].id}`, { method: 'DELETE', headers: auth(directorToken) })).status,
      404, 'no debe poder revocar un dispositivo que no es suyo'
    );

    // 6. Revocar el propio → 204, desaparece del listado, Y deja de saltar el 2FA
    //    en un login real (no solo se borra del listado, cambia el comportamiento).
    assert.strictEqual((await fetch(`${BASE}/api/auth/devices/${devices[0].id}`, { method: 'DELETE', headers: auth(skip.token) })).status, 204);
    devices = await json(await fetch(`${BASE}/api/auth/devices`, { headers: auth(skip.token) }));
    assert.strictEqual(devices.length, 0);
    const afterRevoke = await json(await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `crea_admin_device=${rawDevice}` },
      body: JSON.stringify({ email: EMAIL, password: DEV_PASSWORD }),
    }));
    assert.strictEqual(afterRevoke.requires_2fa, true, 'la cookie de un dispositivo ya revocado no debe seguir saltando el 2FA');
    // Deja la sesión pendiente resuelta (sin recordar) para no dejar el token colgado.
    const afterRevokeVerified = await verify(afterRevoke.token, setup.secret, false);
    assert.ok(!afterRevokeVerified.setCookies.some((c) => c.startsWith('crea_admin_device=')), 'remember_device:false no debe emitir cookie de dispositivo');

    // 7. "Revocar todos": dos dispositivos confiables (simulando 2 navegadores) →
    //    DELETE masivo los borra a ambos de una.
    await trustNewDevice(setup.secret);
    const { sessionToken: sessionForBulk } = await trustNewDevice(setup.secret);
    devices = await json(await fetch(`${BASE}/api/auth/devices`, { headers: auth(sessionForBulk) }));
    assert.strictEqual(devices.length, 2, 'debe haber 2 dispositivos confiables simulados');
    assert.strictEqual((await fetch(`${BASE}/api/auth/devices`, { method: 'DELETE', headers: auth(sessionForBulk) })).status, 204);
    devices = await json(await fetch(`${BASE}/api/auth/devices`, { headers: auth(sessionForBulk) }));
    assert.strictEqual(devices.length, 0);

    const countDevices = async () => (await pool.query('SELECT count(*)::int AS c FROM trusted_devices WHERE user_id = $1', [testUser.id])).rows[0].c;

    // 8. Cambiar contraseña (PATCH /me) revoca todo — un dispositivo confiable de
    //    antes no debe sobrevivir a una contraseña nueva.
    const { sessionToken: preChangeToken } = await trustNewDevice(setup.secret);
    assert.strictEqual(await countDevices(), 1);
    const changed = await fetch(`${BASE}/api/auth/me`, {
      method: 'PATCH', headers: { ...auth(preChangeToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'otra-clave-temporal-123', current_password: DEV_PASSWORD, code: authenticator.generate(setup.secret) }),
    });
    assert.strictEqual(changed.status, 200);
    assert.strictEqual(await countDevices(), 0, 'cambiar la contraseña debe revocar todos los dispositivos confiables');

    // 9. Reset-password (flujo "olvidé mi contraseña") también revoca todo.
    const { rows: [afterPwChange] } = await pool.query('SELECT session_version FROM users WHERE id = $1', [testUser.id]);
    const resetToken = makeToken(testUser.id, afterPwChange.session_version);
    const resetLoginPending = await login(EMAIL, 'otra-clave-temporal-123');
    const resetVerify = await verify(resetLoginPending.token, setup.secret, true);
    assert.strictEqual(await countDevices(), 1);
    const resetRes = await fetch(`${BASE}/api/auth/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: 'una-clave-mas-nueva-456' }),
    });
    assert.strictEqual(resetRes.status, 200);
    assert.strictEqual(await countDevices(), 0, 'reset-password debe revocar todos los dispositivos confiables');
    void resetVerify;

    // 10. Desactivar 2FA revoca todo (si no, reactivarlo heredaría confianza vieja
    //     sin haber pasado nunca por un /2fa/verify del 2FA nuevo).
    const finalPending = await login(EMAIL, 'una-clave-mas-nueva-456');
    const finalVerify = await verify(finalPending.token, setup.secret, true);
    assert.strictEqual(await countDevices(), 1);
    const disableRes = await fetch(`${BASE}/api/auth/2fa/disable`, {
      method: 'POST', headers: { ...auth(finalVerify.body.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: authenticator.generate(setup.secret) }),
    });
    assert.strictEqual(disableRes.status, 200);
    assert.strictEqual(await countDevices(), 0, 'desactivar 2FA debe revocar todos los dispositivos confiables');

    console.log('\n✔ check-2fa-devices pasó.');
  } finally {
    await pool.query('DELETE FROM users WHERE email = $1', [EMAIL]);
    await pool.end();
    stopApi(server);
  }
}

main().catch((err) => {
  console.error('✘ check-2fa-devices falló:', err.message);
  process.exit(1);
});
