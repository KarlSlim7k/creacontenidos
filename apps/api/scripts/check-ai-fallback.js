#!/usr/bin/env node
// Check ejecutable del fallback de modelo en chatComplete (docs/ia/politica-ia-y-gate-editorial.md
// §1.2, docs/ia/runbook-incidentes.md §1). No pega a Nous Portal real: mockea global.fetch para
// simular caída del modelo primario y verificar que chatComplete cae a AI_MODEL_FALLBACK, y que
// sin fallback configurado el error se propaga igual que antes (comportamiento no-regresivo).
const assert = require('node:assert');

process.env.NOUS_PORTAL_API_KEY = process.env.NOUS_PORTAL_API_KEY || 'check-key';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://check';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'check-secret';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : (process.env.NODE_ENV || 'development');

function fakeResponse(model, { ok, status, content }) {
  return {
    ok,
    status: status || 200,
    text: async () => (ok ? '' : `boom (${model})`),
    json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 42 } }),
  };
}

async function withFetchMock(mockFn, run) {
  const realFetch = global.fetch;
  global.fetch = mockFn;
  try {
    return await run();
  } finally {
    global.fetch = realFetch;
  }
}

async function main() {
  let n = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

  // --- Caso 1: sin AI_MODEL_FALLBACK configurado, el primario falla → error se propaga tal cual (no-regresión) ---
  delete process.env.AI_MODEL_FALLBACK;
  delete require.cache[require.resolve('../src/config')];
  delete require.cache[require.resolve('../src/lib/ai-client')];
  let ai = require('../src/lib/ai-client');

  await withFetchMock(
    async (url, opts) => {
      const model = JSON.parse(opts.body).model;
      return fakeResponse(model, { ok: false, status: 503 });
    },
    async () => {
      await assert.rejects(
        () => ai.chatComplete('sys', 'user', 'default'),
        /respondió 503/,
        'sin fallback configurado, el error del primario se propaga sin reintento'
      );
    }
  );
  ok(true, 'caso 1: sin AI_MODEL_FALLBACK, falla directo (comportamiento previo intacto)');

  // --- Caso 2: con AI_MODEL_FALLBACK configurado, el primario falla y el respaldo responde ---
  process.env.AI_MODEL_FALLBACK = 'fallback/model-x';
  delete require.cache[require.resolve('../src/config')];
  delete require.cache[require.resolve('../src/lib/ai-client')];
  ai = require('../src/lib/ai-client');
  const config = require('../src/config');
  ok(config.aiModelFallback === 'fallback/model-x', 'config.aiModelFallback lee AI_MODEL_FALLBACK');

  const calledModels = [];
  await withFetchMock(
    async (url, opts) => {
      const model = JSON.parse(opts.body).model;
      calledModels.push(model);
      if (model === config.aiModelDefault) return fakeResponse(model, { ok: false, status: 500 });
      return fakeResponse(model, { ok: true, content: 'respuesta del fallback' });
    },
    async () => {
      const result = await ai.chatComplete('sys', 'user', 'default');
      ok(result.content === 'respuesta del fallback', 'caso 2: chatComplete devuelve el contenido del modelo de respaldo');
      ok(result.model === 'fallback/model-x', 'caso 2: chatComplete reporta el modelo de respaldo usado');
      ok(result.usedFallback === true, 'caso 2: chatComplete marca usedFallback=true');
    }
  );
  ok(
    calledModels[0] === config.aiModelDefault && calledModels[1] === 'fallback/model-x',
    'caso 2: intenta primero el modelo primario y luego el de respaldo, en ese orden'
  );

  // --- Caso 3: primario Y respaldo fallan → error combinado con ambos mensajes ---
  await withFetchMock(
    async (url, opts) => {
      const model = JSON.parse(opts.body).model;
      return fakeResponse(model, { ok: false, status: 500 });
    },
    async () => {
      await assert.rejects(
        () => ai.chatComplete('sys', 'user', 'default'),
        (err) => err.message.includes('Primario:') && err.message.includes('Respaldo:'),
        'caso 3: si ambos fallan, el error incluye el motivo de los dos intentos'
      );
    }
  );
  ok(true, 'caso 3: error combinado cuando primario y respaldo fallan');

  // --- Caso 4: cuando el resultado exitoso es del primario, usedFallback queda en false ---
  await withFetchMock(
    async (url, opts) => {
      const model = JSON.parse(opts.body).model;
      return fakeResponse(model, { ok: true, content: 'respuesta del primario' });
    },
    async () => {
      const result = await ai.chatComplete('sys', 'user', 'default');
      ok(result.usedFallback === false, 'caso 4: usedFallback=false cuando el primario responde bien');
      ok(result.model === config.aiModelDefault, 'caso 4: model reporta el modelo primario');
    }
  );

  console.log(`\n✔ check-ai-fallback pasó (${n} asserts).`);
}

main().catch((err) => {
  console.error('\n✘ check-ai-fallback falló:', err.message);
  process.exit(1);
});
