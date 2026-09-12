#!/usr/bin/env node
// La taxonomía de motivos editoriales (RADAR 2.0, R2-05) vive en dos lugares
// que no comparten workspace ni build (hallado en revisión de código):
//   - apps/api/src/lib/editorial-reasons.js (CommonJS, fuente de verdad del API)
//   - apps/admin/src/reasons.ts (TS, copia literal para el panel — Vite/SPA
//     sin acceso al código del API, mismo patrón que SECTIONS/lib/sections.js)
// Nada obligaba a mantenerlas iguales; este check las compara en cada corrida
// de la suite para que un futuro alta/baja/rename en una y no en la otra
// falle aquí en vez de desincronizar en silencio el dropdown del panel.
// Sin DB ni server — solo lee ambos archivos como texto/require.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REASON_CODES: apiReasonCodes } = require('../src/lib/editorial-reasons');

const ADMIN_REASONS_PATH = path.join(__dirname, '..', '..', 'admin', 'src', 'reasons.ts');

// apps/api no depende del compilador de TS del panel (Vite, bundle aparte) —
// se extrae el array literal por texto en vez de arrastrar esa dependencia
// solo para este check. Si la forma del literal cambia (no un objeto
// { code: '...', label: '...' } por línea), este regex deja de matchear y el
// check falla con "0 entradas" en vez de fallar en silencio.
function parseAdminReasonCodes() {
  const src = fs.readFileSync(ADMIN_REASONS_PATH, 'utf8');
  const entryRe = /\{\s*code:\s*'([^']+)',\s*label:\s*'([^']+)'\s*\}/g;
  const out = [];
  let m;
  while ((m = entryRe.exec(src))) out.push({ code: m[1], label: m[2] });
  return out;
}

const adminReasonCodes = parseAdminReasonCodes();
assert.ok(adminReasonCodes.length > 0, `no se pudo extraer REASON_CODES de ${ADMIN_REASONS_PATH} — ¿cambió la forma del literal?`);

assert.strictEqual(
  adminReasonCodes.length, apiReasonCodes.length,
  `apps/admin/src/reasons.ts tiene ${adminReasonCodes.length} motivo(s) y apps/api/src/lib/editorial-reasons.js tiene ${apiReasonCodes.length} — desincronizados`
);

const apiByCode = new Map(apiReasonCodes.map((r) => [r.code, r.label]));
for (const { code, label } of adminReasonCodes) {
  assert.ok(apiByCode.has(code), `el panel admin declara el motivo '${code}' pero el API no lo tiene en editorial-reasons.js`);
  assert.strictEqual(label, apiByCode.get(code), `el motivo '${code}' tiene labels distintos: admin="${label}" vs api="${apiByCode.get(code)}"`);
}

console.log(`✔ check-reason-codes-sync pasó: ${apiReasonCodes.length} motivo(s) coinciden entre api/lib/editorial-reasons.js y admin/src/reasons.ts.`);
