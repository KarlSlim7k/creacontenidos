// R2-36 (fase 6): guion hablado para una nota individual (distinto del
// guion del newsletter completo, renderPodcastScript() en newsletter-template.js
// — "una nota no tiene versión en audio" es justo la brecha que cierra esto).
function renderAudio(master) {
  const sentences = [`${master.title}.`];
  if (master.resumen) sentences.push(master.resumen);
  if (master.contexto) sentences.push(master.contexto);
  if (master.cierre) sentences.push(master.cierre);
  return sentences.join(' ');
}

module.exports = { renderAudio };
