// R2-36/R2-39 (fase 6): post propio para Facebook — deja de ser
// "título + dek" recortado (modules/distribution/index.js).
function renderSocial(master) {
  const parts = [master.title];
  if (master.resumen) parts.push(master.resumen);
  if (master.cierre) parts.push(master.cierre);
  return parts.join('\n\n');
}

module.exports = { renderSocial };
