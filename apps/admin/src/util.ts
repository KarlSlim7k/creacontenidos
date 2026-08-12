// CREA Panel Admin — helpers de presentación compartidos por todos los módulos.
import type { Screen } from './store';

// La comilla simple también se escapa aunque hoy todos los atributos del panel usen
// dobles: el día que alguien escriba style='...' o data-x='...' con un valor de la DB,
// esto es XSS. Un carácter aquí evita depender de una convención no verificable.
export function esc(str: unknown): string {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return 'hace ' + mins + 'm';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return 'hace ' + hours + 'h';
  return 'hace ' + Math.floor(hours / 24) + 'd';
}

export function initialsOf(name: string | null | undefined): string {
  return String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Mapa único estado → colores del badge. Cualquier pastilla de estado del panel
// sale de aquí (o de badge()): no hand-rollar bg/color inline en las pantallas.
const STYLE_NEUTRAL = { bg: 'var(--bg-soft)', color: 'var(--text-mute)' };
const STYLE_ACCENT = { bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
const STYLE_BRAND = { bg: 'var(--brand-soft)', color: 'var(--brand)' };
const STYLE_DANGER = { bg: 'var(--danger-soft)', color: 'var(--danger)' };
const STYLE_OFF = { bg: 'var(--bg-soft)', color: 'var(--mute-2)' };

const STATUS_STYLE_MAP: Record<string, { bg: string; color: string }> = {
  borrador: STYLE_NEUTRAL, nueva: STYLE_NEUTRAL, identificado: STYLE_NEUTRAL,
  nuevo: STYLE_ACCENT, en_revision: STYLE_ACCENT, en_analisis: STYLE_ACCENT,
  aprobada: STYLE_BRAND, propuesta_enviada: STYLE_BRAND, contactado: STYLE_BRAND,
  published: { bg: 'var(--brand)', color: '#fff' }, cerrado: { bg: 'var(--brand)', color: '#fff' },
  descartada: STYLE_OFF, rechazada: STYLE_OFF, descartado: STYLE_OFF,
  activo: STYLE_BRAND, publicado: STYLE_BRAND, analizado: STYLE_BRAND,
  inactivo: STYLE_OFF, no_publicado: STYLE_ACCENT,
  verified: STYLE_BRAND, checking: STYLE_ACCENT, signal: { bg: 'var(--surface)', color: 'var(--text-mute)' },
  risk: STYLE_DANGER, sin_evaluar: STYLE_NEUTRAL,
  high: STYLE_BRAND, medium: STYLE_ACCENT, low: STYLE_DANGER,
};

export function statusStyle(label: string): { bg: string; color: string } {
  return STATUS_STYLE_MAP[label] || STYLE_NEUTRAL;
}

export const STATUS_LABEL: Record<string, string> = {
  borrador: 'Borrador', en_revision: 'En revisión', published: 'Publicada', rechazada: 'Rechazada', propuesta: 'Propuesta',
  nueva: 'Nueva', en_analisis: 'En análisis', aprobada: 'Aprobada', descartada: 'Descartada',
  identificado: 'Identificado', contactado: 'Contactado', propuesta_enviada: 'Propuesta enviada', cerrado: 'Cerrado',
  nuevo: 'Nuevo', descartado: 'Descartado',
  activo: 'Activo', inactivo: 'Inactivo', publicado: 'Publicado', no_publicado: 'Borrador', analizado: 'Analizado',
  verified: 'Verificado', checking: 'En verificación', signal: 'Señal', risk: 'Riesgo alto', sin_evaluar: 'Sin evaluar',
  high: 'Alta', medium: 'Media', low: 'Baja',
};

export function badge(statusKey: string, label?: string): string {
  const st = statusStyle(statusKey);
  return `<span class="padmin-badge" style="background:${st.bg};color:${st.color};">${esc(label || STATUS_LABEL[statusKey] || statusKey)}</span>`;
}

// Paginación cliente (10 filas/página) para TODAS las tablas del panel, RADAR incluida.
// Antes había dos copias casi iguales (esta y una local en radar.ts) con el mismo
// tamaño de página; la única diferencia real era `hasMore`, que aquí es un parámetro
// opcional: RADAR pagina sobre datos que el servidor puede seguir alimentando, y el
// resto no. Una copia menos que mantener sincronizada.
export const TABLE_PAGE_SIZE = 10;

export function paginateRows<T>(items: T[], page: number): { pageItems: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE));
  const clamped = Math.min(Math.max(page, 0), totalPages - 1);
  return { pageItems: items.slice(clamped * TABLE_PAGE_SIZE, clamped * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE), page: clamped, totalPages };
}

