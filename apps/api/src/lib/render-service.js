// RADAR 2.0, Fase 6 (R2-37/R2-38/R2-39): orquestador impuro de lib/renders/ —
// carga topic + editorial_analyses vigente de una content_proposals, arma el
// objeto maestro y llama al render puro del canal. Mismo patrón que
// createEditorialAnalysis() en editorial-engine.js (pool.query alrededor de
// funciones puras, no dentro de ellas).
const pool = require('../db/pool');
const { buildMasterObject, renderWeb, renderWhatsapp, renderSocial, renderAudio } = require('./renders');
const { logActivity } = require('./ai-client');

const CHANNEL_RENDERERS = { web: renderWeb, whatsapp: renderWhatsapp, audio: renderAudio, social: renderSocial };
const CHANNELS = Object.keys(CHANNEL_RENDERERS);

function isValidChannel(channel) {
  return CHANNELS.includes(channel);
}

// El tema puede no existir (nunca vino de RADAR) o haber sido borrado
// (content_proposals.topic_id queda NULL, migración 024) — en ambos casos el
// master object cae al fallback de buildMasterObject() (proposal.title/dek),
// sin análisis que ofrecer. No es un error: sigue siendo una propuesta válida.
async function loadTopicAndAnalysis(topicId) {
  if (!topicId) return { topic: null, analysis: null };
  const { rows: topicRows } = await pool.query('SELECT * FROM topics WHERE id = $1', [topicId]);
  const { rows: analysisRows } = await pool.query(
    'SELECT * FROM editorial_analyses WHERE topic_id = $1 ORDER BY created_at DESC LIMIT 1',
    [topicId]
  );
  return { topic: topicRows[0] || null, analysis: analysisRows[0] || null };
}

/** @returns {Promise<object|null>} el objeto maestro para una propuesta ya cargada (fila de content_proposals), o null si no existe. */
async function buildMasterForProposal(proposal) {
  if (!proposal) return null;
  const { topic, analysis } = await loadTopicAndAnalysis(proposal.topic_id);
  return buildMasterObject({ topic, analysis, proposal });
}

/**
 * Genera y persiste un render de un canal para una propuesta. Siempre
 * disparado por una acción humana explícita (R2-38: nunca automático sobre
 * contenido ya publicado, ni efecto secundario de otra acción). `url` solo
 * lo usa el canal whatsapp (link a la nota).
 */
async function generateRender(proposalId, channel, userId, url) {
  if (!isValidChannel(channel)) {
    const err = new Error(`Canal de render inválido: ${channel}`);
    err.status = 400;
    throw err;
  }
  const { rows } = await pool.query('SELECT * FROM content_proposals WHERE id = $1', [proposalId]);
  const proposal = rows[0];
  if (!proposal) {
    const err = new Error('Propuesta no encontrada');
    err.status = 404;
    throw err;
  }
  const { topic, analysis } = await loadTopicAndAnalysis(proposal.topic_id);
  const master = buildMasterObject({ topic, analysis, proposal });
  const renderFn = CHANNEL_RENDERERS[channel];
  const content = channel === 'whatsapp' ? renderFn(master, url || null) : renderFn(master);
  const { rows: inserted } = await pool.query(
    `INSERT INTO content_renders (proposal_id, channel, content, analysis_id, analysis_created_at, created_by)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING *`,
    [proposalId, channel, JSON.stringify(content), analysis ? analysis.id : null, analysis ? analysis.created_at : null, userId]
  );
  await logActivity(pool, 'content_render', `Render ${channel} generado para propuesta ${proposalId}`, userId, 'exito', {
    proposal_id: proposalId,
    channel,
    analysis_id: analysis ? analysis.id : null,
  });
  return inserted[0];
}

/**
 * Lista el render vigente (el más reciente) de cada canal para una propuesta,
 * marcando `stale` cuando el tema ya tiene un análisis más nuevo que el usado
 * (R2-37) — la comparación se hace al leer, no hay columna "desactualizado".
 * @returns {Promise<object[]|null>} null si la propuesta no existe.
 */
async function listRenders(proposalId) {
  const { rows: proposalRows } = await pool.query('SELECT topic_id FROM content_proposals WHERE id = $1', [proposalId]);
  if (!proposalRows[0]) return null;
  const topicId = proposalRows[0].topic_id;
  let latestAnalysisAt = null;
  if (topicId) {
    const { rows } = await pool.query('SELECT MAX(created_at) AS latest FROM editorial_analyses WHERE topic_id = $1', [topicId]);
    latestAnalysisAt = rows[0].latest;
  }
  const { rows: renderRows } = await pool.query(
    `SELECT DISTINCT ON (channel) * FROM content_renders WHERE proposal_id = $1 ORDER BY channel, created_at DESC`,
    [proposalId]
  );
  return renderRows.map((r) => ({
    ...r,
    stale: Boolean(latestAnalysisAt) && (!r.analysis_created_at || new Date(r.analysis_created_at) < new Date(latestAnalysisAt)),
  }));
}

module.exports = { CHANNELS, isValidChannel, generateRender, listRenders, buildMasterForProposal };
