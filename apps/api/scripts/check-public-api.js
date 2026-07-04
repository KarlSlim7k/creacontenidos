#!/usr/bin/env node
// Check ejecutable de Fase 0 + Fase 1 (API pública de lectura).
// Uso: node scripts/check-public-api.js   (requiere Postgres arriba)
// Corre migrate + seed (dos veces: idempotencia), levanta la API en :3999,
// verifica los 3 endpoints, el gate editorial (pending nunca aparece),
// el 404 de slug inexistente y el 429 bajo ráfaga. Mata el server al final.
const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const config = require(path.join(ROOT, 'src/config'));

async function getJson(url) {
  const res = await fetch(url);
  return { status: res.status, body: res.status === 429 ? null : await res.json() };
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch (_) { /* aún no arranca */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('La API no levantó en :' + PORT);
}

async function main() {
  // 0. migrate + seed re-ejecutables (seed dos veces = mismo resultado)
  execFileSync('node', ['src/db/migrate.js'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('node', ['src/db/seed.js'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('node', ['src/db/seed.js'], { cwd: ROOT, stdio: 'inherit' });

  // Fixture: un artículo pending CON slug — jamás debe salir por la API pública.
  const pool = new Pool({ connectionString: config.databaseUrl });
  await pool.query(`
    INSERT INTO content_proposals (format, status, title, slug, section, author_name, dek, body, published_at)
    VALUES ('nota', 'pending', '[check] nota pendiente oculta', 'check-pendiente-oculta', 'Local',
            'Check Bot', 'No debe aparecer.', 'Cuerpo de prueba.', now())
    ON CONFLICT (slug) DO UPDATE SET status = 'pending';
  `);
  const { rows: [{ count: publishedCount }] } = await pool.query(
    "SELECT count(*)::int AS count FROM content_proposals WHERE status = 'published'"
  );
  assert.strictEqual(publishedCount, 30, `seed idempotente: esperaba 30 publicados (24 + 6 patrocinados), hay ${publishedCount}`);
  await pool.end();

  const server = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitForHealth();

    // 1. Listado general: 30 publicados (24 + 6 patrocinados), orden published_at DESC, sin pendientes.
    let { status, body: list } = await getJson(`${BASE}/api/public/articles?limit=50`);
    assert.strictEqual(status, 200);
    assert.strictEqual(list.length, 30, `esperaba 30 artículos, obtuve ${list.length}`);
    for (let i = 1; i < list.length; i++) {
      assert.ok(new Date(list[i - 1].published_at) >= new Date(list[i].published_at), 'orden published_at DESC roto');
    }
    assert.ok(!list.some((a) => a.slug === 'check-pendiente-oculta'), 'un artículo pending apareció en el listado');
    assert.ok(list.every((a) => a.slug && a.section && a.author_name), 'faltan campos públicos en el listado');

    // 2. Filtro por sección + límite default/max.
    ({ status, body: list } = await getJson(`${BASE}/api/public/articles?section=Deportes`));
    assert.strictEqual(status, 200);
    assert.strictEqual(list.length, 4);
    assert.ok(list.every((a) => a.section === 'Deportes'));
    ({ body: list } = await getJson(`${BASE}/api/public/articles?limit=999`));
    assert.ok(list.length <= 50, 'limit no respeta el máximo de 50');

    // 3. Detalle por slug.
    let { status: s3, body: article } = await getJson(`${BASE}/api/public/articles/mercado-perote-temporada-alta-papa`);
    assert.strictEqual(s3, 200);
    assert.strictEqual(article.section, 'Local');
    assert.strictEqual(article.author_name, 'Carlos Mendoza');
    assert.ok(article.body && article.body.length > 100, 'el detalle no trae body');

    // 4. 404: slug inexistente y slug pending.
    assert.strictEqual((await fetch(`${BASE}/api/public/articles/no-existe-este-slug`)).status, 404);
    assert.strictEqual((await fetch(`${BASE}/api/public/articles/check-pendiente-oculta`)).status, 404, 'un pending es visible por slug');

    // 5. Artículos por autor.
    let { status: s5, body: byAuthor } = await getJson(`${BASE}/api/public/authors/${encodeURIComponent('Ana Torres')}/articles`);
    assert.strictEqual(s5, 200);
    assert.ok(byAuthor.length >= 1);
    assert.ok(byAuthor.every((a) => a.author_name === 'Ana Torres'));

    // 6. Rate limit: ráfaga hasta pasar 300 req/15min → 429. (Va al final:
    // deja la IP limitada en este proceso de server, que muere al salir.)
    const statuses = await Promise.all(
      Array.from({ length: 320 }, () => fetch(`${BASE}/api/public/articles?limit=1`).then((r) => r.status))
    );
    assert.ok(statuses.includes(429), 'la ráfaga nunca recibió 429');

    console.log('OK: API pública verificada (listado, sección, slug, autor, gate editorial, 404, 429).');
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('CHECK FAILED:', err.message);
  process.exit(1);
});
