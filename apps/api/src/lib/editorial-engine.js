// Motor Editorial CREA (RADAR 2.0, punto 11, R2-19). Un prompt por nivel —
// no uno monolítico con los 8 campos siempre. Puro donde se puede
// (buildPrompt/sanitizeAnalysis, sin red ni DB, testeables solos), la
// llamada real a chatComplete() vive en generateAnalysis(). Niveles, campos
// y disparo: docs/ia/motor-editorial-crea.md (R2-17) — decisión: los 3
// niveles son siempre un clic humano explícito, ninguno se dispara solo.
const { chatComplete, parseJson, directiveBlock, logActivity } = require('./ai-client');

const EDITORIAL_ANALYSIS_FIELDS = `id, topic_id, analysis_level, que_paso, por_que_importa,
  contexto, datos, implicaciones, conversacion, pendientes, relevancia_perote,
  para_el_ciudadano, model, provider, tokens_used, created_by, created_at`;

// Campos que llena cada nivel (docs/ia/motor-editorial-crea.md). 'conversacion'
// (campo 6, "¿qué se está diciendo?") nunca aparece acá en ningún nivel — es
// responsabilidad exclusiva de 08-conversacion-digital.md (R2-48); queda NULL
// explícito, nunca inventado con sentiment/mentions disfrazados.
const LEVEL_FIELDS = {
  1: ['que_paso', 'para_el_ciudadano'],
  2: ['que_paso', 'por_que_importa', 'contexto', 'para_el_ciudadano', 'relevancia_perote'],
  3: ['que_paso', 'por_que_importa', 'contexto', 'datos', 'implicaciones', 'pendientes', 'para_el_ciudadano', 'relevancia_perote'],
};

const FIELD_SPEC = {
  que_paso: '"que_paso": {"resumen": "2-3 oraciones, solo lo verificable", "hechos": ["hecho 1", "hecho 2"]} (máx 8 hechos, cada uno una oración corta)',
  por_que_importa: '"por_que_importa": "1-2 oraciones: por qué le importa esto a un lector de Perote/Veracruz"',
  contexto: '"contexto": "2-4 oraciones: antecedentes y cómo se llegó hasta aquí"',
  datos: '"datos": [{"label": "...", "value": "...", "source": "..." o null}] (máx 8; SOLO datos que ya aparezcan en la información dada abajo, nunca inventados)',
  implicaciones: '"implicaciones": ["implicación 1", "implicación 2"] (máx 6, oraciones cortas: qué puede pasar después)',
  pendientes: '"pendientes": "1-3 oraciones: qué no se sabe todavía o falta confirmar"',
  para_el_ciudadano: '"para_el_ciudadano": "1-2 oraciones: qué necesita saber o hacer un ciudadano de Perote con esto"',
  relevancia_perote: '"relevancia_perote": "1 oración corta: por qué esto es relevante específicamente para Perote"',
};

const LEVEL_NAME = { 1: 'Señal', 2: 'Contexto', 3: 'Análisis CREA' };
// Nivel 3 usa el modelo de razonamiento (mismo criterio que generateProposal()
// con guion_audio/guion_video en ai-client.js): más campos, más síntesis.
const LEVEL_MODEL_KEY = { 1: 'default', 2: 'default', 3: 'complex' };

function isValidLevel(level) {
  return level === 1 || level === 2 || level === 3;
}

/**
 * Construye el prompt para un nivel. Puro, sin red.
 * @param {1|2|3} level
 * @param {object} topic fila de `topics` (o subconjunto con title/known_facts/...)
 * @param {string} [directive] directriz editorial (por-nota o default global)
 */
function buildPrompt(level, topic, directive) {
  if (!isValidLevel(level)) throw new Error(`Nivel de análisis inválido: ${level}`);
  const fields = LEVEL_FIELDS[level];
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const system = `Eres el Motor Editorial de CREA Contenidos, medio digital en Perote, Veracruz, México. Analizas un tema YA detectado y verificado por RADAR — interpretas y contextualizas lo que ya se sabe, nunca inventas hechos nuevos ni fuentes. Hoy es ${fecha}. Nivel de análisis pedido: ${level} (${LEVEL_NAME[level]}). Devuelve SOLO los campos de ese nivel, nada más.`;
  const user = `${directiveBlock(directive)}Tema: ${topic.title}
Qué se sabe: ${topic.known_facts || 'sin datos'}
Qué no se sabe: ${topic.unknown_facts || 'sin datos'}
Antecedentes: ${topic.antecedentes || 'sin datos'}
Actores: ${topic.actores || 'sin datos'}
Localidad: ${topic.locality || 'sin datos'}
Categoría: ${topic.category || 'sin datos'}

Devuelve SOLO un JSON con estos campos (nada más, nada menos):
{
${fields.map((f) => '  ' + FIELD_SPEC[f]).join(',\n')}
}`;
  return { system, user, modelKey: LEVEL_MODEL_KEY[level] };
}

function sanitizeText(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function sanitizeStringArray(v, maxItems, itemMax) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxItems).map((x) => String(x).trim().slice(0, itemMax)).filter(Boolean);
}

function sanitizeQuePaso(v) {
  if (!v || typeof v !== 'object') return null;
  const resumen = sanitizeText(v.resumen, 800);
  const hechos = sanitizeStringArray(v.hechos, 8, 300);
  if (!resumen && !hechos.length) return null;
  return { resumen, hechos };
}

