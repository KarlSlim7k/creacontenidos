// Recuperar contraseña (Panel Admin). Token HMAC sin estado (mismo espíritu que
// lib/newsletter-optin.js): nada que migrar ni limpiar. La firma incluye
// session_version — cambiar la contraseña la incrementa, así que el propio token
// se invalida solo al usarse (o si la sesión se cierra/rota antes), sin necesitar
// una tabla de tokens "usados".
const crypto = require('crypto');
const config = require('../config');

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h: ventana corta, es un link de correo.
const TOKEN_CLOCK_SKEW_MS = 5 * 60 * 1000;

function sign(payload) {
  return crypto.createHmac('sha256', config.jwtSecret).update('crea-password-reset\0').update(payload).digest('base64url');
}

function makeToken(userId, sessionVersion, now = Date.now()) {
  const payload = String(userId) + '.' + Math.floor(now / 1000).toString(36) + '.' + String(sessionVersion);
  return payload + '.' + sign(payload);
}

// Devuelve { userId, sessionVersion } si la firma es válida, o null. Comparación
// timing-safe. El caller debe releer session_version actual de DB y compararla
// contra la del token — acá solo se valida la firma y el vencimiento.
function readToken(token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [idPart, issuedPart, svPart, sig] = parts;
  if (!/^\d+$/.test(idPart) || !/^[0-9a-z]+$/.test(issuedPart) || !/^\d+$/.test(svPart)) return null;
  const payload = idPart + '.' + issuedPart + '.' + svPart;
  const issuedAt = parseInt(issuedPart, 36) * 1000;
  if (!Number.isSafeInteger(issuedAt)) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (issuedAt > now + TOKEN_CLOCK_SKEW_MS || now - issuedAt > TOKEN_TTL_MS) return null;
  return { userId: Number(idPart), sessionVersion: Number(svPart) };
}

function resetEmailHtml(resetUrl) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#ECEAE2;font-family:Georgia,serif;color:#1F2A22;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;">
        <tr><td style="padding:24px 24px 16px;background:#2F5233;">
          <h1 style="margin:0;font-size:20px;color:#fff;">CREA Panel Admin</h1></td></tr>
        <tr><td style="padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">Pediste recuperar tu contraseña del panel. El enlace vence en 1 hora.</p>
          <p style="margin:0 0 24px;"><a href="${resetUrl}" style="display:inline-block;background:#C77D2E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Elegir nueva contraseña</a></p>
          <p style="margin:0;font-size:12px;color:#6B6A60;">Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.</p>
        </td></tr></table></td></tr></table></body></html>`;
}

module.exports = { makeToken, readToken, resetEmailHtml, TOKEN_TTL_MS };

// ponytail: self-check del camino de seguridad (firmar/verificar/rechazar), igual
// que newsletter-optin.js.
if (require.main === module) {
  const assert = require('assert');
  const now = Date.now();
  const t = makeToken(42, 3, now);
  const decoded = readToken(t, now);
  assert.deepStrictEqual(decoded, { userId: 42, sessionVersion: 3 }, 'token válido debe devolver userId+sessionVersion');
  assert.deepStrictEqual(readToken(makeToken(42, 3, now + TOKEN_CLOCK_SKEW_MS), now), { userId: 42, sessionVersion: 3 }, 'deriva de reloj tolerable debe aceptarse');
  assert.strictEqual(readToken(t, now + TOKEN_TTL_MS + 1000), null, 'token vencido debe rechazarse');
  assert.strictEqual(readToken(t + 'x'), null, 'firma alterada debe rechazarse');
  assert.strictEqual(readToken('garbage'), null, 'token malformado debe rechazarse');
  assert.deepStrictEqual(readToken(makeToken(42, 4, now), now), { userId: 42, sessionVersion: 4 }, 'session_version distinto solo cambia el payload firmado, no invalida por sí solo (lo hace el caller al comparar contra DB)');
  console.log('password-reset self-check OK');
}
