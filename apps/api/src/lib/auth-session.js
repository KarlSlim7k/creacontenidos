const crypto = require('node:crypto');
const config = require('../config');

const SESSION_COOKIE = 'crea_admin_session';
const PENDING_COOKIE = 'crea_admin_pending';
const CSRF_COOKIE = 'crea_admin_csrf';
const production = config.nodeEnv === 'production';

function cookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((out, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return out;
    try { out[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1)); } catch { /* cookie inválida */ }
    return out;
  }, {});
}

function cookie(name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Strict'];
  if (httpOnly) parts.push('HttpOnly');
  if (production) parts.push('Secure');
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

function csrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function setSession(res, token, { pending = false } = {}) {
  const csrf = csrfToken();
  res.append('Set-Cookie', cookie(pending ? PENDING_COOKIE : SESSION_COOKIE, token, { maxAge: pending ? 300 : 8 * 60 * 60 }));
  res.append('Set-Cookie', cookie(CSRF_COOKIE, csrf, { maxAge: pending ? 300 : 8 * 60 * 60, httpOnly: false }));
  if (pending) res.append('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0 }));
  else res.append('Set-Cookie', cookie(PENDING_COOKIE, '', { maxAge: 0 }));
}

function clearSession(res) {
  for (const name of [SESSION_COOKIE, PENDING_COOKIE, CSRF_COOKIE]) {
    res.append('Set-Cookie', cookie(name, '', { maxAge: 0, httpOnly: name !== CSRF_COOKIE }));
  }
}

function tokenFrom(req, pending = false) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return { token: header.slice(7), cookie: false };
  const token = cookies(req)[pending ? PENDING_COOKIE : SESSION_COOKIE];
  return token ? { token, cookie: true } : null;
}

function csrfIsValid(req) {
  const stored = cookies(req)[CSRF_COOKIE];
  const supplied = req.get('X-CSRF-Token');
  if (!stored || !supplied) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { setSession, clearSession, tokenFrom, csrfIsValid, SESSION_COOKIE, PENDING_COOKIE, CSRF_COOKIE };
