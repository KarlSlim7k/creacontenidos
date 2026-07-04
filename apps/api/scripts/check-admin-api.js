#!/usr/bin/env node
// Check ejecutable del panel admin (auth, editorial, listening, commercial).
// Uso: node scripts/check-admin-api.js   (requiere Postgres arriba)
// Corre migrate + seed (idempotencia), levanta la API en :3997, verifica:
// login + sesión por rol, 401/403, bandeja de ideas (alcance por colaborador),
// pipeline completo propuesta→borrador→en_revision→published (gate editorial),
// RADAR de solo lectura, kanban comercial. Revierte la fila de propuesta que usa
// para dejar el check re-ejecutable. Mata el server al final.
const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const path = require('node:path');
const { Pool } = require('pg');

const ROOT = path.join(__dirname, '..');
const PORT = 3997;
const BASE = `http://localhost:${PORT}`;
const config = require(path.join(ROOT, 'src/config'));

const DEV_PASSWORD = 'crea2026';

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch (_) { /* aún no arranca */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('La API no levantó en :' + PORT);
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  });
  assert.strictEqual(res.status, 200, `login falló para ${email}`);
  return (await res.json()).token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  execFileSync('node', ['src/db/migrate.js'], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('node', ['src/db/seed.js'], { cwd: ROOT, stdio: 'inherit' });

  const pool = new Pool({ connectionString: config.databaseUrl });
  const server = spawn('node', ['src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  let proposalId;
  try {
    await waitForHealth();

    // 1. Login + sesión por rol: allowedModules coincide con role-modules.js.
    const directorToken = await login('director@crearcontenidos.com');
    const produccionToken = await login('carlos.mendoza@crearcontenidos.com');
    const comercialToken = await login('comercial@crearcontenidos.com');
    const colaboradorToken = await login('tomas.ibarra@crearcontenidos.com');

    let session = await (await fetch(`${BASE}/api/auth/session`, { headers: auth(directorToken) })).json();
    assert.strictEqual(session.role, 'director');
    assert.ok(session.allowedModules.includes('configuracion'), 'director debe ver configuración');
    session = await (await fetch(`${BASE}/api/auth/session`, { headers: auth(colaboradorToken) })).json();
    assert.deepStrictEqual(session.allowedModules, ['ideas'], 'colaborador solo debe ver ideas');

    // 2. Login inválido → 401. Ruta protegida sin token → 401.
    assert.strictEqual(
      (await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'director@crearcontenidos.com', password: 'mal' }),
      })).status, 401
    );
    assert.strictEqual((await fetch(`${BASE}/api/editorial/ideas`)).status, 401);

    // 3. Usuario inactivo no puede loguear (Luisa Pérez, active=false en el seed).
    assert.strictEqual(
      (await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'luisa.perez@crearcontenidos.com', password: DEV_PASSWORD }),
      })).status, 401, 'un usuario inactivo pudo loguear'
    );

    // 4. Configuración/usuarios: 403 para rol no-director.
    assert.strictEqual((await fetch(`${BASE}/api/auth/users`, { headers: auth(comercialToken) })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/auth/users`, { headers: auth(directorToken) })).status, 200);

    // 5. Bandeja de ideas: colaborador crea una y solo ve las suyas; director ve todas.
    const created = await (await fetch(`${BASE}/api/editorial/ideas`, {
      method: 'POST', headers: { ...auth(colaboradorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '[check] idea de prueba', category: 'Local' }),
    })).json();
    let mine = await (await fetch(`${BASE}/api/editorial/ideas`, { headers: auth(colaboradorToken) })).json();
    assert.ok(mine.every((i) => i.collaborator_name === 'Tomás Ibarra'), 'colaborador ve ideas de otros');
    assert.ok(mine.some((i) => i.id === created.id));
    const all = await (await fetch(`${BASE}/api/editorial/ideas`, { headers: auth(directorToken) })).json();
    assert.ok(all.length >= mine.length, 'director debe ver la bandeja completa');
    assert.strictEqual((await fetch(`${BASE}/api/editorial/ideas/${created.id}`, {
      method: 'PATCH', headers: { ...auth(colaboradorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ column_status: 'aprobada' }),
    })).status, 403, 'colaborador no debería poder mover columnas');
    const moved = await (await fetch(`${BASE}/api/editorial/ideas/${created.id}`, {
      method: 'PATCH', headers: { ...auth(produccionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ column_status: 'en_analisis' }),
    })).json();
    assert.strictEqual(moved.column_status, 'en_analisis');
    await pool.query('DELETE FROM story_ideas WHERE id = $1', [created.id]);

    // 6. Pipeline de contenido completo: propuesta → borrador → en_revision → published.
    const proposals = await (await fetch(`${BASE}/api/editorial/proposals?status=propuesta`, { headers: auth(directorToken) })).json();
    assert.ok(proposals.length >= 1, 'no hay propuestas sembradas para el check');
    proposalId = proposals[0].id;

    let p = await (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/approve`, { method: 'PATCH', headers: auth(produccionToken) })).json();
    assert.strictEqual(p.status, 'borrador');
    assert.strictEqual(
      (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/approve`, { method: 'PATCH', headers: auth(produccionToken) })).status,
      409, 'aprobar dos veces debería fallar (ya no está en propuesta)'
    );

    p = await (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/draft`, {
      method: 'PATCH', headers: { ...auth(produccionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'check-e2e-admin-slug', section: 'Local', body: '[check] cuerpo de prueba' }),
    })).json();
    assert.strictEqual(p.slug, 'check-e2e-admin-slug');

    p = await (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/submit-review`, { method: 'PATCH', headers: auth(produccionToken) })).json();
    assert.strictEqual(p.status, 'en_revision');

    assert.strictEqual(
      (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/publish`, {
        method: 'PATCH', headers: { ...auth(produccionToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: '100% humano' }),
      })).status, 403, 'producción no debería poder publicar (gate editorial: solo director)'
    );
    assert.strictEqual(
      (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/publish`, {
        method: 'PATCH', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })).status, 400, 'publicar sin origin debería fallar'
    );
    p = await (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/publish`, {
      method: 'PATCH', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: '100% humano' }),
    })).json();
    assert.strictEqual(p.status, 'published');
    assert.ok(p.published_at);

    const onSite = await fetch(`${BASE}/api/public/articles/check-e2e-admin-slug`);
    assert.strictEqual(onSite.status, 200, 'la pieza publicada debe verse en el sitio público de inmediato');

    // 7. RADAR: solo lectura, filtro por fuente.
    const topics = await (await fetch(`${BASE}/api/listening/topics?source=TikTok`, { headers: auth(directorToken) })).json();
    assert.ok(topics.length >= 1 && topics.every((t) => t.source === 'TikTok'));
    assert.ok(topics[0].antecedentes, 'la ficha de contexto de RADAR no trae antecedentes');

    // 8. Comercial: kanban restringido a comercial/director, mover de columna.
    assert.strictEqual((await fetch(`${BASE}/api/commercial/clients`, { headers: auth(produccionToken) })).status, 403);
    const clients = await (await fetch(`${BASE}/api/commercial/clients`, { headers: auth(comercialToken) })).json();
    assert.ok(clients.length >= 1);
    const updated = await (await fetch(`${BASE}/api/commercial/clients/${clients[0].id}`, {
      method: 'PATCH', headers: { ...auth(comercialToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_stage: 'contactado' }),
    })).json();
    assert.strictEqual(updated.pipeline_stage, 'contactado');

    console.log('OK: panel admin verificado (auth por rol, ideas por colaborador, pipeline propuesta→publicada, RADAR, comercial).');
  } finally {
    server.kill();
    if (proposalId) {
      // Deja el check re-ejecutable: revierte la fila usada de vuelta a 'propuesta'.
      await pool.query(
        `UPDATE content_proposals SET status = 'propuesta', slug = NULL, section = NULL, body = NULL,
           origin = NULL, published_at = NULL, review_comment = NULL, updated_at = now()
         WHERE id = $1`,
        [proposalId]
      );
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error('CHECK FAILED:', err.message);
  process.exit(1);
});
