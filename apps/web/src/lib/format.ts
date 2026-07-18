// Puerto de los helpers de texto de main.js (esc() ya no hace falta: Astro
// escapa las expresiones {} automáticamente en las plantillas .astro).

export function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (!isFinite(seconds)) return '';
  if (Math.abs(seconds) < 60) return 'hace un momento';
  const rtf = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(seconds) >= secs) return rtf.format(Math.round(seconds / secs), unit);
  }
  return '';
}

export function initials(name: string): string {
  return String(name || '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function notaHref(slug: string): string {
  return '/notas/' + encodeURIComponent(slug);
}

export function perfilHref(name: string): string {
  return '/perfil/' + encodeURIComponent(name);
}

export function seccionHref(name: string): string {
  return '/seccion/' + encodeURIComponent(name);
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}
