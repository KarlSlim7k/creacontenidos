#!/usr/bin/env node
const assert = require('node:assert');

delete process.env.SENTRY_DSN;
const { DATA_COLLECTION, sanitizeEvent } = require('../src/instrument');

const event = sanitizeEvent({
  message: 'falló secret@example.com token=abc123',
  transaction: '/api/leads?email=secret@example.com',
  request: {
    method: 'POST',
    url: 'https://crea-contenidos.com/api/leads?email=secret@example.com',
    headers: { authorization: 'Bearer abc123', cookie: 'session=abc123' },
    cookies: { session: 'abc123' },
    query_string: 'email=secret@example.com',
    data: { email: 'secret@example.com' },
  },
  user: { email: 'secret@example.com' },
  extra: { prompt: 'contenido privado' },
  tags: { customer: 'secret@example.com' },
  contexts: { lead: { email: 'secret@example.com' } },
  breadcrumbs: [{ message: 'Bearer abc123' }],
  fingerprint: ['secret@example.com'],
  exception: {
    values: [{ value: 'Bearer abc123 para secret@example.com', mechanism: { data: { jwt: 'abc123' } } }],
  },
});

assert.deepStrictEqual(event.request, { method: 'POST', url: 'https://crea-contenidos.com/api/leads' });
assert.strictEqual(event.transaction, '/api/leads');
assert(!JSON.stringify(event).includes('secret@example.com'));
assert(!JSON.stringify(event).includes('abc123'));
assert(!('user' in event));
assert(!('extra' in event));
assert(!('breadcrumbs' in event));
assert.strictEqual(DATA_COLLECTION.userInfo, false);
assert.strictEqual(DATA_COLLECTION.cookies, false);
assert.deepStrictEqual(DATA_COLLECTION.httpBodies, []);
assert.strictEqual(DATA_COLLECTION.urlQueryParams, false);
assert.deepStrictEqual(DATA_COLLECTION.genAI, { inputs: false, outputs: false });
assert.strictEqual(DATA_COLLECTION.stackFrameVariables, false);

console.log('✔ check-sentry pasó: eventos sin PII, secretos, cuerpos ni consultas.');
