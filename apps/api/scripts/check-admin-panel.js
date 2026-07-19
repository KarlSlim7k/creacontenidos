#!/usr/bin/env node
// Smoke test del panel admin (apps/admin/assets/js): carga el grafo de módulos ES
// completo con stubs de DOM y renderiza todas las pantallas con datos falsos.
// Atrapa imports rotos, identificadores sin importar y campos mal nombrados que
// pintan "undefined". No necesita servidor ni Postgres (grupo unit).
//
// El package.json raíz es "type": "commonjs", así que los .js del admin se copian
// a un tmpdir con su propio {"type":"module"} para poder importarlos desde Node.
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SRC = path.join(__dirname, '..', '..', 'admin', 'assets', 'js');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crea-admin-smoke-'));
  for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith('.js'))) {
    fs.copyFileSync(path.join(SRC, f), path.join(tmp, f));
  }
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');

  // ---------- stubs mínimos de navegador ----------
  const listeners = {};
  const appEl = { innerHTML: '', addEventListener(ev, fn) { listeners[ev] = fn; } };
  const fakeInput = { value: '', checked: false, focus() {}, style: {} };
  globalThis.document = {
    querySelector: (sel) => (sel.startsWith('meta') ? { content: 'http://localhost:3000' } : fakeInput),
    getElementById: (id) => (id === 'app' ? appEl : fakeInput),
    addEventListener: (ev, fn) => { listeners['doc:' + ev] = fn; },
  };
  globalThis.location = { hostname: 'localhost' };
  globalThis.localStorage = {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
  globalThis.window = globalThis;
  globalThis.confirm = () => false;
  globalThis.fetch = () => new Promise(() => {}); // nunca resuelve: solo se prueba render síncrono

  // ---------- carga del grafo ----------
  const mod = (f) => import(pathToFileURL(path.join(tmp, f)).href);
  await mod('main.js');
  const { state } = await mod('store.js');
  const { render } = await mod('router.js');
  const actions = await mod('actions.js');

  // DOMContentLoaded → delegación + tryResumeSession (sin token → login)
  listeners['doc:DOMContentLoaded']();
  assert(appEl.innerHTML.includes('padmin-login'), 'login no renderizó');

  // ---------- sesión + datos falsos para todas las pantallas ----------
  const prop = { id: 1, title: 'Nota', body: 'Cuerpo', section: 'Local', dek: 'd', slug: 's', status: 'borrador', author_id: 7, author_name: 'Ana', cover_image_url: '', is_sponsored: false, sponsor_name: '', updated_at: '2026-07-01', published_at: '2026-07-01', view_count: 3, review_comment: '', format: 'nota', angulo: 'a', sensibilidad: 'verde' };
  state.user = { id: 7, name: 'Test Director', role: 'director' };
  state.allowedModules = ['dashboard', 'radar', 'propuestas', 'ideas', 'editor', 'aprobacion', 'producciones', 'publicadas', 'comercial', 'leads', 'metricas', 'hermes', 'pipeline', 'configuracion'];
  state.data = Object.assign(state.data, {
    ideas: [{ id: 1, title: 'Idea', category: 'Local', column_status: 'nueva', score: 5, collaborator_name: 'Ana' }],
    proposalsByKey: { borrador: [prop], en_revision: [{ ...prop, id: 2, status: 'en_revision' }], published: [{ ...prop, id: 3, status: 'published' }], propuesta: [{ ...prop, id: 4, status: 'propuesta' }], rechazada: [{ ...prop, id: 5, status: 'rechazada' }], mine: [prop] },
    clients: [{ id: 1, name: 'Cliente', pipeline_stage: 'cerrado', interest: 'x', estimated_value: '$1', last_contact_at: '2026-07-01', website_url: '', sponsor_copy: '', last_sponsored_at: '2026-07-01' }],
    leads: [{ id: 1, name: 'Lead', company: 'ACME', email: 'a@b.c', service_interest: 'web', message: 'hola', status: 'nuevo', created_at: '2026-07-01T10:00:00Z' }],
    topics: [{ id: 1, title: 'Tema', source: 'Facebook', mentions: 4, sentiment: 'positivo', status: 'Nuevo', antecedentes: '', actores: '', angulos: '', audiencia: '' }],
    competitors: [{ id: 1, source_account: 'X', source_platform: 'facebook', post_text: 't', post_url: 'https://x', post_date: '2026-07-01', reactions: 1, comments: 2, shares: 3, analyzed: false }],
    users: [{ id: 7, name: 'Test', email: 't@t.t', role: 'director', active: true }],
    metrics: { piecesPublished: 2, weeklyGoal: 5, weeklyPieces: [{ week: '2026-W27', count: 2 }], topSections: [{ section: 'Local', count: 2 }], authors: [{ name: 'Ana', published: 2 }], totalPieces: 10, approvalRate: 80, avgDraftDays: 2 },
    socialPosts: [{ id: 1, network: 'tiktok', title: 'Video', external_url: 'https://t', position: 0, is_published: true, thumbnail_url: '' }],
    activity: [{ id: 1, action: 'scan', detail: 'ok', status: 'exito', created_at: '2026-07-01T10:00:00Z' }],
    integrations: [{ name: 'Resend', desc: 'mail', connected: true }],
    pipeline: [{ label: 'Paso', status: 'completado', at: '2026-07-01T10:00:00Z' }],
    notifications: [{ id: 1, action: 'x', detail: 'd', created_at: '2026-07-01T10:00:00Z' }],
    newsletterSettings: { enabled: true, send_hour: 7, send_minute: 30 },
    newsletterEvents: [{ id: 1, title: 'Evento', event_date: '2026-07-10' }],
    services: [{ id: 1, name: 'Paquete', price_label: '$1', description: 'd', cta_interest: 'Otro', features: ['a'], sort_order: 0, active: true }],
    roleModules: { director: ['dashboard'] },
    distLog: [{ proposal_id: 3, platform: 'whatsapp', status: 'ok', published_at: '2026-07-01T10:00:00Z' }],
    distChannels: [{ channel: 'whatsapp', label: 'WhatsApp', connected: true }],
    fbAccounts: [{ id: 1, label: 'Medio', handle_or_url: 'pagina', active: true }],
    siteMetrics: { monthly_reach_label: '42K', municipalities_count: 9, tercer_tiempo_listeners_label: '+1K', audience_age_18_24_pct: 30, audience_age_25_44_pct: 50, audience_age_45_plus_pct: 20, updated_at: '2026-07-01T10:00:00Z' },
  });
  state.newsletterContent = { weekday: 'jueves', date: '9 julio', clima: 'sol', notaDelDia: { titulo: 't', cuerpo: 'c' }, enBreve: ['a'], datoDelDia: 'd', agenda: '', patrocinador: null };
  state.newsletterSubscriberCount = 12;

  const screens = ['dashboard', 'ideas', 'editor', 'aprobacion', 'comercial', 'leads', 'metricas', 'radar', 'propuestas', 'producciones', 'publicadas', 'hermes', 'pipeline', 'configuracion', 'denegado'];
  for (const s of screens) {
    state.screen = s;
    if (s === 'configuracion') {
      for (const tab of ['usuarios', 'permisos', 'integraciones', 'newsletter', 'servicios', 'cuentas-fb', 'metricas-sitio']) {
        state.configTab = tab;
        render();
        assert(!appEl.innerHTML.includes('undefined'), `"undefined" en configuracion/${tab}`);
      }
    } else if (s === 'radar') {
      for (const tab of ['temas', 'competencia', 'fuentes']) { state.radarTab = tab; render(); }
      state.selectedRadarId = 1; render(); state.selectedRadarId = null;
    } else {
      render();
    }
    assert(appEl.innerHTML.length > 100, `pantalla ${s} renderizó vacía`);
    console.log('✓ render', s);
  }

  // editor con pieza abierta
  state.screen = 'editor';
  state.editorProposalId = 1;
  state.editorDraft = { title: 't', body: 'b', section: 'Local', dek: '', slug: '', cover_image_url: '', author_name: 'Ana', is_sponsored: false, sponsor_name: '', image_prompt: '' };
  render();
  console.log('✓ render editor (pieza abierta)');

  // ---------- delegación de eventos: logout no debe lanzar ----------
  const fakeEvent = (action) => ({ target: { closest: () => ({ getAttribute: (a) => (a === 'data-action' ? action : null) }) }, preventDefault() {} });
  actions.handleClick(fakeEvent('toggle-sound'));
  actions.handleClick(fakeEvent('logout'));
  assert(appEl.innerHTML.includes('padmin-login'), 'logout no regresó al login');
  console.log('✓ logout regresa al login');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('OK: smoke del panel admin pasó.');
}

main().catch((err) => {
  console.error('FAIL:', err.message || err);
  process.exit(1);
});
