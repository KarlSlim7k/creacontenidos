// Taxonomía de motivos de rechazo/devolución/descarte editorial (RADAR 2.0,
// punto 16, R2-05). Única fuente de verdad para la API: la valida
// modules/editorial/index.js (/reject, /return) y modules/listening/index.js
// (descarte de topics). Sin CHECK en DB a propósito — ajustar esta lista no
// requiere migración (ver migración 044). El panel admin (apps/admin/, TS,
// bundle separado sin acceso a este archivo) mantiene una copia literal en
// src/reasons.ts — mismo patrón que SECTIONS (lib/sections.js) hoy con
// content_proposals.section: si cambias esta lista, cambia también esa copia.
const REASON_CODES = [
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

const REASON_CODE_SET = new Set(REASON_CODES.map((r) => r.code));

function isValidReasonCode(code) {
  return typeof code === 'string' && REASON_CODE_SET.has(code);
}

module.exports = { REASON_CODES, isValidReasonCode };
