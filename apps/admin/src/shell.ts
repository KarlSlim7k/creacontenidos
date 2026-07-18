// CREA Panel Admin — shell (sidebar, nav, campana, toasts, sonido).
import { state } from './store';
import { esc, relativeTime, navItemsAll, roleLabels } from './util';

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
  return `<span class="padmin-bell-wrap"><span class="padmin-bell${count > 0 ? ' has-unread' : ''}" data-action="toggle-notifications" title="Notificaciones">` +
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 21a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
    badgeHtml +
    `</span>${panel}</span>`;
}

export function renderSoundToggle(): string {
  const muted = !!state.soundMuted;
  const icon = muted
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M18 9l4 6M22 9l-4 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  return `<span class="padmin-sound-toggle${muted ? ' muted' : ''}" data-action="toggle-sound" title="${muted ? 'Activar sonido de avisos' : 'Silenciar sonido de avisos'}">${icon}</span>`;
}

export function renderSidebar(): string {
  const toggleIcon = state.mobileNavOpen
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  return `<div class="padmin-sidebar${state.mobileNavOpen ? ' nav-open' : ''}">
    <div class="padmin-sidebar-brand"><img src="${import.meta.env.BASE_URL}assets/img/logo-crea.png" alt="CREA"><span class="badge">PANEL</span>
      <button type="button" class="padmin-menu-toggle" data-action="toggle-mobile-nav" aria-label="Menú" aria-expanded="${state.mobileNavOpen ? 'true' : 'false'}">${toggleIcon}</button>
    </div>
    <div class="padmin-nav">${renderNav()}</div>
    <div class="padmin-account">
      <div class="padmin-account-row">
        <div><p class="padmin-account-name">${esc(state.user!.name)}</p><p class="padmin-account-role">${esc(roleLabels[state.user!.role] || state.user!.role)}</p></div>
        <span class="padmin-account-actions">${renderSoundToggle()}${renderBellAndNotifs()}</span>
      </div>
      <button type="button" class="padmin-logout" data-action="logout">Cerrar sesión</button>
    </div>
  </div>`;
}

export function renderToasts(): string {
  let html = '';
  if (state.errorMsg) {
    html += `<div class="padmin-toast padmin-toast-error" role="alert"><span class="padmin-toast-icon">⚠</span><span class="padmin-toast-msg">${esc(state.errorMsg)}</span><button type="button" class="padmin-toast-close" data-action="dismiss-toast" data-kind="error" aria-label="Cerrar aviso">×</button></div>`;
  }
  if (state.successMsg) {
    html += `<div class="padmin-toast padmin-toast-success" role="status"><span class="padmin-toast-icon">✓</span><span class="padmin-toast-msg">${esc(state.successMsg)}</span><button type="button" class="padmin-toast-close" data-action="dismiss-toast" data-kind="success" aria-label="Cerrar aviso">×</button></div>`;
  }
  return html ? `<div class="padmin-toast-stack">${html}</div>` : '';
}

export function renderShell(contentHtml: string): string {
  return `<div class="padmin-shell">${renderSidebar()}<div class="padmin-content">${contentHtml}</div>${renderToasts()}</div>`;
}
