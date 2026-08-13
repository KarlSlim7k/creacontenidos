#!/usr/bin/env node
// Check ejecutable del panel admin (auth, editorial, listening, commercial).
// Uso: node scripts/check-admin-api.js   (requiere Postgres arriba)
// Corre migrate + seed (idempotencia), levanta la API en :3997, verifica:
// login + sesión por rol, 401/403, bandeja de ideas (alcance por colaborador),
// pipeline completo propuesta→borrador→en_revision→published (gate editorial),
// reopen de una publicada (permisos, se cae del sitio, se puede republicar) y
// delete de una publicada (solo director, limpia published_content antes por la FK),
// RADAR de solo lectura, kanban comercial. Revierte la fila de propuesta que usa
// para dejar el check re-ejecutable. Mata el server al final.
const assert = require('node:assert');
const { authenticator } = require('otplib');
const { makeToken } = require('../src/lib/password-reset');
const {
  DEV_PASSWORD, runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth, login: loginAt, auth,
} = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3997;
const BASE = `http://localhost:${PORT}`;

function login(email) {
  return loginAt(BASE, email, DEV_PASSWORD);
}

async function main() {
  runMigrate();
  runSeed();

  const pool = createPool();
  const server = startApi({ port: PORT });

  let proposalId;
  let sensitiveProposalId;
  try {
    await waitForHealth(BASE);

    // 1. Login + sesión por rol: allowedModules coincide con role-modules.js.
    const directorToken = await login('director@crearcontenidos.com');
    const produccionToken = await login('carlos.mendoza@crearcontenidos.com');
    const comercialToken = await login('comercial@crearcontenidos.com');
    const colaboradorToken = await login('tomas.ibarra@crearcontenidos.com');

    let session = await (await fetch(`${BASE}/api/auth/session`, { headers: auth(directorToken) })).json();
    assert.strictEqual(session.role, 'director');
    assert.ok(session.allowedModules.includes('configuracion'), 'director debe ver configuración');
    session = await (await fetch(`${BASE}/api/auth/session`, { headers: auth(colaboradorToken) })).json();
    // Configuración es de todos los roles desde daa98a9, pero recortada: los no-director
    // solo ven Integraciones y Perfil (instalar la PWA, notificaciones y su cuenta).
    // El acceso a los tabs de director se corta en el backend, no aquí.
    assert.deepStrictEqual(session.allowedModules, ['ideas', 'configuracion'],
      'colaborador ve su bandeja de ideas y su propia configuración, nada más');

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
    assert.strictEqual((await fetch(`${BASE}/api/auth/users`, {
      method: 'POST', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Largo', email: 'largo@test.mx', password: 'x'.repeat(73), role: 'colaborador' }),
    })).status, 400, 'bcrypt solo usa 72 bytes: contraseñas más largas deben rechazarse');

    // El nav oculto no es autorización: las familias editoriales deben cortar
    // también llamadas directas de roles que no tienen esos módulos.
    assert.strictEqual((await fetch(`${BASE}/api/editorial/proposals`, { headers: auth(colaboradorToken) })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/editorial/ideas`, { headers: auth(comercialToken) })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/editorial/pipeline`, { headers: auth(comercialToken) })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/editorial/metrics`, { headers: auth(comercialToken) })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/listening/topics`, { headers: auth(colaboradorToken) })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/content/qa-check`, {
      method: 'POST', headers: { ...auth(comercialToken), 'Content-Type': 'application/json' }, body: '{}',
    })).status, 403);

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
    // Se descartan las de sensibilidad roja: publicarlas exige review_comment
    // (editorial-review.js) y este bloque prueba el camino feliz. Tomar proposals[0]
    // a ciegas ataba el check al orden del seed — si la primera fila resultaba roja,
    // fallaba con un 400 que no tenía nada que ver con lo que se está probando.
    // El gate de contenido sensible se prueba aparte, más abajo, con su propia fila.
    const noSensibles = proposals.filter((p) => p.sensibilidad !== 'rojo');
    assert.ok(noSensibles.length >= 1, 'no hay propuestas no sensibles sembradas para el check');
    proposalId = noSensibles[0].id;

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

    // 6b. Nota publicada: reopen para corregir. 403 para roles sin acceso, permitido a
    // producción (no solo director — reabrir no es un rechazo), se cae del sitio, 409
    // si ya no está en 'published', y puede volver a publicarse sin atajos.
    assert.strictEqual(
      (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/reopen`, { method: 'PATCH', headers: auth(colaboradorToken) })).status,
      403, 'colaborador no debería poder reabrir una publicada'
    );
    assert.strictEqual(
      (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/reopen`, { method: 'PATCH', headers: auth(comercialToken) })).status,
      403, 'comercial no debería poder reabrir una publicada'
    );
    p = await (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/reopen`, { method: 'PATCH', headers: auth(produccionToken) })).json();
    assert.strictEqual(p.status, 'borrador', 'producción debe poder reabrir una publicada');
    assert.strictEqual(
      (await fetch(`${BASE}/api/public/articles/check-e2e-admin-slug`)).status, 404,
      'una nota reabierta debe desaparecer del sitio público de inmediato'
    );
    assert.strictEqual(
      (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/reopen`, { method: 'PATCH', headers: auth(directorToken) })).status,
      409, 'reopen solo aplica cuando el estado es published'
    );
    p = await (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/submit-review`, { method: 'PATCH', headers: auth(produccionToken) })).json();
    assert.strictEqual(p.status, 'en_revision');
    p = await (await fetch(`${BASE}/api/editorial/proposals/${proposalId}/publish`, {
      method: 'PATCH', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: '100% humano' }),
    })).json();
    assert.strictEqual(p.status, 'published', 'debe poder republicarse tras reabrir y corregir');

    // 6c. Sensibilidad roja exige una devolución previa con comentario documentado.
    const { rows: [sensitive] } = await pool.query(
      `INSERT INTO content_proposals (format, title, body, status, section, slug, sensibilidad)
       VALUES ('nota', '[check] sensible', 'cuerpo de prueba', 'en_revision', 'Local', 'check-sensible-review', 'rojo')
       RETURNING id`
    );
    sensitiveProposalId = sensitive.id;
    let sensitivePublish = await fetch(`${BASE}/api/editorial/proposals/${sensitiveProposalId}/publish`, {
      method: 'PATCH', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: '100% humano' }),
    });
    assert.strictEqual(sensitivePublish.status, 400, 'sensibilidad roja sin revisión documentada no debe publicarse');
    assert.ok((await sensitivePublish.json()).fields.review_comment);
    p = await (await fetch(`${BASE}/api/editorial/proposals/${sensitiveProposalId}/return`, {
      method: 'PATCH', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: '[check] revisión sensible documentada' }),
    })).json();
    assert.strictEqual(p.status, 'borrador');
    p = await (await fetch(`${BASE}/api/editorial/proposals/${sensitiveProposalId}/submit-review`, {
      method: 'PATCH', headers: auth(produccionToken),
    })).json();
    assert.strictEqual(p.status, 'en_revision');
    p = await (await fetch(`${BASE}/api/editorial/proposals/${sensitiveProposalId}/publish`, {
      method: 'PATCH', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: '100% humano' }),
    })).json();
    assert.strictEqual(p.status, 'published', 'la pieza sensible puede publicarse después de documentar la revisión');

    // 7. RADAR: solo lectura, filtro por fuente.
    const topics = await (await fetch(`${BASE}/api/listening/topics?source=Facebook`, { headers: auth(directorToken) })).json();
    assert.ok(topics.length >= 1 && topics.every((t) => t.source === 'Facebook'));
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

    // 9. Permisos vivos: GET /api/auth/roles solo director; produccion incluye 'pipeline'.
    assert.strictEqual((await fetch(`${BASE}/api/auth/roles`, { headers: auth(comercialToken) })).status, 403);
    const roles = await (await fetch(`${BASE}/api/auth/roles`, { headers: auth(directorToken) })).json();
    assert.ok(roles.produccion.includes('pipeline'), 'produccion debe tener acceso al módulo pipeline');
    assert.ok(roles.comercial.includes('leads'), 'comercial debe tener acceso al módulo leads');

    // 10. Leads: alta pública → lista/estado/convertir a cliente; delete solo director.
    assert.strictEqual((await fetch(`${BASE}/api/public/leads`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '[check] lead', email: 'check-lead@test.mx', message: 'mensaje de prueba', service_interest: 'Básico' }),
    })).status, 201);
    let leads = await (await fetch(`${BASE}/api/commercial/leads?status=nuevo`, { headers: auth(comercialToken) })).json();
    const lead = leads.find((l) => l.name === '[check] lead');
    assert.ok(lead, 'el lead recién creado debe aparecer en la bandeja');
    assert.strictEqual((await fetch(`${BASE}/api/commercial/leads`, { headers: auth(produccionToken) })).status, 403);
    const marked = await (await fetch(`${BASE}/api/commercial/leads/${lead.id}`, {
      method: 'PATCH', headers: { ...auth(comercialToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contactado', notes: 'seguimiento' }),
    })).json();
    assert.strictEqual(marked.status, 'contactado');
    const client = await (await fetch(`${BASE}/api/commercial/leads/${lead.id}/convert`, {
      method: 'POST', headers: auth(comercialToken),
    })).json();
    assert.strictEqual(client.pipeline_stage, 'identificado', 'convertir debe crear el cliente en identificado');
    assert.strictEqual((await fetch(`${BASE}/api/commercial/leads/${lead.id}`, { method: 'DELETE', headers: auth(comercialToken) })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/commercial/leads/${lead.id}`, { method: 'DELETE', headers: auth(directorToken) })).status, 204);
    await pool.query('DELETE FROM clients WHERE id = $1', [client.id]);

    // 11. Distribución: whatsapp funciona sin credenciales y queda en la bitácora;
    // facebook sin env → 503; todo es solo-director.
    const wa = await fetch(`${BASE}/api/distribution/whatsapp`, {
      method: 'POST', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: proposalId }),
    });
    assert.strictEqual(wa.status, 200, 'whatsapp debe funcionar sin credenciales');
    const waBody = await wa.json();
    assert.ok(waBody.share_url && waBody.share_url.startsWith('https://wa.me/?text='));
    const distLog = await (await fetch(`${BASE}/api/distribution/log`, { headers: auth(directorToken) })).json();
    assert.ok(distLog.some((e) => e.proposal_id === proposalId && e.platform === 'whatsapp' && e.status === 'ok'));
    if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
      assert.strictEqual((await fetch(`${BASE}/api/distribution/facebook`, {
        method: 'POST', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      })).status, 503, 'facebook sin credenciales debe responder 503');
    }
    assert.strictEqual((await fetch(`${BASE}/api/distribution/whatsapp`, {
      method: 'POST', headers: { ...auth(produccionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: proposalId }),
    })).status, 403, 'distribuir es solo-director');
    await pool.query('DELETE FROM published_content WHERE proposal_id = $1', [proposalId]);

    // 12. Radar de competencia: CRUD sin IA (detect requiere PERPLEXITY_API_KEY — no se llama aquí).
    const { rows: [cpost] } = await pool.query(
      `INSERT INTO competitor_posts (source_platform, source_account, post_url, post_text)
       VALUES ('web', '[check] medio', 'https://example.com/check-post', 'texto de prueba') RETURNING id`
    );
    const cposts = await (await fetch(`${BASE}/api/listening/competitors?analyzed=false`, { headers: auth(directorToken) })).json();
    assert.ok(cposts.some((c) => c.id === cpost.id));
    const analyzed = await (await fetch(`${BASE}/api/listening/competitors/${cpost.id}`, {
      method: 'PATCH', headers: { ...auth(produccionToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyzed: true }),
    })).json();
    assert.strictEqual(analyzed.analyzed, true);
    assert.strictEqual((await fetch(`${BASE}/api/listening/competitors/${cpost.id}`, { method: 'DELETE', headers: auth(colaboradorToken) })).status, 403);
    assert.strictEqual((await fetch(`${BASE}/api/listening/competitors/${cpost.id}`, { method: 'DELETE', headers: auth(directorToken) })).status, 204);

    // 13. Métricas del sitio (Configuración → Métricas del sitio → estudio/*.html): solo director, PATCH parcial con COALESCE.
    assert.strictEqual((await fetch(`${BASE}/api/admin/site-metrics`, { headers: auth(produccionToken) })).status, 403);
    const metricsBefore = await (await fetch(`${BASE}/api/admin/site-metrics`, { headers: auth(directorToken) })).json();
    const metricsAfter = await (await fetch(`${BASE}/api/admin/site-metrics`, {
      method: 'PATCH', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthly_reach_label: '[check] 99K' }),
    })).json();
    assert.strictEqual(metricsAfter.monthly_reach_label, '[check] 99K');
    assert.strictEqual(metricsAfter.municipalities_count, metricsBefore.municipalities_count, 'PATCH parcial no debe tocar los campos no enviados');
    const publicMetrics = await (await fetch(`${BASE}/api/public/site-metrics`)).json();
    assert.strictEqual(publicMetrics.monthly_reach_label, '[check] 99K', 'el cambio debe verse de inmediato en el endpoint público');
    await pool.query('UPDATE site_metrics SET monthly_reach_label = $1 WHERE id = 1', [metricsBefore.monthly_reach_label]);

    // 14. Eliminar una nota publicada: solo director. published_content referencia
    // content_proposals SIN ON DELETE — antes de la limpieza agregada, borrar una
    // publicada con bitácora de distribución violaba la FK y el DELETE fallaba.
    const { rows: [pubRow] } = await pool.query(
      `INSERT INTO content_proposals (format, title, body, status, section, slug, origin, published_at)
       VALUES ('nota', '[check] nota publicada a borrar', 'cuerpo de prueba', 'published', 'Local', 'check-delete-published', '100% humano', now())
       RETURNING id`
    );
    await pool.query(
      `INSERT INTO published_content (proposal_id, platform, published_at, status) VALUES ($1, 'whatsapp', now(), 'ok')`,
      [pubRow.id]
    );
    assert.strictEqual(
      (await fetch(`${BASE}/api/editorial/proposals/${pubRow.id}`, { method: 'DELETE', headers: auth(produccionToken) })).status,
      403, 'producción no debería poder borrar una publicada'
    );
    assert.strictEqual(
      (await fetch(`${BASE}/api/editorial/proposals/${pubRow.id}`, { method: 'DELETE', headers: auth(directorToken) })).status,
      204, 'director debe poder borrar una publicada aunque tenga bitácora de distribución (FK published_content)'
    );
    const { rows: goneCheck } = await pool.query('SELECT id FROM content_proposals WHERE id = $1', [pubRow.id]);
    assert.strictEqual(goneCheck.length, 0, 'la nota publicada debió quedar eliminada');

    // 15. El último director no puede desactivarse ni dejar al equipo sin acceso.
    const { rows: [onlyDirector] } = await pool.query("SELECT id FROM users WHERE role = 'director' AND active = true");
    assert.strictEqual((await fetch(`${BASE}/api/auth/users/${onlyDirector.id}`, {
      method: 'PATCH', headers: { ...auth(directorToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    })).status, 409, 'se pudo desactivar al último director activo');

    // 16. Activar/desactivar 2FA rota la sesión; un token previo no hereda el
    // nuevo estado de seguridad y el login exige el segundo paso.
    const setup2fa = await (await fetch(`${BASE}/api/auth/2fa/setup`, { method: 'POST', headers: auth(comercialToken) })).json();
    const enableCode = authenticator.generate(setup2fa.secret);
    const enable2fa = await (await fetch(`${BASE}/api/auth/2fa/enable`, {
      method: 'POST', headers: { ...auth(comercialToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: enableCode }),
    })).json();
    assert.ok(enable2fa.token && enable2fa.backup_codes.length === 8);
    assert.strictEqual((await fetch(`${BASE}/api/auth/session`, { headers: auth(comercialToken) })).status, 401,
      'activar 2FA no revocó la sesión anterior');
    const pending2fa = await (await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'comercial@crearcontenidos.com', password: DEV_PASSWORD }),
    })).json();
    assert.strictEqual(pending2fa.requires_2fa, true);
    const verified2fa = await (await fetch(`${BASE}/api/auth/2fa/verify`, {
      method: 'POST', headers: { ...auth(pending2fa.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: authenticator.generate(setup2fa.secret) }),
    })).json();
    assert.ok(verified2fa.token, '2FA válido no emitió sesión completa');
    const disabled2fa = await (await fetch(`${BASE}/api/auth/2fa/disable`, {
      method: 'POST', headers: { ...auth(verified2fa.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: authenticator.generate(setup2fa.secret) }),
    })).json();
    assert.ok(disabled2fa.token && disabled2fa.ok);
    assert.strictEqual((await fetch(`${BASE}/api/auth/session`, { headers: auth(verified2fa.token) })).status, 401,
      'desactivar 2FA no revocó la sesión anterior');

    // 17. Navegador: sesión sólo en cookie HttpOnly, CSRF obligatorio y logout
    // revoca la versión del JWT (reusar la cookie anterior debe dar 401).
    const cookieLogin = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tomas.ibarra@crearcontenidos.com', password: DEV_PASSWORD }),
    });
    const setCookies = cookieLogin.headers.getSetCookie();
    assert.ok(setCookies.some((c) => c.startsWith('crea_admin_session=') && c.includes('HttpOnly') && c.includes('SameSite=Strict')));
    const cookieHeader = setCookies.map((c) => c.split(';', 1)[0]).join('; ');
    const csrfCookie = setCookies.find((c) => c.startsWith('crea_admin_csrf='));
    const csrf = decodeURIComponent(csrfCookie.split(';', 1)[0].split('=').slice(1).join('='));
    assert.strictEqual((await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader } })).status, 200);
    assert.strictEqual((await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookieHeader } })).status, 403,
      'logout con cookie pasó sin CSRF');
    assert.strictEqual((await fetch(`${BASE}/api/auth/logout`, {
      method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf },
    })).status, 204);
    assert.strictEqual((await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieHeader } })).status, 401,
      'la cookie anterior siguió válida después de logout');

    // 18. Recuperación: token de un solo uso incluso bajo carrera, revoca sesiones
    // y limpia cookies residuales. Sólo una de dos contraseñas simultáneas gana.
    const forgotStatuses = [];
    for (let i = 0; i < 4; i++) {
      forgotStatuses.push((await fetch(`${BASE}/api/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody-check@example.com' }),
      })).status);
    }
    assert.deepStrictEqual(forgotStatuses, [200, 200, 200, 429], 'forgot-password no limitó por cuenta');
    const { rows: [resetUser] } = await pool.query(
      "SELECT id, session_version FROM users WHERE email = 'tomas.ibarra@crearcontenidos.com'"
    );
    const resetToken = makeToken(resetUser.id, resetUser.session_version);
    const resetPasswords = ['check-reset-A-2026', 'check-reset-B-2026'];
    const resetResponses = await Promise.all(resetPasswords.map((password) => fetch(`${BASE}/api/auth/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password }),
    })));
    assert.deepStrictEqual(resetResponses.map((r) => r.status).sort(), [200, 400], 'el mismo token de reset ganó dos veces');
    const winner = resetPasswords[resetResponses.findIndex((r) => r.status === 200)];
    assert.ok(resetResponses.find((r) => r.status === 200).headers.getSetCookie().some((c) => c.includes('crea_admin_session=') && c.includes('Max-Age=0')),
      'reset no limpió la cookie de sesión anterior');
    assert.strictEqual((await fetch(`${BASE}/api/auth/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: 'check-reset-C-2026' }),
    })).status, 400, 'el token de reset pudo reutilizarse');
    assert.strictEqual((await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tomas.ibarra@crearcontenidos.com', password: DEV_PASSWORD }),
    })).status, 401, 'la contraseña anterior siguió funcionando tras el reset');
    assert.strictEqual((await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tomas.ibarra@crearcontenidos.com', password: winner }),
    })).status, 200, 'la contraseña ganadora del reset no funciona');

    console.log('OK: panel admin verificado (roles, sesiones, CSRF, 2FA, recuperación de contraseña y módulos).');
  } finally {
    await stopApi(server);
    if (proposalId) {
      // Deja el check re-ejecutable: revierte la fila usada de vuelta a 'propuesta'.
      await pool.query(
        `UPDATE content_proposals SET status = 'propuesta', slug = NULL, section = NULL, body = NULL,
           origin = NULL, published_at = NULL, review_comment = NULL, updated_at = now()
         WHERE id = $1`,
        [proposalId]
      );
    }
    if (sensitiveProposalId) await pool.query('DELETE FROM content_proposals WHERE id = $1', [sensitiveProposalId]);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('CHECK FAILED:', err.message);
  process.exit(1);
});
