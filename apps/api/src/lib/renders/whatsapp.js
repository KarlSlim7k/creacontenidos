// R2-36/R2-39 (fase 6): mensaje propio para WhatsApp — deja de ser
// "título + dek + link" recortado (modules/distribution/index.js). `url`
// viaja como segundo parámetro, no se calcula acá (sin acceso a config/DB,
// misma disciplina que los renderers del newsletter).
function renderWhatsapp(master, url) {
  const lines = [`*${master.title}*`];
  if (master.resumen) lines.push(master.resumen);
  if (master.cierre) lines.push(master.cierre);
  if (url) lines.push(url);
  return lines.join('\n\n');
}

module.exports = { renderWhatsapp };
