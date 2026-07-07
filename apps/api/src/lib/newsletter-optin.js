// Doble opt-in del newsletter. Token sin estado (HMAC del email con JWT_SECRET):
// no necesita tabla ni migración — confirmar es idempotente y un token viejo
// sigue siendo válido (confirmar tarde no hace daño).
// ponytail: sin expiración; si se requiere caducidad, meter un timestamp firmado.
const crypto = require('crypto');
const config = require('../config');

function sign(email) {
  return crypto.createHmac('sha256', config.jwtSecret || 'dev-secret').update(email).digest('base64url');
}

function makeToken(email) {
  return Buffer.from(email).toString('base64url') + '.' + sign(email);
}

// Devuelve el email si la firma es válida, o null. Comparación timing-safe.
function readToken(token) {
  const [ePart, sig] = String(token || '').split('.');
  if (!ePart || !sig) return null;
  let email;
  try { email = Buffer.from(ePart, 'base64url').toString('utf8'); } catch { return null; }
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(email));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return email;
}

function confirmEmailHtml(confirmUrl) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#ECEAE2;font-family:Georgia,serif;color:#1F2A22;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;">
        <tr><td style="padding:24px 24px 16px;background:#2F5233;">
          <h1 style="margin:0;font-size:20px;color:#fff;">Buenos días, Perote</h1></td></tr>
        <tr><td style="padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px;">Casi listo. Confirma que quieres recibir el boletín diario de CREA Contenidos.</p>
          <p style="margin:0 0 24px;"><a href="${confirmUrl}" style="display:inline-block;background:#C77D2E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Confirmar suscripción</a></p>
          <p style="margin:0;font-size:12px;color:#6B6A60;">Si no fuiste tú, ignora este correo: no quedarás suscrito.</p>
        </td></tr></table></td></tr></table></body></html>`;
}

// Página simple que ve el usuario al hacer clic en el enlace del correo.
function confirmPage(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
    <body style="margin:0;background:#ECEAE2;font-family:Georgia,serif;color:#1F2A22;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;">
      <div style="max-width:420px;padding:24px;">
        <h1 style="font-size:24px;margin:0 0 12px;color:#2F5233;">${title}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">${body}</p>
        <a href="/" style="color:#C77D2E;font-weight:600;">Ir a CREA Contenidos &rarr;</a>
      </div></body></html>`;
}

module.exports = { makeToken, readToken, confirmEmailHtml, confirmPage };

// ponytail: self-check del camino de seguridad (firmar/verificar/rechazar).
if (require.main === module) {
  const assert = require('assert');
  const t = makeToken('a@b.com');
  assert.strictEqual(readToken(t), 'a@b.com', 'token válido debe devolver el email');
  assert.strictEqual(readToken(t + 'x'), null, 'firma alterada debe rechazarse');
  assert.strictEqual(readToken('garbage'), null, 'token malformado debe rechazarse');
  assert.strictEqual(readToken(Buffer.from('c@d.com').toString('base64url') + '.' + 'AAAA'), null, 'firma falsa debe rechazarse');
  console.log('newsletter-optin self-check OK');
}
