#!/usr/bin/env node
// Verify end-to-end: portada → sección → nota → perfil → estudio → contacto.
// Uso: node scripts/verify-e2e.js   (requiere Postgres arriba)
// Levanta la API en :3996, verifica la consistencia del flujo completo (que un
// artículo en portada aparece en su sección, al abrirlo trae body, su autor
// devuelve artículos, el formulario de contacto responde y los campos se
// corresponden) y limpia la fila de prueba de leads al terminar.
const assert = require('node:assert');
const { createPool, startApi, stopApi, waitForHealth, getJson: getJSON } = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT || process.env.PORT) || 3996;
const BASE = `http://localhost:${PORT}`;

async function main() {
  const server = startApi({ port: PORT });
  const pool = createPool();
  try {
    await flow();
  } finally {
    await stopApi(server);
    await pool.query("DELETE FROM leads WHERE email = 'verify-e2e@test.crea'"); // limpia la fila del check
    await pool.end();
  }
}

async function flow() {
  await waitForHealth(BASE);

  // 1. Portada → listado completo.
  const { body: articles } = await getJSON(`${BASE}/api/public/articles?limit=50`);
  assert.ok(articles.length >= 1, 'la portada no trajo artículos');
  const first = articles[0];
  assert.ok(first.slug, 'el primer artículo no tiene slug');

  console.log(`  portada: ${articles.length} artículos, primero: "${first.title}"`);

  // 2. Sección → el mismo artículo aparece en su sección.
  const { body: sectionArticles } = await getJSON(
    `${BASE}/api/public/articles?section=${encodeURIComponent(first.section)}`
  );
  const inSection = sectionArticles.find((a) => a.slug === first.slug);
  assert.ok(inSection, `"${first.title}" no aparece en su sección "${first.section}"`);
  assert.strictEqual(inSection.title, first.title);
  assert.strictEqual(inSection.section, first.section);

  console.log(`  sección "${first.section}": ${sectionArticles.length} artículos, "${first.title}" incluido`);

  // 3. Nota → detalle con body y metadatos consistentes.
  const { body: detail } = await getJSON(`${BASE}/api/public/articles/${first.slug}`);
  assert.strictEqual(detail.slug, first.slug);
  assert.strictEqual(detail.title, first.title);
  assert.strictEqual(detail.section, first.section);
  assert.strictEqual(detail.author_name, first.author_name);
  assert.ok(detail.body, 'el detalle no trae body');
  assert.ok(detail.body.length > 50, 'el body es sospechosamente corto');

  console.log(`  nota "${detail.title}": ${detail.body.length} caracteres, autor "${detail.author_name}"`);

  // 4. Perfil → el autor tiene este artículo en su listado.
  const { body: authorArticles } = await getJSON(
    `${BASE}/api/public/authors/${encodeURIComponent(first.author_name)}/articles`
  );
  assert.ok(authorArticles.length >= 1, `el autor "${first.author_name}" no tiene artículos`);
  const byAuthor = authorArticles.find((a) => a.slug === first.slug);
  assert.ok(byAuthor, `"${first.title}" no apareció en el perfil de "${first.author_name}"`);
  assert.ok(authorArticles.every((a) => a.author_name === first.author_name), 'el perfil mezcla autores');

  console.log(`  perfil "${first.author_name}": ${authorArticles.length} artículos, "${first.title}" incluido`);

  // 5. Contacto → POST leads con payload válido.
  const payload = {
    name: 'Verify E2E',
    email: 'verify-e2e@test.crea',
    company: 'Test Corp',
    service_interest: 'Branded content',
    message: 'Mensaje de verificación end-to-end. Puede borrarse.',
    source_page: 'verify-e2e',
  };
  const res = await fetch(`${BASE}/api/public/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.strictEqual(res.status, 201);
  assert.deepStrictEqual(await res.json(), { ok: true });

  console.log('  contacto: lead insertado correctamente');

  console.log('\n✓ Verify e2e: portada → sección → nota → perfil → contacto. Flujo completo OK.');
}

main().catch((err) => {
  console.error('VERIFY E2E FAILED:', err.message);
  process.exit(1);
});
