// Taxonomía fija de secciones editoriales. Antes vivía solo como
// SITEMAP_SECTIONS en server.js (para el sitemap XML) y como texto libre en
// content_proposals.section — ahora es la única fuente de verdad, usada por
// el sitemap, el prompt de generateProposal (ai-client.js), la validación del
// editor (editorial/index.js) y el CHECK de DB (migración 033).
const SECTIONS = ['Local', 'Cultura', 'Economía', 'Entretenimiento', 'Deportes', 'Opinión'];

module.exports = { SECTIONS };