function sanitizeDatos(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 8).map((d) => {
    if (!d || typeof d !== 'object') return null;
    const label = sanitizeText(d.label, 120);
    const value = sanitizeText(d.value, 200);
    if (!label || !value) return null;
    return { label, value, source: sanitizeText(d.source, 200) };
  }).filter(Boolean);
}

const SANITIZERS = {
  que_paso: sanitizeQuePaso,
  por_que_importa: (v) => sanitizeText(v, 500),
  contexto: (v) => sanitizeText(v, 1200),
  datos: sanitizeDatos,
  implicaciones: (v) => sanitizeStringArray(v, 6, 300),
  pendientes: (v) => sanitizeText(v, 500),
  para_el_ciudadano: (v) => sanitizeText(v, 500),
  relevancia_perote: (v) => sanitizeText(v, 300),
};

function fieldIsFilled(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Boolean(v.resumen) || Boolean(v.hechos && v.hechos.length);
  return String(v).trim().length > 0;
}

/**
 * Sanea y valida la salida cruda del modelo para un nivel. Puro, sin red.
 * @returns {object|null} objeto con SOLO los campos del nivel (+ conversacion:
 *   null siempre) o null si la salida vino incompleta — el caller debe
 *   rechazar, nunca persistir a medias.
 */
function sanitizeAnalysis(level, raw) {
  if (!isValidLevel(level) || !raw || typeof raw !== 'object') return null;
  const fields = LEVEL_FIELDS[level];
  const out = {};
  for (const f of fields) out[f] = SANITIZERS[f](raw[f]);
  if (fields.some((f) => !fieldIsFilled(out[f]))) return null; // incompleto: se rechaza
  out.conversacion = null; // nunca se genera acá — ver docs/ia/motor-editorial-crea.md
  return out;
}

/**
 * Genera un análisis de nivel N para un topic. No toca DB — el caller (ruta
 * de la API) hace el INSERT en editorial_analyses y el logActivity.
 * @param {object} topic
 * @param {1|2|3} level
 * @param {string} [directive]
 * @returns {Promise<{analysis: object, model, provider, tokensUsed: number|null, usedFallback: boolean}>}
 */
async function generateAnalysis(topic, level, directive) {
  const { system, user, modelKey } = buildPrompt(level, topic, directive);
  const { content, model, provider, usage, usedFallback } = await chatComplete(system, user, modelKey);
  const raw = parseJson(content);
  const analysis = sanitizeAnalysis(level, raw);
  if (!analysis) {
    const err = new Error('El modelo devolvió una salida incompleta para este nivel de análisis');
    err.status = 502;
    err.code = 'incomplete_analysis';
    throw err;
  }
  return {
    analysis,
    model,
    provider,
    tokensUsed: (usage && usage.total_tokens) || null,
    usedFallback: Boolean(usedFallback),
  };
}

// Orquesta generateAnalysis() + INSERT + logActivity — mismo patrón que
// detectAndSaveTopics() en topic-detection.js (llamada a IA + persistencia en
// una sola función importable), no puro a propósito: es lo que permite que
// tanto la ruta HTTP (modules/listening/index.js) como un check ejecutable
// (H_AI_HAPPY_PATH-style, con withMockedFetch) llamen a la misma lógica sin
// pasar por el proceso separado del server. Lanza con err.code
// 'incomplete_analysis' si el modelo no completó el nivel — el caller decide
// el status HTTP.
async function createEditorialAnalysis(pool, topic, level, userId, directive) {
  const result = await generateAnalysis(topic, level, directive);
  const a = result.analysis;
  const { rows } = await pool.query(
    `INSERT INTO editorial_analyses (
       topic_id, analysis_level, que_paso, por_que_importa, contexto, datos, implicaciones,
       conversacion, pendientes, relevancia_perote, para_el_ciudadano, model, provider,
       tokens_used, created_by
     ) VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15)
     RETURNING ${EDITORIAL_ANALYSIS_FIELDS}`,
    [
      topic.id,
      level,
      JSON.stringify(a.que_paso != null ? a.que_paso : null),
      a.por_que_importa || null,
      a.contexto || null,
      JSON.stringify(a.datos != null ? a.datos : null),
      JSON.stringify(a.implicaciones != null ? a.implicaciones : null),
      JSON.stringify(a.conversacion != null ? a.conversacion : null),
      a.pendientes || null,
      a.relevancia_perote || null,
      a.para_el_ciudadano || null,
      result.model,
      result.provider,
      result.tokensUsed,
      userId,
    ]
  );
  await logActivity(pool, 'editorial_analysis', `Análisis nivel ${level} generado: ${topic.title}`, userId, 'exito', {
    topic_id: topic.id,
    analysis_level: level,
    provider: result.provider,
    model: result.model,
    tokens_used: result.tokensUsed,
    used_fallback: result.usedFallback,
  });
  return rows[0];
}

module.exports = {
  LEVEL_FIELDS,
  EDITORIAL_ANALYSIS_FIELDS,
  isValidLevel,
  buildPrompt,
  sanitizeAnalysis,
  generateAnalysis,
  createEditorialAnalysis,
};
