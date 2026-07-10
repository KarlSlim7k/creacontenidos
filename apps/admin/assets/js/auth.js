// CREA Panel Admin — auth, login y navegación entre pantallas.
import { state, setState, setData, adminApi, loadScreenData } from './store.js';
import { landingFor, esc } from './util.js';

export function login(email, password) {
  setState({ loginError: null });
  adminApi('/api/auth/login', { method: 'POST', body: { email: email, password: password } })
    .then(function (res) {
      state.token = res.token;
      try { localStorage.setItem('crea-admin-token', res.token); } catch (e) { /* modo privado */ }
      return adminApi('/api/auth/session');
    })
    .then(function (session) {
      var landing = landingFor(session.role);
      setState({
        user: { id: session.id, name: session.name, role: session.role },
        allowedModules: session.allowedModules,
        screen: landing, loginError: null
      });
      loadScreenData(landing);
      loadNotifBadge();
    })
    .catch(function (err) {
      state.token = null;
      try { localStorage.removeItem('crea-admin-token'); } catch (e) { /* noop */ }
      setState({ loginError: err.status === 401 ? 'Correo o contraseña incorrectos.' : 'No pudimos conectar con el servidor.' });
    });
}

export function loadNotifBadge() {
  if (state.user.role !== 'director') return;
  adminApi('/api/admin/activity?limit=5').then(function (r) { setData({ notifications: r }); }).catch(function () { /* badge best-effort */ });
}

export function logout() {
  state.token = null;
  try { localStorage.removeItem('crea-admin-token'); } catch (e) { /* noop */ }
  setState({
    user: null, allowedModules: [], screen: 'login', loginError: null,
    errorMsg: null, successMsg: null,
    data: { ideas: null, proposalsByKey: {}, clients: null, topics: null, users: null, metrics: null, socialPosts: null, activity: null, integrations: null, pipeline: null, notifications: null, newsletterSettings: null, newsletterEvents: null }
  });
}

export function tryResumeSession() {
  var saved;
  try { saved = localStorage.getItem('crea-admin-token'); } catch (e) { saved = null; }
  if (!saved) return render();
  state.token = saved;
  adminApi('/api/auth/session')
    .then(function (session) {
      var landing = landingFor(session.role);
      setState({
        user: { id: session.id, name: session.name, role: session.role },
        allowedModules: session.allowedModules,
        screen: landing
      });
      loadScreenData(landing);
      loadNotifBadge();
    })
    .catch(function () {
      state.token = null;
      try { localStorage.removeItem('crea-admin-token'); } catch (e) { /* noop */ }
      render();
    });
}

export function goTo(id, extra) {
  var allowed = state.allowedModules || [];
  if (allowed.indexOf(id) === -1) {
    setState({ screen: 'denegado', deniedTarget: id, showNotifications: false });
    return;
  }
  var patch = { screen: id, deniedTarget: null, showNotifications: false, mobileNavOpen: false };
  if (id === 'editor') patch.editorProposalId = (extra != null ? extra : null);
  setState(patch);
  loadScreenData(id, extra);
}

export function goHome() {
  setState({ screen: landingFor(state.user.role), deniedTarget: null });
}

export function renderLogin() {
  var errorHtml = state.loginError ? '<p class="padmin-lede" style="color:var(--danger);margin:0 0 12px;">' + esc(state.loginError) + '</p>' : '';
  return '<div class="padmin-login-screen"><div class="padmin-login-card">' +
    '<div class="padmin-login-brand"><span class="name">CREA</span><span class="badge">PANEL INTERNO</span></div>' +
    '<p class="padmin-login-sub">Herramienta de trabajo para el equipo CREA</p>' +
    errorHtml +
    '<form data-action="submit-login">' +
      '<div class="padmin-field"><label for="pl-email">Correo</label><input id="pl-email" type="email" placeholder="tu@crearcontenidos.com" autocomplete="username" required></div>' +
      '<div class="padmin-field"><label for="pl-pass">Contraseña</label><input id="pl-pass" type="password" autocomplete="current-password" required></div>' +
      '<button type="submit" class="padmin-btn" style="width:100%;text-align:center;">Iniciar sesión</button>' +
    '</form>' +
  '</div></div>';
}
