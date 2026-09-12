#!/usr/bin/env node
// RADAR 2.0, fase 6 (R2-36): check de función pura para lib/renders/ — sin
// red ni DB, mismo patrón que check-draft-body.js.
const assert = require('node:assert');
const { buildMasterObject, renderWeb, renderWhatsapp, renderSocial, renderAudio } = require('../src/lib/renders');

// --- buildMasterObject: con análisis, sin análisis (fallback a proposal), sin ninguno de los dos ---
{
  const topic = { title: 'Corte de agua en el centro de Perote' };
  const analysis = {
    que_paso: { resumen: 'El ayuntamiento reportó un corte programado.' },
    por_que_importa: 'Afecta a cientos de familias.',
    contexto: 'Es el tercer corte del mes.',
    para_el_ciudadano: 'Llena tinacos antes de las 8am.',
    relevancia_perote: 'Perote depende de este pozo.',
    implicaciones: ['Podría extenderse a otras colonias.'],
  };
  const master = buildMasterObject({ topic, analysis, proposal: null });
  assert.strictEqual(master.title, topic.title);
  assert.strictEqual(master.resumen, analysis.que_paso.resumen);
  assert.strictEqual(master.contexto, analysis.contexto);
  assert.strictEqual(master.cierre, analysis.para_el_ciudadano);
  assert.deepStrictEqual(master.implicaciones, analysis.implicaciones);
}

{
  // Sin topic ni analysis (tema borrado, migración 024): cae a la propuesta.
  const proposal = { title: 'Nota sin tema de origen', dek: 'Bajada de la nota' };
  const master = buildMasterObject({ topic: null, analysis: null, proposal });
  assert.strictEqual(master.title, proposal.title);
  assert.strictEqual(master.resumen, proposal.dek);
  assert.strictEqual(master.contexto, null);
  assert.strictEqual(master.cierre, null);
  assert.deepStrictEqual(master.implicaciones, []);
}

assert.throws(() => buildMasterObject({ topic: null, analysis: null, proposal: null }), /requiere topic\.title o proposal\.title/);

// --- renderWeb: {title, dek, body} ---
{
  const master = { title: 'Tema', resumen: 'Resumen.', contexto: 'Contexto.', cierre: 'Cierre.', implicaciones: ['Podría pasar X.'] };
  const web = renderWeb(master);
  assert.strictEqual(web.title, 'Tema');
  assert.strictEqual(web.dek, 'Resumen.');
  assert.ok(web.body.includes('Resumen.'));
  assert.ok(web.body.includes('Contexto.'));
  assert.ok(web.body.includes('Lo que podría pasar después: Podría pasar X.'));
  assert.ok(web.body.includes('Cierre.'));
}
{
  // Sin nada más que el título: body vacío, no revienta.
  const web = renderWeb({ title: 'Solo título', resumen: null, contexto: null, cierre: null, implicaciones: [] });
  assert.strictEqual(web.body, '');
  assert.strictEqual(web.dek, null);
}

// --- renderWhatsapp: título en negritas + resumen + cierre + link ---
{
  const master = { title: 'Tema', resumen: 'Resumen.', contexto: 'Contexto.', cierre: 'Cierre.', implicaciones: [] };
  const text = renderWhatsapp(master, 'https://crea-contenidos.com/notas/tema');
  assert.ok(text.startsWith('*Tema*'));
  assert.ok(text.includes('Resumen.'));
  assert.ok(text.includes('Cierre.'));
  assert.ok(text.endsWith('https://crea-contenidos.com/notas/tema'));
  assert.ok(!text.includes('Contexto.'), 'whatsapp no debe incluir el contexto largo');
}
{
  // Sin url: no revienta, no deja un salto de línea colgando al final.
  const text = renderWhatsapp({ title: 'Tema', resumen: null, contexto: null, cierre: null, implicaciones: [] }, null);
  assert.strictEqual(text, '*Tema*');
}

// --- renderSocial: título + resumen + cierre, sin contexto ---
{
  const master = { title: 'Tema', resumen: 'Resumen.', contexto: 'Contexto largo que no va en el post.', cierre: 'Cierre.', implicaciones: [] };
  const text = renderSocial(master);
  assert.ok(text.startsWith('Tema'));
  assert.ok(text.includes('Resumen.'));
  assert.ok(text.includes('Cierre.'));
  assert.ok(!text.includes('Contexto largo'));
}

// --- renderAudio: guion narrado, oraciones separadas por espacio ---
{
  const master = { title: 'Tema', resumen: 'Resumen.', contexto: 'Contexto.', cierre: 'Cierre.', implicaciones: [] };
  const script = renderAudio(master);
  assert.strictEqual(script, 'Tema. Resumen. Contexto. Cierre.');
}

console.log('✔ check-renders pasó: lib/renders/ (R2-36) — funciones puras sin red ni DB.');
