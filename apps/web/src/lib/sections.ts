// Espejo de apps/api/src/lib/sections.js — mismo array, otro runtime/lenguaje.
// ponytail: duplicar 6 strings es más simple que compartir un paquete entre
// apps/web y apps/api solo por esto.
export const SECTIONS = ['Local', 'Cultura', 'Economía', 'Entretenimiento', 'Deportes', 'Opinión'] as const;

export type Section = (typeof SECTIONS)[number];

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}
