// CREA Panel Admin — shell (sidebar, nav, campana, toasts, sonido).
import { state } from './store';
import { esc, relativeTime, navItemsAll, roleLabels } from './util';
import { icon } from './icons';

export function renderNav(): string {
  const allowed = state.allowedModules || [];
  return navItemsAll.filter((n) => allowed.indexOf(n.id) !== -1).map((n) => {
    const active = state.screen === n.id;
    const label = (n.id === 'ideas' && state.user!.role === 'colaborador') ? 'Mis ideas' : n.label;
    return `<button type="button" class="padmin-nav-item${active ? ' active' : ''}" data-action="goto" data-id="${n.id}">${esc(label)}</button>`;
  }).join('');
}

export function getLastNotifSeen(): string | null {
  try { return localStorage.getItem('crea-admin-last-notif-seen'); } catch { return null; }
}

export function unseenNotifCount(): number {
  const notifs = state.data.notifications;
  if (!notifs) return 0;
  const lastSeen = getLastNotifSeen();
  if (!lastSeen) return notifs.length;
  return notifs.filter((n) => n.created_at > lastSeen).length;
}

export function renderBellAndNotifs(): string {
  if (state.user!.role !== 'director') return '';
  const notifs = state.data.notifications;
  const count = unseenNotifCount();
  const badgeHtml = count > 0 ? `<span class="padmin-bell-badge">${count > 9 ? '9+' : count}</span>` : '';
  let panel = '';
  if (state.showNotifications) {
    const lastSeen = getLastNotifSeen();
    let itemsHtml: string;
    if (!notifs) itemsHtml = '<div class="padmin-notif-item"><p>Cargando…</p></div>';
    else if (!notifs.length) itemsHtml = '<div class="padmin-notif-item"><p>Sin actividad reciente.</p></div>';
    else itemsHtml = notifs.map((n) => {
      const isNew = !lastSeen || n.created_at > lastSeen;
      return `<div class="padmin-notif-item${isNew ? ' unread' : ''}"><p>${isNew ? '<span class="padmin-notif-dot"></span>' : ''}${esc(n.detail || n.action)}</p><p class="padmin-notif-time">${esc(relativeTime(n.created_at))}</p></div>`;
    }).join('');
    panel = `<div class="padmin-notif-panel"><div class="padmin-notif-title-row"><p class="padmin-notif-title">Notificaciones</p>${count > 0 ? `<span class="padmin-notif-count">${count} nueva${count === 1 ? '' : 's'}</span>` : ''}</div><div class="padmin-notif-list">${itemsHtml}</div></div>`;
  }
  // <button> real (no span con role): nombre accesible por aria-label porque el
  // contenido es solo SVG, y aria-expanded para el panel que despliega.
  const bellLabel = `Notificaciones${count > 0 ? ` (${count} sin leer)` : ''}`;
  return `<span class="padmin-bell-wrap"><button type="button" class="padmin-bell${count > 0 ? ' has-unread' : ''}" data-action="toggle-notifications" title="Notificaciones" aria-label="${bellLabel}" aria-expanded="${state.showNotifications ? 'true' : 'false'}">` +
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 21a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
    badgeHtml +
    `</button>${panel}</span>`;
}

export function renderRefreshButton(): string {
  return '<button type="button" class="padmin-sound-toggle" data-action="refresh-screen" title="Actualizar datos de esta pantalla" aria-label="Actualizar datos de esta pantalla">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M20 4v4.5h-4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</button>';
}

export function renderSoundToggle(): string {
  const muted = !!state.soundMuted;
  const icon = muted
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M18 9l4 6M22 9l-4 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const label = muted ? 'Activar sonido de avisos' : 'Silenciar sonido de avisos';
  return `<button type="button" class="padmin-sound-toggle${muted ? ' muted' : ''}" data-action="toggle-sound" title="${label}" aria-label="${label}" aria-pressed="${muted ? 'true' : 'false'}">${icon}</button>`;
}

