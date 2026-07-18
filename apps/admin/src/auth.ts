// CREA Panel Admin — auth, login y navegación entre pantallas.
import { state, setState, setData, adminApi, loadScreenData, type Screen, type ApiError } from './store';
import { landingFor, esc } from './util';
// Import circular con router.ts (router importa renderLogin de aquí): seguro porque
// render es function declaration y solo se llama en runtime, nunca durante la carga.
import { render } from './router';

// Recuerda la pantalla actual entre refrescos (sessionStorage: por pestaña, se
// borra sola al cerrar). El SPA no tiene URLs reales por pantalla — esto evita
// que un F5 mande siempre a Inicio sin necesitar un router de navegador.
const SCREEN_KEY = 'crea-admin-last-screen';

function persistScreen(id: Screen, extra?: number | null) {
  try { sessionStorage.setItem(SCREEN_KEY, JSON.stringify({ screen: id, extra: extra ?? null })); } catch { /* modo privado */ }
}

function readPersistedScreen(): { screen: Screen; extra: number | null } | null {
  try {
    const raw = sessionStorage.getItem(SCREEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

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
  adminApi('/api/admin/activity?limit=5').then((r) => { setData({ notifications: r as any[] }); }).catch(() => { /* badge best-effort */ });
}

export function logout() {
  state.token = null;
  try { localStorage.removeItem('crea-admin-token'); } catch { /* noop */ }
  try { sessionStorage.removeItem(SCREEN_KEY); } catch { /* noop */ }
  setState({
    user: null, allowedModules: [], screen: 'login', loginError: null,
    errorMsg: null, successMsg: null,
    data: {
      ideas: null, proposalsByKey: {}, clients: null, topics: null, users: null, metrics: null,
      socialPosts: null, activity: null, integrations: null, pipeline: null, notifications: null,
      newsletterSettings: null, newsletterEvents: null, services: null, roleModules: null, leads: null,
      distLog: null, distChannels: null, competitors: null, siteMetrics: null, fbAccounts: null,
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
      const persisted = readPersistedScreen();
      const restore = persisted && session.allowedModules.indexOf(persisted.screen) !== -1 ? persisted : null;
      const screen = restore ? restore.screen : landing;
      setState({
        user: { id: session.id, name: session.name, role: session.role },
        allowedModules: session.allowedModules,
        screen,
        ...(screen === 'editor' ? { editorProposalId: restore!.extra } : {}),
      });
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
  persistScreen(id, extra);
}

export function goHome() {
  const landing = landingFor(state.user!.role);
  setState({ screen: landing, deniedTarget: null });
  persistScreen(landing);
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
