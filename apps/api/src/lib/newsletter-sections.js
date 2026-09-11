// Taxonomía de secciones editoriales del boletín (RADAR 2.0, R2-32).
//
// Decisión de diseño (2026-09-11, consultada — ver commit): el boletín real
// ("Buenos días, Perote") NO tiene hoy una estructura de 5 secciones
// geográficas/temáticas — tiene nota del día + en breve + dato del día +
// agenda, por importancia, no por geografía. Reescribir esa plantilla real
// (la que reciben los suscriptores) es un cambio de producto mucho más
// grande que esta tarea, y contradice la regla del README de radar2/ de no
// tocar "generación" sin necesidad. Por eso `section` es una CLASIFICACIÓN
// EDITORIAL INTERNA — vive en newsletter_edition_items para trazabilidad y
// en la pantalla de selección (R2-33) para que el editor organice qué temas
// entran — no son encabezados nuevos en el correo. La única excepción es
// PARA_ENTENDER (R2-34): ese sí es un bloque nuevo, aditivo, en la
// plantilla — ver newsletter-content.js/newsletter-template.js.
const NEWSLETTER_SECTIONS = ['PEROTE', 'VERACRUZ_MEXICO', 'MUNDO', 'ECO_TEC_CULT_DEP', 'PARA_ENTENDER'];

function isValidSection(section) {
  return typeof section === 'string' && NEWSLETTER_SECTIONS.includes(section);
}

// Sugerencia automática desde territorial_scope/category (fase 02, R2-10) —
// el editor la puede cambiar a mano en R2-33 si no tiene esos campos
// (temas de los caminos internos, sin ingesta externa) o si no aplica.
function suggestSection(topic) {
  if (!topic) return 'PEROTE';
  const scope = topic.territorial_scope;
  if (scope === 'internacional') return 'MUNDO';
  if (scope === 'nacional' || scope === 'estatal') return 'VERACRUZ_MEXICO';
  const category = String(topic.category || '').toLowerCase();
  if (['cultura', 'economia', 'tecnologia', 'deportes', 'ciencia'].some((c) => category.includes(c))) {
    return 'ECO_TEC_CULT_DEP';
  }
  return 'PEROTE'; // default: local o sin dato — el caso más común en RADAR hoy
}

module.exports = { NEWSLETTER_SECTIONS, isValidSection, suggestSection };
