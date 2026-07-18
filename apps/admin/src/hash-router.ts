// CREA Panel Admin — parsing puro del hash de URL (#screen o #screen/id).
// Sin imports de store/DOM a propósito: mantiene esta lógica testable sin
// mockear location/document, y separa el parsing del efecto de asignarlo.
import type { Screen } from './store';

export function hashFor(id: Screen, extra?: number | null): string {
  return '#' + id + (extra != null ? '/' + extra : '');
}

export function screenFromHash(hash: string): { screen: Screen; extra: number | null } | null {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return null;
  const [screen, extraStr] = raw.split('/');
  const extra = extraStr ? Number(extraStr) : null;
  return { screen: screen as Screen, extra: extra != null && Number.isFinite(extra) ? extra : null };
}