export function renderSidebar(): string {
  const toggleIcon = state.mobileNavOpen
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  return `<nav class="padmin-sidebar${state.mobileNavOpen ? ' nav-open' : ''}" aria-label="Secciones del panel">
    <div class="padmin-sidebar-brand"><img src="${import.meta.env.BASE_URL}assets/img/logo-crea.png" alt="CREA"><span class="badge">PANEL</span>
      <button type="button" class="padmin-menu-toggle" data-action="toggle-mobile-nav" aria-label="Menú" aria-expanded="${state.mobileNavOpen ? 'true' : 'false'}">${toggleIcon}</button>
    </div>
    <div class="padmin-nav">${renderNav()}</div>
    <div class="padmin-account">
      <div class="padmin-account-row">
        <div><p class="padmin-account-name">${esc(state.user!.name)}</p><p class="padmin-account-role">${esc(roleLabels[state.user!.role] || state.user!.role)}</p></div>
        <span class="padmin-account-actions">${renderRefreshButton()}${renderSoundToggle()}${renderBellAndNotifs()}</span>
      </div>
      <button type="button" class="padmin-logout" data-action="logout">Cerrar sesión</button>
    </div>
  </nav>`;
}

export function renderToasts(): string {
  let html = '';
  if (state.errorMsg) {
    html += `<div class="padmin-toast padmin-toast-error" role="alert"><span class="padmin-toast-icon" style="display:inline-flex;align-items:center;">${icon('alert', { size: 14 })}</span><span class="padmin-toast-msg">${esc(state.errorMsg)}</span><button type="button" class="padmin-toast-close" data-action="dismiss-toast" data-kind="error" aria-label="Cerrar aviso">×</button></div>`;
  }
  if (state.successMsg) {
    html += `<div class="padmin-toast padmin-toast-success" role="status"><span class="padmin-toast-icon" style="display:inline-flex;align-items:center;">${icon('check', { size: 14 })}</span><span class="padmin-toast-msg">${esc(state.successMsg)}</span><button type="button" class="padmin-toast-close" data-action="dismiss-toast" data-kind="success" aria-label="Cerrar aviso">×</button></div>`;
  }
  return html ? `<div class="padmin-toast-stack">${html}</div>` : '';
}

// Confirmación para borrados masivos: escribir la frase exacta, mismo criterio que
// eliminar una nota publicada. Un confirm() nativo era la guarda MÁS débil del panel
// justo en su acción de mayor radio de daño (borra la tabla entera, sin deshacer).
export function renderDangerConfirm(): string {
  const d = state.dangerConfirm;
  if (!d) return '';
  const errorHtml = state.dangerConfirmError ? `<p style="font-size:12px;color:var(--danger);margin:0 0 10px;">${esc(state.dangerConfirmError)}</p>` : '';
  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-danger-confirm"></div>
    <div class="padmin-modal" role="dialog" aria-modal="true" aria-label="${esc(d.title)}">
      <p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">${esc(d.title)}</p>
      <p style="font-size:12px;color:var(--text-mute);margin:0 0 16px;">${esc(d.body)}</p>
      <p style="font-size:12px;color:var(--text-mute);margin:0 0 8px;">Para continuar, escribe <b style="color:var(--text);">${esc(d.phrase)}</b>:</p>
      <input id="danger-confirm-input" type="text" class="padmin-sponsor-input" style="font-size:13px;padding:9px 10px;margin-bottom:4px;" placeholder="${esc(d.phrase)}" autocomplete="off">
      ${errorHtml}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button type="button" class="padmin-btn-outline" data-action="close-danger-confirm">Cancelar</button>
        <button type="button" class="padmin-btn padmin-btn-danger" data-action="confirm-danger">Eliminar</button>
      </div>
    </div>
  </div>`;
}

// <nav>/<main> y no dos <div>: con landmarks, un lector de pantalla salta entre
// navegación y contenido de una tecla. El skip link hace lo mismo para quien navega
// con teclado sin lector — antes había que tabular los ~14 items del menú en cada
// cambio de pantalla, porque el repintado devuelve el foco al principio.
// tabindex="-1" en <main>: sin él, el ancla salta pero el foco se queda atrás.
export function renderShell(contentHtml: string): string {
  return `<div class="padmin-shell">
    <a href="#padmin-main" class="padmin-skip-link">Saltar al contenido</a>
    ${renderSidebar()}
    <main class="padmin-content" id="padmin-main" tabindex="-1">${contentHtml}</main>
    ${renderDangerConfirm()}
  </div>`;
}
