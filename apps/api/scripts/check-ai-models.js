#!/usr/bin/env node
// Check externo y read-only: confirma que los modelos configurados siguen publicados.
const config = require('../src/config');

async function modelIds(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`catálogo respondió HTTP ${response.status}`);
  const json = await response.json();
  return new Set((json.data || []).map((model) => model.id));
}

async function main() {
  if (!config.nousPortalKey || !config.openrouterKey) throw new Error('faltan NOUS_PORTAL_API_KEY u OPENROUTER_API_KEY');
  const [nous, openrouter] = await Promise.all([
    modelIds('https://inference-api.nousresearch.com/v1/models', config.nousPortalKey),
    modelIds('https://openrouter.ai/api/v1/models?output_modalities=text', config.openrouterKey),
  ]);
  const expected = [
    ['Nous default', config.aiModelDefault, nous],
    ['Nous complex', config.aiModelComplex, nous],
    ['Nous QA', config.aiModelQa, nous],
    ['Nous fallback', config.aiModelFallback, nous],
    ['OpenRouter fallback', config.aiOpenRouterFallbackModel, openrouter],
  ];
  const missing = expected.filter(([, id, catalog]) => !id || !catalog.has(id));
  for (const [label, id, catalog] of expected) console.log(`${catalog.has(id) ? '✓' : '✗'} ${label}: ${id || '(vacío)'}`);
  if (missing.length) throw new Error(`${missing.length} modelo(s) no aparecen en su catálogo`);
  console.log('\n✔ Los cinco modelos configurados están disponibles.');
}

main().catch((error) => {
  console.error(`\n✘ check-ai-models falló: ${error.message}`);
  process.exit(1);
});
