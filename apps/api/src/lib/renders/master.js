// RADAR 2.0, fase 6 (R2-36): normaliza topic + editorial_analyses — o, en su
// ausencia, una content_proposals ya redactada — a un solo objeto de entrada
// para los cuatro renders de canal (web/whatsapp/audio/social). Puro: solo
// lee campos ya cargados por el caller (pool.query vive en lib/render-service.js),
// nunca toca DB ni IA — misma disciplina que sanitizeAnalysis() en
// editorial-engine.js.

/**
 * @param {{ topic: object|null, analysis: object|null, proposal: object|null }} input
 * @returns {{ title: string, resumen: string|null, contexto: string|null, cierre: string|null, implicaciones: string[] }}
 */
function buildMasterObject({ topic, analysis, proposal }) {
  const title = (topic && topic.title) || (proposal && proposal.title) || '';
  if (!title) throw new Error('buildMasterObject requiere topic.title o proposal.title');
  const resumen = (analysis && analysis.que_paso && analysis.que_paso.resumen)
    || (analysis && analysis.por_que_importa)
    || (proposal && proposal.dek)
    || null;
  const contexto = (analysis && analysis.contexto) || null;
  const cierre = (analysis && analysis.para_el_ciudadano) || (analysis && analysis.relevancia_perote) || null;
  const implicaciones = (analysis && Array.isArray(analysis.implicaciones)) ? analysis.implicaciones : [];
  return { title, resumen, contexto, cierre, implicaciones };
}

module.exports = { buildMasterObject };