// hasMore: el servidor puede tener más filas de las cargadas (RADAR). Cambia dos cosas
// — "Siguiente" sigue activo en la última página local, y el total se muestra como "N+"
// porque todavía no se conoce. Sin hasMore se comporta como paginación cerrada.
export function renderPager(page: number, totalPages: number, totalItems: number, action: string, hasMore?: boolean): string {
  if (totalPages <= 1 && !hasMore) return '';
  const start = page * TABLE_PAGE_SIZE + 1;
  const end = Math.min(start + TABLE_PAGE_SIZE - 1, totalItems);
  const canPrev = page > 0;
  const canNext = page < totalPages - 1 || !!hasMore;
  return `<div class="padmin-pager">
    <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="${action}" data-value="${page - 1}" ${canPrev ? '' : 'disabled'}>‹ Anterior</button>
    <span class="padmin-pager-count">Mostrando ${start}–${end} de ${totalItems}${hasMore ? '+' : ''}</span>
    <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="${action}" data-value="${page + 1}" ${canNext ? '' : 'disabled'}>Siguiente ›</button>
  </div>`;
}

export function loadingCard(label?: string): string {
  return `<div class="padmin-card" style="padding:20px;"><p class="padmin-lede" style="margin:0;">${esc(label || 'Cargando…')}</p></div>`;
}

// Mismo aspecto que loadingCard pero distinto significado: "no hay nada" no es
// "todavía no llega". Se usaba loadingCard() para estados vacíos, así que un listado
// vacío y uno cargando eran indistinguibles — y con role="status" el lector de
// pantalla anuncia el resultado en vez de dejar al usuario esperando.
export function emptyCard(label: string): string {
  return `<div class="padmin-card" style="padding:20px;"><p class="padmin-lede" style="margin:0;" role="status">${esc(label)}</p></div>`;
}

export function errorCard(err: { message?: string } | null | undefined): string {
  return `<div class="padmin-card" style="padding:20px;"><p class="padmin-lede" style="margin:0;">No pudimos cargar los datos (${esc(err && err.message)}).</p></div>`;
}

// Estaba fijo en "Buenos días", así que mentía desde el mediodía — y el panel se usa
// sobre todo en el cierre de la tarde. Hora local del dispositivo, sin librería.
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function landingFor(role: string): Screen {
  return role === 'comercial' ? 'comercial' : (role === 'colaborador' ? 'ideas' : 'dashboard');
}

export const roleLabels: Record<string, string> = {
  director: 'Director Editorial', produccion: 'Producción / Reportero', comercial: 'Comercial / Ventas', colaborador: 'Colaborador externo',
};

export const navItemsAll: { id: Screen; label: string }[] = [
  { id: 'dashboard', label: 'Inicio' },
  { id: 'radar', label: 'RADAR' },
  { id: 'propuestas', label: 'Propuestas IA' },
  { id: 'ideas', label: 'Bandeja de ideas' },
  { id: 'editor', label: 'Editor de nota' },
  { id: 'aprobacion', label: 'Aprobación' },
  { id: 'producciones', label: 'Producciones' },
  { id: 'publicadas', label: 'Publicadas' },
  { id: 'comercial', label: 'Pipeline comercial' },
  { id: 'leads', label: 'Leads' },
  { id: 'metricas', label: 'Métricas' },
  { id: 'hermes', label: 'Estado del agente' },
  { id: 'pipeline', label: 'Buenos días, Perote' },
  { id: 'configuracion', label: 'Configuración' },
];
