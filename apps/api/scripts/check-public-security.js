#!/usr/bin/env node
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'check-public-security-secret';
process.env.NODE_ENV = 'production';
process.env.PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || 'https://example.test';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.PUBLIC_SITE_URL;

const { rateLimitKey, isCloudflareProxy } = require('../src/lib/client-ip');
const { makeToken, readToken, TOKEN_TTL_MS, TOKEN_CLOCK_SKEW_MS } = require('../src/lib/newsletter-optin');
const { errorHandler } = require('../src/middleware/error-handler');

assert.ok(isCloudflareProxy('173.245.48.1'), 'rango IPv4 de Cloudflare no reconocido');
assert.ok(isCloudflareProxy('::ffff:173.245.48.1'), 'IPv4 mapeada a IPv6 de Cloudflare no reconocida');
assert.ok(isCloudflareProxy('2606:4700::1'), 'rango IPv6 de Cloudflare no reconocido');
assert.ok(!isCloudflareProxy('203.0.113.10'), 'IP directa confundida con Cloudflare');
assert.strictEqual(
  rateLimitKey({ ip: '203.0.113.10', headers: { 'cf-connecting-ip': '198.51.100.1' } }),
  '203.0.113.10',
  'una conexión directa pudo falsificar CF-Connecting-IP'
);
assert.strictEqual(
  rateLimitKey({ ip: '173.245.48.1', headers: { 'cf-connecting-ip': '198.51.100.1' } }),
  '198.51.100.1',
  'una conexión real desde Cloudflare perdió la IP del visitante'
);

const now = Date.now();
const token = makeToken('audit@example.com', now);
assert.strictEqual(readToken(token, now), 'audit@example.com', 'token recién emitido rechazado');
assert.strictEqual(readToken(makeToken('audit@example.com', now + TOKEN_CLOCK_SKEW_MS), now), 'audit@example.com', 'deriva de reloj tolerable rechazada');
assert.strictEqual(readToken(token, now + TOKEN_TTL_MS + 1000), null, 'token vencido aceptado');

let response;
const originalConsoleError = console.error;
console.error = () => {};
try {
  errorHandler(
    Object.assign(new SyntaxError("Unexpected token '<'"), { status: 400, type: 'entity.parse.failed' }),
    {},
    { status(code) { response = { code }; return this; }, json(body) { response.body = body; } },
    () => {}
  );
} finally {
  console.error = originalConsoleError;
}
assert.deepStrictEqual(response, { code: 400, body: { error: 'JSON inválido' } });

console.log('OK: fixes públicos verificados (proxy confiable, token con caducidad, error JSON genérico).');
