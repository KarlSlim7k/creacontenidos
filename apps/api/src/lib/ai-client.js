const config = require('../config');
const { SECTIONS } = require('./sections');

const NOUS_BASE = 'https://inference-api.nousresearch.com/v1';
const PERPLEXITY_BASE = 'https://api.perplexity.ai';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

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
  return { content, usage: json.usage || null };
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : text);
}

// Búsqueda real de tendencias vía Perplexity Sonar Pro (tiene acceso a web
// en vivo). Nous Portal/Hermes NO buscaba nada — solo alucinaba desde su
// corte de entrenamiento, por eso salían notas fechadas en 2024.
async function perplexitySearch(systemPrompt, userMessage) {
  const res = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKeys.perplexity}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Perplexity respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json.choices[0].message.content;
  if (!content) throw new Error('Perplexity no devolvió contenido');
  return { content, usage: json.usage || null };
}

async function detectTopics(query) {
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const system = `Eres un analista de tendencias para un medio editorial en Perote, Veracruz, México. Detectas temas relevantes para audiencia local y regional. Hoy es ${fecha}. Busca en la web noticias y tendencias recientes (últimos días) — nunca reportes eventos de años anteriores como si fueran de hoy.`;
  const user = `Busca tendencias y noticias actuales relevantes para un medio de contenido en Perote, Veracruz sobre: "${query}". Para cada topic, devuelve un JSON array con objetos que tengan: title, source (Web Search), mentions (número estimado), sentiment (positivo/negativo/neutral), antecedentes, actores, angulos (ángulos de cobertura sugeridos), audiencia (potencial de audiencia). En "antecedentes" siempre precisa cuándo ocurrió el hecho (fecha exacta o al menos día/semana aproximada según la fuente) — si la fuente no da fecha, dilo explícitamente ("fecha exacta no reportada por la fuente") en vez de omitirlo. Devuelve SOLO el JSON array, sin texto adicional. Máximo 5 topics.`;
  const { content, usage } = await perplexitySearch(system, user);
  return { topics: parseJson(content), usage };
}

// Radar de competencia: publicaciones recientes de medios competidores de la región,
// vía Perplexity (web en vivo). El resultado mapea 1:1 a columnas de competitor_posts (008).
async function detectCompetitorPosts(competitors) {
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const system = `Eres un analista de competencia para CREA Contenidos, medio digital en Perote, Veracruz, México. Hoy es ${fecha}. Busca en la web publicaciones recientes (últimos días) de los medios competidores indicados — nunca reportes contenido de años anteriores como si fuera actual.`;
  const user = `Medios competidores a revisar: ${competitors.join(', ')}.\n\nBusca sus publicaciones más recientes o con más interacción (notas, posts en redes sociales). Devuelve SOLO un JSON array (máximo 10 objetos) con: source_platform (facebook/instagram/tiktok/web), source_account (nombre del medio o cuenta), post_url, post_text (texto o resumen del post), post_date (ISO 8601, o null si la fuente no da fecha — no la inventes), reactions, comments, shares (números; 0 si no hay dato), media_type (texto/foto/video o null).`;
  const { content } = await perplexitySearch(system, user);
  return parseJson(content);
}

// Genera temas de RADAR a partir de publicaciones YA scrapeadas de Facebook
// (competitor_posts, source_platform='facebook'). A diferencia de detectTopics/
// detectCompetitorPosts, acá NO se busca en la web — el texto ya viene dado por
// el scraper — así que basta chatComplete (Nous) en vez de Perplexity.
async function enrichFacebookTopics(posts) {
  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const system = `Eres un analista de tendencias para un medio editorial en Perote, Veracruz, México. Hoy es ${fecha}. Vas a recibir publicaciones YA recopiladas de páginas de Facebook de medios competidores — no busques nada, solo analiza el texto dado.`;
  const postsJson = JSON.stringify(posts.map((p) => ({ source_account: p.source_account, post_text: p.post_text, post_date: p.post_date })));
  const user = `Publicaciones (array de longitud ${posts.length}):\n${postsJson}\n\nPara CADA publicación, en el mismo orden, devuelve un objeto con: title (tema editorial breve derivado del post, no copies el texto literal), sentiment (positivo/negativo/neutral), antecedentes (qué pasó y cuándo, según post_date — si no hay fecha dilo explícitamente), actores, angulos (ángulos de cobertura sugeridos para CREA Contenidos), audiencia (potencial de audiencia local). Devuelve SOLO un JSON array de longitud ${posts.length}, mismo orden que la entrada, sin texto adicional.`;
  const { content } = await chatComplete(system, user, 'default');
  return parseJson(content);
}

