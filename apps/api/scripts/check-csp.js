#!/usr/bin/env node
// Check ejecutable de CSP para el portal SSR. Requiere Postgres y un build web
// actualizado (`npm --prefix ../web run build`).
const assert = require('node:assert');
const http = require('node:http');
const { startApi, stopApi, waitForHealth } = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3995;
const BASE = `http://localhost:${PORT}`;

function startFixtureApi() {
  const article = {
    slug: 'csp-check',
    title: 'Nota para verificar CSP',
    dek: 'Fixture local sin escritura en la base.',
    section: 'Local',
    author_name: 'Check Bot',
    cover_image_url: null,
    published_at: '2026-08-01T12:00:00.000Z',
    is_sponsored: false,
    sponsor_name: null,
    body: 'Primer párrafo del check CSP.\n\nSegundo párrafo para comprobar el render completo.',
  };
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/public/articles/csp-check') return res.end(JSON.stringify(article));
    if (req.url?.startsWith('/api/public/articles?') || req.url === '/api/public/authors') return res.end('[]');
    res.statusCode = 404;
    res.end('{"error":"fixture no encontrado"}');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
  }));
}

function inspectPage(response, html, pathname) {
  assert.strictEqual(response.status, 200, `${pathname} respondió ${response.status}`);
  const csp = response.headers.get('content-security-policy') || '';
  const scriptSrc = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src ')) || '';
  const headerNonce = scriptSrc.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(headerNonce, `${pathname} no tiene nonce en script-src`);
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), `${pathname} permite unsafe-inline`);

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attrs, body] of scripts) {
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const tagNonce = attrs.match(/\bnonce="([^"]+)"/i)?.[1];
    assert.strictEqual(tagNonce, headerNonce, `${pathname} tiene un script inline sin el nonce de la cabecera: ${attrs.trim()} ${body.trim().slice(0, 120)}`);
  }
  return { headerNonce, scripts };
}

async function main() {
  const fixture = await startFixtureApi();
  const server = startApi({ port: PORT, env: { INTERNAL_API_BASE: fixture.base } });
  try {
    await waitForHealth(BASE);
    const paths = ['/comunidad', '/notas/csp-check'];
    const pages = await Promise.all(paths.map(async (pathname) => {
      const response = await fetch(BASE + pathname);
      const html = await response.text();
      return { pathname, html, ...inspectPage(response, html, pathname) };
    }));

    assert.notStrictEqual(pages[0].headerNonce, pages[1].headerNonce, 'dos respuestas reutilizaron el mismo nonce');
    assert.match(pages[1].html, /<script[^>]+type="application\/ld\+json"[^>]+nonce=/, 'la nota perdió JSON-LD con nonce');
    assert.ok(pages[1].scripts.filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs)).length >= 1, 'falta JSON-LD dinámico en la nota');
    assert.match(pages[1].html, /data-article-slug="csp-check"/, 'la nota perdió el slug para el conteo de vistas');

    const assetSources = new Set(pages.flatMap(({ scripts }) => scripts
      .map(([, attrs]) => attrs.match(/\bsrc="([^"]+)"/i)?.[1])
      .filter(Boolean)));
    assert.ok(assetSources.size >= 4, 'los scripts de interacción no salieron como archivos externos');
    let viewScriptFound = false;
    let menuScriptFound = false;
    for (const src of assetSources) {
      assert.match(src, /^\/_astro\//, `script externo inesperado: ${src}`);
      const asset = await fetch(BASE + src);
      assert.strictEqual(asset.status, 200, `no se pudo cargar ${src}`);
      const source = await asset.text();
      if (source.includes('/view')) viewScriptFound = true;
      if (source.includes('Escape') && source.includes('aria-expanded')) menuScriptFound = true;
    }
    assert.ok(viewScriptFound, 'la nota perdió el script externo de conteo de vistas');
    assert.ok(menuScriptFound, 'el menú perdió el cierre por Escape o su estado aria-expanded');

    console.log('OK: CSP con nonce por respuesta, scripts inline autorizados y assets externos.');
  } finally {
    await stopApi(server);
    await new Promise((resolve) => fixture.server.close(resolve));
  }
}

main().catch((err) => {
  console.error('CHECK CSP FAILED:', err.message);
  process.exit(1);
});
