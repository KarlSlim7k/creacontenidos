#!/usr/bin/env node
// Check unitario de injectMeta (SSR de OG tags para nota.html, H11).
// Uso: node scripts/check-nota-ssr.js   (puro: sin Postgres ni server)
// Verifica que se inyecten title/description/og:* reales y que el título se
// escape (el HTML lo consumen crawlers y navegadores sin pasar por sanitizer).
const assert = require('node:assert');
const { injectMeta } = require('../src/lib/nota-ssr');

const BASE_HTML = [
  '<title>Nota · CREA Contenidos</title>',
  '<meta name="description" content="generico">',
  '<meta property="og:title" content="Nota · CREA Contenidos">',
  '<meta property="og:description" content="generico">',
  '<meta property="og:url" content="">',
  '<meta property="og:image" content="">',
].join('\n');

const SITE = 'https://crea-contenidos.com';

// 1) Inyección normal: valores reales, imagen relativa → absoluta, url con slug.
const out = injectMeta(BASE_HTML, {
  slug: 'nota-de-prueba', title: 'Título Real', dek: 'Bajada real',
  cover_image_url: '/api/public/images/abc',
}, SITE);
assert.ok(out.includes('<title>Título Real · CREA Contenidos</title>'), 'title inyectado');
assert.ok(out.includes('<meta property="og:title" content="Título Real · CREA Contenidos">'), 'og:title inyectado');
assert.ok(out.includes('<meta property="og:description" content="Bajada real">'), 'og:description inyectado');
assert.ok(out.includes('<meta property="og:url" content="https://crea-contenidos.com/nota.html?slug=nota-de-prueba">'), 'og:url absoluto con slug');
assert.ok(out.includes('<meta property="og:image" content="https://crea-contenidos.com/api/public/images/abc">'), 'og:image relativo → absoluto');

// 2) Escape: un título con HTML no debe romper el atributo ni inyectar markup.
const evil = injectMeta(BASE_HTML, {
  slug: 's', title: 'Hack"><script>alert(1)</script>', dek: '', cover_image_url: '',
}, SITE);
assert.ok(!/<script>alert\(1\)<\/script>/.test(evil), 'el <script> del título no sobrevive sin escapar');
assert.ok(evil.includes('&lt;script&gt;'), 'los < > del título quedan escapados');

// 3) Imagen ya absoluta se deja intacta.
const abs = injectMeta(BASE_HTML, { slug: 's', title: 'T', dek: '', cover_image_url: 'https://cdn.x/y.jpg' }, SITE);
assert.ok(abs.includes('content="https://cdn.x/y.jpg"'), 'imagen absoluta no se re-prefija');

console.log('✔ check-nota-ssr pasó (todos los asserts).');