// competitorPosts (opcional): posts de competencia ya recuperados por
// similarity() en content-engine/index.js — solo para que el modelo elija un
// ángulo distinto, nunca para copiar/parafrasear su texto (se le dice explícito).
async function generateProposal(context, format, angle, competitorPosts) {
  const modelKey = format === 'guion_audio' || format === 'guion_video' ? 'complex' : 'default';
  const system = 'Eres un editor asistente para CREA Contenidos, un medio digital en Perote, Veracruz. Generas propuestas de contenido en español mexicano profesional.';
  const competitorBlock = competitorPosts && competitorPosts.length
    ? `\n\nCobertura reciente de competencia sobre temas similares (SOLO para elegir un ángulo distinto — NO copies ni parafrasees su texto):\n${JSON.stringify(competitorPosts.map((p) => ({ medio: p.source_account, texto: String(p.post_text || '').slice(0, 300) })))}`
    : '';
  const user = `Tema: ${context.title}\nDescripción: ${context.description || ''}\nAntecedentes: ${context.antecedentes || ''}\nActores: ${context.actores || ''}\nÁngulos sugeridos: ${context.angulos || ''}\nAudiencia: ${context.audiencia || ''}\nFormato pedido: ${format}\nÁngulo editorial: ${angle || 'libre'}${competitorBlock}\n\nGenera una propuesta de contenido. Devuelve SOLO un JSON con: title, body (resumen de 2-3 párrafos), dek (subtítulo de 1 línea), section (una de: ${SECTIONS.join(', ')}), angulo, sensibilidad (verde/amarillo/rojo).`;
  const { content, usage } = await chatComplete(system, user, modelKey);
  return { proposal: parseJson(content), usage, model: MODELS[modelKey] };
}

async function generateDraft(proposal, instructions) {
  const system = 'Eres un redactor para CREA Contenidos, medio digital en Perote, Veracruz. Escribes artículos completos en español mexicano, tono profesional pero accesible. NO uses emojis. NO uses caracteres CJK o no latinos.';
  const user = `Título: ${proposal.title}\nDek: ${proposal.dek || ''}\nSección: ${proposal.section || ''}\nÁngulo: ${proposal.angulo || ''}\nCuerpo actual: ${proposal.body || ''}\nInstrucciones del editor: ${instructions || 'ninguna'}\n\nEscribe el cuerpo completo del artículo.`;
  const { content } = await chatComplete(system, user, 'default');
  return content;
}

async function qaCheck(title, body) {
  const system = "Eres un corrector de estilo para un medio editorial mexicano. Verificas: 1) Español correcto (gramática, ortografía), 2) Ausencia de caracteres no deseados (CJK, símbolos extraños, emojis colados), 3) Coherencia y fluidez. Devuelve un JSON con: score (0-100), issues (array de {type: 'symbol'|'grammar'|'coherence', line: número de línea, text: descripción}), summary (resumen en 1 línea). SOLO el JSON.";
  const user = `Título: ${title}\n\nCuerpo:\n${body}`;
  const { content } = await chatComplete(system, user, 'qa');
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
  const { content } = await chatComplete(system, user, 'default');
  return parseJson(content);
}

// Imagen de portada vía OpenRouter (docs/ia/generacion-imagenes.md): mismo formato
// chat/completions que chatComplete, solo cambia base/model y pide modalities de imagen.
// Devuelve buffer + mime porque OpenRouter responde data-URL base64, no URL pública.
async function generateImage(prompt) {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.aiModelImage,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const images = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.images;
  if (!images || !images[0] || !images[0].image_url || !images[0].image_url.url) {
    throw new Error('OpenRouter no devolvió imagen');
  }
  const match = images[0].image_url.url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('OpenRouter devolvió un formato de imagen inesperado (se esperaba data-URL base64)');
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function logActivity(pool, action, detail, userId, status, metadata) {
  await pool.query(
    'INSERT INTO activity_log (action, detail, user_id, status, metadata) VALUES ($1, $2, $3, $4, $5)',
    [action, detail, userId, status || 'exito', metadata ? JSON.stringify(metadata) : null]
  );
}

module.exports = { chatComplete, detectTopics, detectCompetitorPosts, enrichFacebookTopics, generateProposal, generateDraft, qaCheck, generateNewsletterEditorial, generateImage, logActivity };
