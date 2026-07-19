// CREA Panel Admin — auth, login y navegación entre pantallas.
import { state, setState, setData, adminApi, loadScreenData, type Screen, type ApiError, type ActivityEntry } from './store';
import { landingFor, esc } from './util';
import { hashFor, screenFromHash } from './hash-router';
// Import circular con router.ts (router importa renderLogin de aquí): seguro porque
// render es function declaration y solo se llama en runtime, nunca durante la carga.
import { render } from './router';

// URL real por pantalla (#screen o #screen/id): persiste en refresh, es
// bookmarkable/compartible, y da back/forward gratis — el navegador ya
// dispara 'hashchange' al asignar location.hash, sin pushState manual.
window.addEventListener('hashchange', () => {
  if (!state.user) return;
  const target = screenFromHash(location.hash);
  if (target) goTo(target.screen, target.extra);
});

export function login(email: string, password: string) {
  setState({ loginError: null });
  adminApi<{ token: string }>('/api/auth/login', { method: 'POST', body: { email, password } })
    .then((res) => {
      state.token = res.token;
      try { localStorage.setItem('crea-admin-token', res.token); } catch { /* modo privado */ }
      return adminApi<{ id: number; name: string; role: string; allowedModules: string[] }>('/api/auth/session');
    })
    .then((session) => {
      const landing = landingFor(session.role);
      setState({
        user: { id: session.id, name: session.name, role: session.role },
        allowedModules: session.allowedModules,
        screen: landing, loginError: null,
      });
      location.hash = hashFor(landing);
      loadScreenData(landing);
      loadNotifBadge();
    })
    .catch((err: ApiError) => {
      state.token = null;
      try { localStorage.removeItem('crea-admin-token'); } catch { /* noop */ }
      setState({ loginError: err.status === 401 ? 'Correo o contraseña incorrectos.' : 'No pudimos conectar con el servidor.' });
    });
}

export function loadNotifBadge() {
  if (state.user!.role !== 'director') return;
  adminApi<ActivityEntry[]>('/api/admin/activity?limit=5').then((r) => { setData({ notifications: r }); }).catch(() => { /* badge best-effort */ });
}

export function logout() {
  state.token = null;
  try { localStorage.removeItem('crea-admin-token'); } catch { /* noop */ }
  location.hash = '';
  setState({
    user: null, allowedModules: [], screen: 'login', loginError: null,
    errorMsg: null, successMsg: null,
    data: {
      ideas: null, proposalsByKey: {}, clients: null, topics: null, users: null, metrics: null,
      socialPosts: null, activity: null, integrations: null, pipeline: null, notifications: null,
      newsletterSettings: null, newsletterEvents: null, services: null, roleModules: null, leads: null,
      distLog: null, distChannels: null, competitors: null, radarSources: null, radarStats: null, siteMetrics: null, fbAccounts: null,
    },
  });
}

export function tryResumeSession() {
  let saved: string | null;
  try { saved = localStorage.getItem('crea-admin-token'); } catch { saved = null; }
  if (!saved) { render(); return; }
  state.token = saved;
  adminApi<{ id: number; name: string; role: string; allowedModules: string[] }>('/api/auth/session')
    .then((session) => {
      const landing = landingFor(session.role);
      const fromHash = screenFromHash(location.hash);
      const restore = fromHash && session.allowedModules.indexOf(fromHash.screen) !== -1 ? fromHash : null;
      const screen = restore ? restore.screen : landing;
      setState({
        user: { id: session.id, name: session.name, role: session.role },
        allowedModules: session.allowedModules,
        screen,
        ...(screen === 'editor' ? { editorProposalId: restore!.extra } : {}),
      });
      if (!restore) location.hash = hashFor(landing);
      loadScreenData(screen, restore ? restore.extra : undefined);
      loadNotifBadge();
    })
    .catch(() => {
      state.token = null;
      try { localStorage.removeItem('crea-admin-token'); } catch { /* noop */ }
      render();
    });
}

export function goTo(id: Screen, extra?: number | null) {
  const allowed = state.allowedModules || [];
  if (allowed.indexOf(id) === -1) {
    setState({ screen: 'denegado', deniedTarget: id, showNotifications: false });
    return;
  }
  const patch: Partial<typeof state> = { screen: id, deniedTarget: null, showNotifications: false, mobileNavOpen: false };
  if (id === 'editor') (patch as any).editorProposalId = (extra != null ? extra : null);
  setState(patch);
  loadScreenData(id, extra);
  location.hash = hashFor(id, extra);
}

export function goHome() {
  const landing = landingFor(state.user!.role);
  setState({ screen: landing, deniedTarget: null });
  location.hash = hashFor(landing);
}

export function renderLogin(): string {
  const errorHtml = state.loginError ? `<p class="padmin-lede" style="color:var(--danger);margin:0 0 12px;">${esc(state.loginError)}</p>` : '';
  return `<div class="padmin-login-screen"><div class="padmin-login-card">
    <div class="padmin-login-brand"><span class="name">CREA</span><span class="badge">PANEL INTERNO</span></div>
    <p class="padmin-login-sub">Herramienta de trabajo para el equipo CREA</p>
    ${errorHtml}
    <form data-action="submit-login">
      <div class="padmin-field"><label for="pl-email">Correo</label><input id="pl-email" type="email" placeholder="tu@crearcontenidos.com" autocomplete="username" required></div>
      <div class="padmin-field"><label for="pl-pass">Contraseña</label><input id="pl-pass" type="password" autocomplete="current-password" required></div>
      <button type="submit" class="padmin-btn" style="width:100%;text-align:center;">Iniciar sesión</button>
    </form>
  </div></div>`;
}
