// CREA Score (RADAR 2.0, punto 12, R2-25). Puro — sin acceso a DB, testeable
// exactamente como topic-verification.js. Recibe el tema + su análisis (si
// existe) + los insumos de originalidad que el caller ya resolvió (esos SÍ
// necesitan DB: similarity() contra content_proposals publicadas — mismo
// mecanismo que ya usa la canibalización en content-engine/index.js).
// Fórmula, pesos y perillas documentados en docs/ia/crea-score.md (R2-24).
//
// El score ordena, nunca decide (regla no negociable de la fase): esto solo
// calcula números, no oculta ni descarta nada — eso lo hace, si acaso, quien
// llame a esta función y decida qué mostrar.

const TERRITORIAL_SCOPE_SCORE = { local: 100, regional: 70, estatal: 40, nacional: 20, internacional: 5 };
const IMPLICACIONES_UNIT = 25; // cada implicación documentada suma esto, tope 100
const ACTUALIDAD_DECAY_DAYS = 14; // días para decaer de 100 a 0
const SOURCE_COUNT_UNIT = 25; // cada fuente independiente suma esto, tope 100
const RELIABILITY_BONUS_CAP = 15; // ±15 según balance de evidence.reliable
const MENTIONS_UNIT = 2; // interés ciudadano: 50 menciones ya satura el factor

