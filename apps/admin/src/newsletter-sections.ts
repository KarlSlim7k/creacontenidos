// CREA Panel Admin — taxonomía de secciones del boletín (RADAR 2.0, R2-32/R2-33).
//
// Copia literal de apps/api/src/lib/newsletter-sections.js — mismo patrón que
// reasons.ts con editorial-reasons.js: el panel es un bundle de Vite/TS
// separado del API, sin workspace compartido. Si cambias la taxonomía,
// cambia también esa fuente.
//
// Es una clasificación editorial INTERNA (trazabilidad + organización de la
// selección) — no son encabezados nuevos en el correo real, que conserva su
// estructura actual (nota del día / en breve / dato del día / agenda). Ver
// newsletter-sections.js para la decisión completa.
export const NEWSLETTER_SECTIONS: { value: string; label: string }[] = [
  { value: 'PEROTE', label: 'Perote' },
  { value: 'VERACRUZ_MEXICO', label: 'Veracruz / México' },
  { value: 'MUNDO', label: 'Mundo' },
  { value: 'ECO_TEC_CULT_DEP', label: 'Economía / Tec / Cultura / Deportes' },
  { value: 'PARA_ENTENDER', label: 'Para entender' },
];

export function newsletterSectionOptions(selected: string): string {
  return NEWSLETTER_SECTIONS.map((s) =>
    `<option value="${s.value}"${selected === s.value ? ' selected' : ''}>${s.label}</option>`
  ).join('');
}
