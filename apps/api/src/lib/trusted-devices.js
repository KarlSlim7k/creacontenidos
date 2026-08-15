// "Confiar en este dispositivo" (ver 2FA en modules/auth). El token viaja en
// una cookie de 32 bytes random; en DB solo se guarda su hash SHA-256 (igual
// espíritu que los backup codes: nunca el secreto en claro).
const crypto = require('crypto');

const TRUST_DAYS = 30;

function hashDeviceToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Heurística mínima, sin dependencia de UA-parser: solo para que el panel de
// revocación muestre algo legible ("Chrome en Windows"), no para fingerprinting.
function deviceLabel(req) {
  const ua = String(req.get('User-Agent') || '').slice(0, 300);
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'dispositivo desconocido';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'navegador desconocido';
  return `${browser} en ${os}`;
}

// Genera el token, guarda solo su hash, y devuelve el crudo — es la única vez
// que existe: el caller lo manda como cookie y lo descarta.
async function createTrustedDevice(pool, userId, req) {
  const raw = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO trusted_devices (user_id, token_hash, label, expires_at)
     VALUES ($1, $2, $3, now() + interval '${TRUST_DAYS} days')`,
    [userId, hashDeviceToken(raw), deviceLabel(req)]
  );
  return raw;
}

// UPDATE...RETURNING: valida y toca last_used_at en una sola query atómica.
async function matchTrustedDevice(pool, userId, rawToken) {
  const { rows } = await pool.query(
    `UPDATE trusted_devices SET last_used_at = now()
     WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()
     RETURNING id`,
    [userId, hashDeviceToken(rawToken)]
  );
  return rows[0] || null;
}

async function revokeAllTrustedDevices(pool, userId) {
  await pool.query('DELETE FROM trusted_devices WHERE user_id = $1', [userId]);
}

module.exports = { hashDeviceToken, deviceLabel, createTrustedDevice, matchTrustedDevice, revokeAllTrustedDevices };

// ponytail: self-check del camino de seguridad (hash estable, match solo con el
// token correcto y no vencido) con un pool falso en memoria — sin Postgres.
if (require.main === module) {
  const assert = require('assert');

  function fakePool() {
    const rows = [];
    let nextId = 1;
    return {
      rows,
      async query(sql, params) {
        if (sql.startsWith('INSERT INTO trusted_devices')) {
          const [userId, tokenHash, label] = params;
          const days = Number(/interval '(\d+) days'/.exec(sql)[1]);
          rows.push({ id: nextId++, user_id: userId, token_hash: tokenHash, label, expires_at: Date.now() + days * 86400000 });
          return { rows: [] };
        }
        if (sql.startsWith('UPDATE trusted_devices')) {
          const [userId, tokenHash] = params;
          const row = rows.find((r) => r.user_id === userId && r.token_hash === tokenHash && r.expires_at > Date.now());
          if (row) row.last_used_at = Date.now();
          return { rows: row ? [{ id: row.id }] : [] };
        }
        if (sql.startsWith('DELETE FROM trusted_devices')) {
          const [userId] = params;
          for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === userId) rows.splice(i, 1);
          return { rows: [] };
        }
        throw new Error('unexpected query in fake pool: ' + sql);
      },
    };
  }

  (async () => {
    const pool = fakePool();
    const req = { get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36' };

    assert.strictEqual(deviceLabel(req), 'Chrome en Windows', 'la etiqueta debe combinar navegador + SO');

    const raw = await createTrustedDevice(pool, 7, req);
    assert.strictEqual(pool.rows.length, 1, 'debe insertar una fila');
    assert.notStrictEqual(pool.rows[0].token_hash, raw, 'el hash guardado nunca debe ser el token crudo');

    const matched = await matchTrustedDevice(pool, 7, raw);
    assert.ok(matched, 'el token correcto del mismo usuario debe matchear');

    assert.strictEqual(await matchTrustedDevice(pool, 7, 'token-inventado'), null, 'un token distinto no debe matchear');
    assert.strictEqual(await matchTrustedDevice(pool, 999, raw), null, 'el mismo token con otro user_id no debe matchear');

    pool.rows[0].expires_at = Date.now() - 1000;
    assert.strictEqual(await matchTrustedDevice(pool, 7, raw), null, 'un token vencido no debe matchear');
    pool.rows[0].expires_at = Date.now() + 86400000;

    await revokeAllTrustedDevices(pool, 7);
    assert.strictEqual(pool.rows.length, 0, 'revokeAll debe borrar todas las filas del usuario');

    console.log('trusted-devices self-check OK');
  })();
}
