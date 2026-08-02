#!/usr/bin/env node
// Benchmark sintético y versionado. No usa temas, prompts ni contenido de producción.
const { requestNousCompletion, requestOpenRouterTextCompletion } = require('../src/lib/ai-client');
const { SECTIONS } = require('../src/lib/sections');

const VALID_SECTIONS = new Set(SECTIONS);
const CASES = [
  { name: 'propuesta-local', facts: 'El taller será en Perote el 8 de agosto de 2026. Entrada gratuita.', task: 'Redacta una propuesta informativa.', required: ['Perote', '8 de agosto'], forbidden: ['abierta a todo público', 'busca fomentar'], numbers: ['8', '2026'] },
  { name: 'aviso-servicio', facts: 'La biblioteca cerrará el lunes por mantenimiento y reabrirá el martes.', task: 'Redacta un aviso de servicio claro.', required: ['biblioteca', 'martes'] },
  { name: 'acentos', facts: 'Habrá música, exposición y participación de jóvenes.', task: 'Resume la actividad con español mexicano natural.', required: ['música', 'jóvenes'], forbidden: ['en vivo'] },
  { name: 'contenido-sensible', facts: 'Protección Civil reportó una revisión preventiva. No hay personas lesionadas.', task: 'Redacta sin alarmismo y marca sensibilidad amarillo.', required: ['preventiva', 'lesionadas'], forbidden: ['autoridades'], sensitivity: 'amarillo' },
  { name: 'dato-cerrado', facts: 'Se entregaron exactamente 12 árboles. No hay más cifras confirmadas.', task: 'Informa incluyendo la única cantidad confirmada, sin agregar otras.', required: ['12', 'árboles'], numbers: ['12'] },
  { name: 'rumor', facts: 'Circula un rumor sin fuente sobre el cierre de una escuela. No está confirmado.', task: 'Explica por qué no debe presentarse como hecho.', required: ['confirm'], forbidden: ['cerró la escuela'] },
  { name: 'sin-metricas', facts: 'Un comercio patrocina una jornada cultural. No entregó métricas ni montos.', task: 'Redacta una mención transparente sin inventar resultados.', required: ['patrocin'], forbidden: ['de la región'], numbers: [] },
  { name: 'qa-editorial', facts: 'Texto original: La reunión inicia a las diez de la mañana en el parque.', task: 'Devuelve una versión corregida y sobria sin cambiar el tiempo verbal.', required: ['reunión', 'inicia', 'parque'] },
  { name: 'newsletter', facts: 'Hoy habrá vacunación canina en el centro comunitario hasta las 14:00.', task: 'Escribe una entrada breve de newsletter.', required: ['vacunación', '14:00'], numbers: ['14', '00'] },
  { name: 'sin-fecha-inventada', facts: 'El comité anunció una próxima reunión, pero no informó fecha.', task: 'Redacta dejando explícito que la fecha no fue informada.', required: ['fecha', 'inform'], numbers: [] },
];

function args() {
  const values = process.argv.slice(2);
  const get = (flag) => values[values.indexOf(flag) + 1];
  return { provider: get('--provider'), model: get('--model'), show: values.includes('--show-output') };
}

function evaluate(test, raw) {
  const result = { json: false, facts: false, editorial: false, value: null };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const value = JSON.parse(match ? match[0] : raw);
    result.value = value;
    result.json = ['titulo', 'texto', 'seccion', 'sensibilidad'].every((key) => typeof value[key] === 'string') && VALID_SECTIONS.has(value.seccion);
    const combined = `${value.titulo} ${value.texto}`;
    const normalized = combined.toLocaleLowerCase('es-MX');
    const required = test.required.every((term) => normalized.includes(term.toLocaleLowerCase('es-MX')));
    const forbidden = (test.forbidden || []).every((term) => !normalized.includes(term.toLocaleLowerCase('es-MX')));
    const actualNumbers = combined.match(/\d+/g) || [];
    const allowedNumbers = test.numbers || [];
    result.facts = required && forbidden && actualNumbers.every((number) => allowedNumbers.includes(number));
    if (test.sensitivity) result.facts = result.facts && value.sensibilidad === test.sensitivity;
    result.editorial = value.titulo.length <= 120 && value.texto.length >= 40 && value.texto.length <= 700
      && !/[#*_]|\p{Extended_Pictographic}/u.test(combined)
      && !/no vas a creer|impactante|urgente/i.test(combined);
  } catch (_) {}
  return result;
}

async function main() {
  const options = args();
  if (!['nous', 'openrouter'].includes(options.provider) || !options.model) {
    throw new Error('uso: benchmark-ai-fallback.js --provider nous|openrouter --model ID [--show-output]');
  }
  const request = options.provider === 'nous' ? requestNousCompletion : requestOpenRouterTextCompletion;
  const system = `Eres editor de CREA Contenidos. Usa exclusivamente los hechos dados, sin inferir nombres, fechas, cifras ni resultados. Español mexicano sobrio, sin clickbait ni Markdown. Devuelve SOLO JSON válido con strings: titulo, texto, seccion (una de: ${SECTIONS.join(', ')}), sensibilidad (verde, amarillo o rojo).`;
  const results = [];
  for (const test of CASES) {
    const startedAt = Date.now();
    try {
      const response = await request(options.model, system, `HECHOS: ${test.facts}\nTAREA: ${test.task}`);
      const score = evaluate(test, response.content);
      results.push({ name: test.name, ...score, latencyMs: Date.now() - startedAt });
      console.log(`${score.json && score.facts && score.editorial ? '✓' : '✗'} ${test.name}: JSON=${score.json} hechos=${score.facts} editorial=${score.editorial} ${Date.now() - startedAt}ms`);
      if (options.show) console.log(JSON.stringify(score.value));
    } catch (error) {
      results.push({ name: test.name, json: false, facts: false, editorial: false, latencyMs: Date.now() - startedAt });
      console.log(`✗ ${test.name}: ${error.name || 'Error'} (${Date.now() - startedAt}ms)`);
    }
  }
  const summary = {
    provider: options.provider,
    model: options.model,
    json: results.filter((item) => item.json).length,
    facts: results.filter((item) => item.facts).length,
    editorial: results.filter((item) => item.editorial).length,
    averageLatencyMs: Math.round(results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length),
  };
  console.log(`\n${JSON.stringify(summary)}`);
  if (summary.json !== 10 || summary.facts !== 10 || summary.editorial < 8) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n✘ benchmark falló: ${error.message}`);
  process.exit(1);
});
