#!/usr/bin/env node
const assert = require('node:assert');

Object.assign(process.env, {
  NOUS_PORTAL_API_KEY: 'check-nous-secret',
  OPENROUTER_API_KEY: 'check-openrouter-secret',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://check',
  JWT_SECRET: process.env.JWT_SECRET || 'check-jwt-secret',
  NODE_ENV: 'development',
  AI_MODEL_DEFAULT: 'primary/model',
  AI_MODEL_FALLBACK: 'secondary/model',
  AI_OPENROUTER_FALLBACK_MODEL: 'openrouter/model',
  AI_TEXT_TIMEOUT_MS: '45000',
});

const { chatComplete } = require('../src/lib/ai-client');

function response(status, content, error) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => error || { model: 'returned/model', choices: [{ message: { content } }], usage: { total_tokens: 42 } },
  };
}

async function runCase(routes, check) {
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const provider = String(url).includes('openrouter.ai') ? 'openrouter' : 'nous';
    calls.push({ provider, model: body.model, headers: options.headers });
    return routes[`${provider}:${body.model}`];
  };
  try {
    await check(calls);
  } finally {
    global.fetch = realFetch;
  }
}

async function main() {
  let assertions = 0;
  const ok = (condition, message) => { assert.ok(condition, message); assertions++; };

  await runCase({ 'nous:primary/model': response(200, 'primario') }, async (calls) => {
    const result = await chatComplete('sys', 'user');
    ok(result.content === 'primario' && !result.usedFallback, '1. el primario responde sin fallback');
    ok(calls.length === 1 && result.provider === 'nous', '1. hace un solo intento en Nous');
  });

  await runCase({
    'nous:primary/model': response(503),
    'nous:secondary/model': response(200, 'secundario'),
  }, async (calls) => {
    const result = await chatComplete('sys', 'user');
    ok(result.content === 'secundario' && result.usedFallback, '2. usa el respaldo de Nous');
    ok(calls.map((call) => call.model).join(',') === 'primary/model,secondary/model', '2. conserva el orden de modelos');
  });

  await runCase({
    'nous:primary/model': response(404),
    'nous:secondary/model': response(503),
    'openrouter:openrouter/model': response(200, 'openrouter'),
  }, async (calls) => {
    const result = await chatComplete('sys', 'user');
    ok(result.content === 'openrouter' && result.provider === 'openrouter', '3. usa OpenRouter tras fallar ambos modelos Nous');
    ok(calls.length === 3 && calls[2].headers['HTTP-Referer'] && calls[2].headers['X-OpenRouter-Title'], '3. identifica el sitio ante OpenRouter');
  });

  await runCase({ 'nous:primary/model': response(401) }, async (calls) => {
    await assert.rejects(() => chatComplete('sys', 'user'), (error) => error.status === 401);
    assertions++;
    ok(calls.length === 1, '4. un error de autenticación no entra en bucle ni usa fallback');
  });

  const providerBodySecret = 'provider-body-must-not-leak';
  await runCase({
    'nous:primary/model': response(503, null, { error: providerBodySecret }),
    'nous:secondary/model': response(503, null, { error: providerBodySecret }),
    'openrouter:openrouter/model': response(503, null, { error: providerBodySecret }),
  }, async (calls) => {
    await assert.rejects(
      () => chatComplete('sys', 'user'),
      (error) => {
        ok(error.attempts.length === 3 && calls.length === 3, '5. reporta los tres intentos fallidos');
        ok(!error.message.includes(providerBodySecret) && !error.message.includes('check-openrouter-secret'), '5. el error combinado no filtra cuerpos ni credenciales');
        return true;
      }
    );
    assertions++;
  });

  console.log(`\n✔ check-ai-fallback pasó (${assertions} asserts, 5 casos).`);
}

main().catch((error) => {
  console.error('\n✘ check-ai-fallback falló:', error.message);
  process.exit(1);
});
