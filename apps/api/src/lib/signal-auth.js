// Auth de proveedores de señales externas (RADAR 2.0, R2-11). Sistema de auth
// de máquina, separado del JWT de usuario del panel — mismo principio que
// modules/telegram/index.js (secreto de webhook vs. sesión de director).
//
// La API key cruda existe una sola vez, al crearse/rotarse: se devuelve al
// caller y nunca se persiste — solo su hash SHA-256 (mismo patrón que
// lib/trusted-devices.js). La comparación es en tiempo constante
// (crypto.timingSafeEqual), como ya hace modules/telegram/index.js:14-18,
// contra cada proveedor activo — la tabla es chica (un puñado de
// proveedores), no miles de filas, así que no hace falta más que esto.
const crypto = require('crypto');

const KEY_PREFIX = 'csig_';

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey || '')).digest('hex');
}

/** Genera una key cruda nueva. Solo existe en este momento — el caller la muestra una vez y la descarta. */
function generateApiKey() {
  return KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Autentica una API key cruda contra los proveedores activos.
 * @returns {Promise<{id:number, name:string, trust:string}|null>}
 */
async function authenticateProvider(pool, rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const hash = hashApiKey(rawKey);
  const { rows } = await pool.query(
    `SELECT id, name, trust, api_key_hash FROM signal_providers WHERE active = true`
  );
  for (const row of rows) {
    if (safeEqual(hash, row.api_key_hash)) {
      return { id: row.id, name: row.name, trust: row.trust };
    }
  }
  return null;
}

/** Extrae la key del header Authorization: Bearer <key> (o null). */
function extractBearerKey(req) {
  const header = req.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

module.exports = { hashApiKey, generateApiKey, authenticateProvider, extractBearerKey };
