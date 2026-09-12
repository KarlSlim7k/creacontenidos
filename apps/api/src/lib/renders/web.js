// R2-36 (fase 6): render puro para el canal WEB. No sustituye a
// generateProposal() (la nota publicada la sigue redactando y editando el
// equipo con IA) — es la vista de lectura del análisis tal cual lo dejó el
// Motor Editorial, empaquetada como {title, dek, body} para poder mostrarse
// o guardarse igual que cualquier otro render.
function renderWeb(master) {
  const parts = [master.resumen, master.contexto];
  if (master.implicaciones.length) {
    parts.push('Lo que podría pasar después: ' + master.implicaciones.join('. ') + '.');
  }
  parts.push(master.cierre);
  return {
    title: master.title,
    dek: master.resumen,
    body: parts.filter(Boolean).join('\n\n'),
  };
}

module.exports = { renderWeb };
