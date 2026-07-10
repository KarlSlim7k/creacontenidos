// CREA Panel Admin — helpers de presentación compartidos por todos los módulos.

export function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function relativeTime(iso) {
  if (!iso) return '';
  var diffMs = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return 'hace ' + mins + 'm';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return 'hace ' + hours + 'h';
  return 'hace ' + Math.floor(hours / 24) + 'd';
}

export function initialsOf(name) {
  return String(name || '?').split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
}

export function statusStyle(label) {
  if (label === 'borrador' || label === 'nueva' || label === 'identificado') return { bg: 'var(--bg-soft)', color: 'var(--text-mute)' };
  if (label === 'nuevo') return { bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
  if (label === 'en_revision' || label === 'en_analisis') return { bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
  if (label === 'aprobada' || label === 'propuesta_enviada' || label === 'contactado') return { bg: 'var(--brand-soft)', color: 'var(--brand)' };
  if (label === 'published' || label === 'cerrado') return { bg: 'var(--brand)', color: '#fff' };
  if (label === 'descartada' || label === 'rechazada' || label === 'descartado') return { bg: 'var(--bg-soft)', color: 'var(--mute-2)' };
  return { bg: 'var(--bg-soft)', color: 'var(--text-mute)' };
}

export var STATUS_LABEL = {
  borrador: 'Borrador', en_revision: 'En revisión', published: 'Publicada', rechazada: 'Rechazada', propuesta: 'Propuesta',
  nueva: 'Nueva', en_analisis: 'En análisis', aprobada: 'Aprobada', descartada: 'Descartada',
  identificado: 'Identificado', contactado: 'Contactado', propuesta_enviada: 'Propuesta enviada', cerrado: 'Cerrado',
  nuevo: 'Nuevo', descartado: 'Descartado'
};

export function badge(statusKey) {
  var st = statusStyle(statusKey);
  var label = STATUS_LABEL[statusKey] || statusKey;
  return '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + esc(label) + '</span>';
}

export function loadingCard(label) {
  return '<div class="padmin-card" style="padding:20px;"><p class="padmin-lede" style="margin:0;">' + esc(label || 'Cargando…') + '</p></div>';
}

export function errorCard(err) {
  return '<div class="padmin-card" style="padding:20px;"><p class="padmin-lede" style="margin:0;">No pudimos cargar los datos (' + esc(err && err.message) + ').</p></div>';
}

export function landingFor(role) {
  return role === 'comercial' ? 'comercial' : (role === 'colaborador' ? 'ideas' : 'dashboard');
}

export var roleLabels = { director: 'Director Editorial', produccion: 'Producción / Reportero', comercial: 'Comercial / Ventas', colaborador: 'Colaborador externo' };

export var navItemsAll = [
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
  { id: 'configuracion', label: 'Configuración' }
];