// Pesos provisionales (se calibran con datos reales, mismo criterio que
// confidence — ver docs/ia/crea-score.md). interes_ciudadano queda bajo a
// propósito: mentions está sesgado a Facebook (único origen con engagement
// real) — un peso alto reintroduciría viralidad por la puerta de atrás,
// justo lo que confidence evita explícitamente.
const WEIGHTS = {
  relevancia_local: 15,
  impacto_potencial: 15,
  actualidad: 15,
  fuentes: 15,
  interes_ciudadano: 5,
  implicaciones_practicas: 15,
  conversacion: 10,
  originalidad: 10,
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Factor 1 — relevancia local. Ausente sin territorial_scope (temas sin
// ingesta externa, fase 02).
function scoreRelevanciaLocal(topic) {
  const scope = topic && topic.territorial_scope;
  if (!scope || !Object.prototype.hasOwnProperty.call(TERRITORIAL_SCOPE_SCORE, scope)) return null;
  return TERRITORIAL_SCOPE_SCORE[scope];
}

// Factor 2 — impacto potencial. Solo nivel 3 llena implicaciones (fase 03);
// ausente con nivel 1/2 o sin análisis.
function scoreImpactoPotencial(analysis) {
  if (!analysis || !Array.isArray(analysis.implicaciones) || !analysis.implicaciones.length) return null;
  return clamp(analysis.implicaciones.length * IMPLICACIONES_UNIT, 0, 100);
}

// Factor 3 — actualidad. NUNCA ausente: event_date es preferido, pero
// detected_at siempre existe (NOT NULL en topics) como respaldo.
function scoreActualidad(topic, now) {
  const base = (topic && (topic.event_date || topic.detected_at)) || null;
  if (!base) return null;
  const baseMs = new Date(base).getTime();
  if (!Number.isFinite(baseMs)) return null;
  const days = ((now || new Date()).getTime() - baseMs) / 86400000;
  return clamp(100 - Math.max(0, days) * (100 / ACTUALIDAD_DECAY_DAYS), 0, 100);
}

// Factor 4 — número y calidad de fuentes. "Completo hoy": source_count
// siempre existe tras normalizeVerification(); el bonus de calidad lee
// evidence[].reliable, que ya llena applyTrustFromSources().
function scoreFuentes(topic) {
  const count = Number(topic && topic.source_count);
  if (!Number.isFinite(count)) return null;
  const base = clamp(count * SOURCE_COUNT_UNIT, 0, 100);
  const evidence = Array.isArray(topic && topic.evidence) ? topic.evidence : [];
  const reliable = evidence.filter((e) => e && e.reliable === true).length;
  const unreliable = evidence.filter((e) => e && e.reliable === false).length;
  const bonus = clamp((reliable - unreliable) * 5, -RELIABILITY_BONUS_CAP, RELIABILITY_BONUS_CAP);
  return clamp(base + bonus, 0, 100);
}

// Factor 5 — interés ciudadano. Nunca ausente (mentions default 0 es un dato
// real, no uno faltante) — ver advertencia de sesgo a Facebook en el doc.
function scoreInteresCiudadano(topic) {
  const mentions = Number(topic && topic.mentions);
  if (!Number.isFinite(mentions)) return null;
  return clamp(mentions * MENTIONS_UNIT, 0, 100);
}

// Factor 6 — implicaciones prácticas. para_el_ciudadano ya lo llena el nivel
// 1 (el más barato) — no hace falta nivel 3 para este factor, a diferencia
// del factor 2. Binario a propósito: es texto cualitativo, sin una escala
// objetiva mejor sin sobre-ingenierizar.
function scoreImplicacionesPracticas(analysis) {
  if (!analysis || !analysis.para_el_ciudadano) return null;
  return 100;
}

// Factor 7 — conversación detectada. SIEMPRE ausente hoy: conversacion es
// NULL por diseño hasta que 08-conversacion-digital.md se resuelva (regla no
// negociable de la fase 03) — no se inventa con sentiment/mentions
// disfrazados. R2-48 (fase 08) es quien activará este factor de verdad.
function scoreConversacion(analysis) {
  if (!analysis || analysis.conversacion == null) return null;
  return null; // placeholder: cuando exista contenido real, se define aquí
}

// Factor 8 — originalidad del tratamiento. Invierte el gradiente de
// similarity() que canibalización usa como portón binario
// (content-engine/index.js). El caller resuelve maxSimilarityToPublished
// (necesita DB) y lo pasa acá — esta función sigue pura.
function scoreOriginalidad(inputs) {
  const sim = inputs && inputs.maxSimilarityToPublished;
  if (sim == null || !Number.isFinite(Number(sim))) return null;
  return clamp(Math.round((1 - Number(sim)) * 100), 0, 100);
}

/**
 * Calcula el CREA Score: promedio ponderado de los factores PRESENTES
 * (no de los 8 fijos) — un tema con menos datos no arranca en desventaja
 * frente a uno con análisis completo, solo se evalúa con lo que sí se sabe.
 * Factores ausentes no rompen ni inflan el resultado: se excluyen del
 * cálculo y quedan marcados como tal en el desglose.
 *
 * @param {object} topic fila de `topics` (o subconjunto con los campos usados)
 * @param {object|null} [analysis] fila más reciente de `editorial_analyses`, o null
 * @param {{ maxSimilarityToPublished?: number|null }} [inputs] insumos que el
 *   caller ya resolvió contra DB
 * @returns {{ score: number|null, breakdown: Record<string, { score: number|null, weight: number, present: boolean }> }}
 *   score es null (no 0) si ningún factor estuvo presente — no debería pasar
 *   en la práctica, ya que actualidad siempre tiene detected_at.
 */
function calculateCreaScore(topic, analysis, inputs) {
  const raw = {
    relevancia_local: scoreRelevanciaLocal(topic),
    impacto_potencial: scoreImpactoPotencial(analysis),
    actualidad: scoreActualidad(topic),
    fuentes: scoreFuentes(topic),
    interes_ciudadano: scoreInteresCiudadano(topic),
    implicaciones_practicas: scoreImplicacionesPracticas(analysis),
    conversacion: scoreConversacion(analysis),
    originalidad: scoreOriginalidad(inputs),
  };

  const breakdown = {};
  let weightedSum = 0;
  let weightTotal = 0;
  for (const key of Object.keys(WEIGHTS)) {
    const value = raw[key];
    const present = value != null;
    breakdown[key] = { score: present ? Math.round(value) : null, weight: WEIGHTS[key], present };
    if (present) {
      weightedSum += value * WEIGHTS[key];
      weightTotal += WEIGHTS[key];
    }
  }

  const score = weightTotal > 0 ? clamp(Math.round(weightedSum / weightTotal), 0, 100) : null;
  return { score, breakdown };
}

module.exports = {
  calculateCreaScore,
  WEIGHTS,
  scoreRelevanciaLocal,
  scoreImpactoPotencial,
  scoreActualidad,
  scoreFuentes,
  scoreInteresCiudadano,
  scoreImplicacionesPracticas,
  scoreConversacion,
  scoreOriginalidad,
};
