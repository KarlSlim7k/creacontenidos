const config = require('../config');

const NOUS_BASE = 'https://inference-api.nousresearch.com/v1';

const MODELS = {
  default: config.aiModelDefault,
  complex: config.aiModelComplex,
  qa: config.aiModelQa,
};

async function chatComplete(systemPrompt, userMessage, modelKey) {
  modelKey = modelKey || 'default';
  const res = await fetch(`${NOUS_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.nousPortalKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELS[modelKey],
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nous Portal respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json.choices[0].message.content;
  if (!content) throw new Error('Nous Portal no devolvió contenido (posible límite de tokens de razonamiento agotado)');
  return content;
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

async function detectTopics(query) {
  const system = 'Eres un analista de tendencias para un medio editorial en Perote, Puebla, México. Detectas temas relevantes para audiencia local y regional.';
  const user = `Analiza las siguientes tendencias y extrae los topics más relevantes para un medio de contenido en Perote, Puebla: "${query}". Para cada topic, devuelve un JSON array con objetos que tengan: title, source (Web Search), mentions (número estimado), sentiment (positivo/negativo/neutral), antecedentes, actores, angulos (ángulos de cobertura sugeridos), audiencia (potencial de audiencia). Devuelve SOLO el JSON array, sin texto adicional. Máximo 5 topics.`;
  const content = await chatComplete(system, user, 'default');
  return parseJson(content);
}

async function generateProposal(context, format, angle) {
  const modelKey = format === 'guion_audio' || format === 'guion_video' ? 'complex' : 'default';
  const system = 'Eres un editor asistente para CREA Contenidos, un medio digital en Perote, Puebla. Generas propuestas de contenido en español mexicano profesional.';
  const user = `Tema: ${context.title}\nDescripción: ${context.description || ''}\nAntecedentes: ${context.antecedentes || ''}\nActores: ${context.actores || ''}\nÁngulos sugeridos: ${context.angulos || ''}\nAudiencia: ${context.audiencia || ''}\nFormato pedido: ${format}\nÁngulo editorial: ${angle || 'libre'}\n\nGenera una propuesta de contenido. Devuelve SOLO un JSON con: title, body (resumen de 2-3 párrafos), dek (subtítulo de 1 línea), section, angulo, sensibilidad (verde/amarillo/rojo).`;
  const content = await chatComplete(system, user, modelKey);
  return parseJson(content);
}

async function generateDraft(proposal, instructions) {
  const system = 'Eres un redactor para CREA Contenidos, medio digital en Perote, Puebla. Escribes artículos completos en español mexicano, tono profesional pero accesible. NO uses emojis. NO uses caracteres CJK o no latinos.';
  const user = `Título: ${proposal.title}\nDek: ${proposal.dek || ''}\nSección: ${proposal.section || ''}\nÁngulo: ${proposal.angulo || ''}\nCuerpo actual: ${proposal.body || ''}\nInstrucciones del editor: ${instructions || 'ninguna'}\n\nEscribe el cuerpo completo del artículo.`;
  return chatComplete(system, user, 'default');
}

async function qaCheck(title, body) {
  const system = "Eres un corrector de estilo para un medio editorial mexicano. Verificas: 1) Español correcto (gramática, ortografía), 2) Ausencia de caracteres no deseados (CJK, símbolos extraños, emojis colados), 3) Coherencia y fluidez. Devuelve un JSON con: score (0-100), issues (array de {type: 'symbol'|'grammar'|'coherence', line: número de línea, text: descripción}), summary (resumen en 1 línea). SOLO el JSON.";
  const user = `Título: ${title}\n\nCuerpo:\n${body}`;
  const content = await chatComplete(system, user, 'qa');
  return parseJson(content);
}

// Redacta las secciones editoriales del newsletter (nota del día, en breve, dato
// del día) a partir de los topics reales de RADAR. Modelo barato ('default'):
// es texto corto, no amerita el modelo complejo. El clima NUNCA pasa por acá —
// se arma con datos reales en weather-client.js para no dejar que el modelo
// invente temperaturas.
async function generateNewsletterEditorial(topics, weekday, date) {
  const system = 'Eres el editor matutino de CREA Contenidos en Perote, Veracruz. Escribes el newsletter diario "Buenos días, Perote": breve, útil, sin relleno, tono cercano y directo para adultos jóvenes (25-44 años). Nunca inventas datos que no estén en los temas proporcionados.';
  const topicsJson = JSON.stringify(topics.map((t) => ({
    title: t.title, sentiment: t.sentiment, antecedentes: t.antecedentes, angulos: t.angulos,
  })));
  const user = `TEMAS DETECTADOS HOY (RADAR):\n${topicsJson}\n\nFECHA: ${date}\nDÍA DE LA SEMANA: ${weekday}\n\nGenera las secciones del newsletter. Devuelve SOLO un JSON con:\n- notaDelDia: {titulo, cuerpo} — la noticia más relevante de los temas, 3-4 oraciones con datos concretos, sin adjetivos ni juicios.\n- enBreve: array de 2-4 strings, notas secundarias en 1-2 oraciones cada una.\n- datoDelDia: un dato curioso, histórico o estadístico sobre Perote, Veracruz (educativo, compartible, real — no lo inventes si no lo sabes con certeza, usa historia conocida de la región).\n\nReglas: máximo 400 palabras en total entre las tres secciones. Sin emojis. Sin clickbait. Si los temas no alcanzan para "en breve", devuelve un array más corto.`;
  const content = await chatComplete(system, user, 'default');
  return parseJson(content);
}

async function logActivity(pool, action, detail, userId, status, metadata) {
  await pool.query(
    'INSERT INTO activity_log (action, detail, user_id, status, metadata) VALUES ($1, $2, $3, $4, $5)',
    [action, detail, userId, status || 'exito', metadata ? JSON.stringify(metadata) : null]
  );
}

module.exports = { chatComplete, detectTopics, generateProposal, generateDraft, qaCheck, generateNewsletterEditorial, logActivity };
