// CREA Panel Admin — taxonomía de motivos de rechazo/devolución/descarte
// editorial (RADAR 2.0, punto 16, R2-05/R2-08).
//
// Copia literal de apps/api/src/lib/editorial-reasons.js: el panel es un
// bundle de Vite/TS separado del API (Node/Express), sin workspace
// compartido — mismo patrón que ya usa content_proposals.section (SECTIONS
// en lib/sections.js del API, hardcodeado aquí en editor.ts/ideas.ts). Si
// cambias la taxonomía, cambia también esa fuente.
export const REASON_CODES: { code: string; label: string }[] = [
  { code: 'dato_incorrecto', label: 'Dato incorrecto' },
  { code: 'fuente_insuficiente', label: 'Fuente insuficiente' },
  { code: 'poca_relevancia', label: 'Poca relevancia' },
  { code: 'enfoque_incorrecto', label: 'Enfoque incorrecto' },
  { code: 'tono', label: 'Tono' },
  { code: 'falta_contexto', label: 'Falta contexto' },
  { code: 'interpretacion_excesiva', label: 'Interpretación excesiva' },
  { code: 'duplicado', label: 'Duplicado' },
  { code: 'tema_viejo', label: 'Tema viejo' },
  { code: 'otro', label: 'Otro' },
];

export function reasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return REASON_CODES.find((r) => r.code === code)?.label || code;
}

/** `<select>` con placeholder vacío obligatorio — nunca un motivo preseleccionado por default. */
export function reasonSelectOptions(selected?: string | null): string {
  const opts = REASON_CODES.map((r) =>
    `<option value="${r.code}"${selected === r.code ? ' selected' : ''}>${r.label}</option>`
  ).join('');
  return `<option value=""${selected ? '' : ' selected'} disabled>Elige un motivo…</option>${opts}`;
}
