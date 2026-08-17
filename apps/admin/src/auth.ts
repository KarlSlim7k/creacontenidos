// CREA Panel Admin — auth, login y navegación entre pantallas.
import { state, setState, setData, adminApi, loadScreenData, initialState, type Screen, type ApiError, type ActivityEntry } from './store';
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

type Session = { id: number; name: string; role: string; allowedModules: string[]; requires_2fa_setup?: boolean };

// La cookie HttpOnly ya quedó emitida por login/verify; falta resolver permisos.
export function completeLogin() {
  adminApi<Session>('/api/auth/session')
    .then((session) => {
      const mustEnroll = Boolean(session.requires_2fa_setup);
      const landing = mustEnroll ? 'configuracion' : landingFor(session.role);
      setState({
        user: { id: session.id, name: session.name, role: session.role },
        allowedModules: session.allowedModules,
        screen: landing, loginError: null, loginBusy: false, loginTwoFaRequired: false,
        requiresTwoFaSetup: mustEnroll,
        ...(mustEnroll ? { configTab: 'perfil' } : {}),
      });
      location.hash = hashFor(landing);
      loadScreenData(landing);
      if (!mustEnroll) loadNotifBadge();
    })
    .catch((err: ApiError) => {
      setState({ loginError: err.status === 401 ? 'La sesión no es válida.' : 'No pudimos conectar con el servidor.', loginBusy: false, loginTwoFaRequired: false });
    });
}

export function login(email: string, password: string) {
  if (state.loginBusy) return;
  setState({ loginError: null, loginBusy: true });
  adminApi<{ requires_2fa?: boolean }>('/api/auth/login', { method: 'POST', body: { email, password } })
    .then((res) => {
      if (res.requires_2fa) {
        setState({ loginTwoFaRequired: true, loginError: null, loginBusy: false });
        return;
      }
      completeLogin();
    })
    .catch((err: ApiError) => {
      setState({
        loginBusy: false,
        loginError: err.status === 401 ? 'Correo o contraseña incorrectos.'
          : (err.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'No pudimos conectar con el servidor.'),
      });
    });
}

// Lee #reset/<token> del hash de arranque. Se llama antes de tryResumeSession en
// main.ts: si alguien llega desde el link del correo, no tiene sentido intentar
// resumir una sesión primero — puede que ni tenga una.
export function readResetTokenFromHash(): string | null {
  const match = /^#reset\/(.+)$/.exec(location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

export function forgotPassword(email: string) {
  if (state.loginBusy) return;
  setState({ loginError: null, loginBusy: true });
  adminApi('/api/auth/forgot-password', { method: 'POST', body: { email } })
    .then(() => { setState({ loginBusy: false, loginView: 'forgot-sent' }); })
    .catch((err: ApiError) => {
      setState({ loginBusy: false, loginError: err.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'No pudimos conectar con el servidor.' });
    });
}

export function resetPassword(password: string) {
  if (state.loginBusy || !state.resetToken) return;
  setState({ loginError: null, loginBusy: true });
  adminApi('/api/auth/reset-password', { method: 'POST', body: { token: state.resetToken, password } })
    .then(() => {
      location.hash = '';
      setState({ loginBusy: false, loginView: 'password', resetToken: null, successMsg: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
    })
    .catch((err: ApiError) => {
      setState({ loginBusy: false, loginError: err.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : (err.message || 'El enlace no es válido o venció.') });
    });
}

export function verify2fa(code: string, rememberDevice: boolean) {
  if (state.loginBusy) return;
  setState({ loginError: null, loginBusy: true });
  adminApi('/api/auth/2fa/verify', { method: 'POST', body: { code, remember_device: rememberDevice } })
    .then(() => { completeLogin(); })
    .catch((err: ApiError) => {
      setState({ loginBusy: false, loginError: err.status === 401 ? 'Código incorrecto.' : (err.message || 'No pudimos verificar el código.') });
    });
}

// Se refresca al navegar (ver goTo), no solo al iniciar sesión: antes el badge se
// cargaba una vez y mentía hasta recargar la página. Throttle de 30s para que
// moverse rápido entre pantallas no dispare un fetch por click.
// limit=20 y no 5: con 5, el "9+" de renderBellAndNotifs era inalcanzable.
let lastNotifFetch = 0;
export function loadNotifBadge(force?: boolean) {
  if (state.user!.role !== 'director') return;
  const now = Date.now();
  if (!force && now - lastNotifFetch < 30000) return;
  lastNotifFetch = now;
  adminApi<ActivityEntry[]>('/api/admin/activity?limit=20').then((r) => { setData({ notifications: r }); }).catch(() => { /* badge best-effort */ });
}

// Reset total y no lista de campos: enumerar a mano dejaba vivos los que nadie se
// acordaba de agregar (filtros de RADAR, tab de Configuración, borradores del editor,
// resultados de QA) — datos del usuario anterior visibles tras cambiar de sesión.
export function logout() {
  adminApi('/api/auth/logout', { method: 'POST' }).then(() => {
    location.hash = '';
    setState(initialState());
  }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function tryResumeSession() {
  adminApi<Session>('/api/auth/session')
    .then((session) => {
      const mustEnroll = Boolean(session.requires_2fa_setup);
      const landing = mustEnroll ? 'configuracion' : landingFor(session.role);
      const fromHash = screenFromHash(location.hash);
      const restore = !mustEnroll && fromHash && session.allowedModules.indexOf(fromHash.screen) !== -1 ? fromHash : null;
      const screen = restore ? restore.screen : landing;
      setState({
        user: { id: session.id, name: session.name, role: session.role },
        allowedModules: session.allowedModules,
        screen,
        requiresTwoFaSetup: mustEnroll,
        ...(mustEnroll ? { configTab: 'perfil' } : {}),
        ...(screen === 'editor' ? { editorProposalId: restore!.extra } : {}),
      });
      if (!restore) location.hash = hashFor(landing);
      loadScreenData(screen, restore ? restore.extra : undefined);
      if (!mustEnroll) loadNotifBadge();
    })
    .catch(() => {
      render();
    });
}

export function goTo(id: Screen, extra?: number | null) {
  const allowed = state.allowedModules || [];
  if (allowed.indexOf(id) === -1) {
    setState({ screen: 'denegado', deniedTarget: id, showNotifications: false });
    return;
  }
  // errorMsg se limpia al navegar: los toasts de error ya no caducan solos (ver
  // setState), así que sin esto el fallo de una pantalla perseguiría al usuario por
  // todo el panel. successMsg no hace falta, ese sí caduca.
  const patch: Partial<typeof state> = { screen: id, deniedTarget: null, showNotifications: false, mobileNavOpen: false, errorMsg: null };
  if (id === 'editor') (patch as any).editorProposalId = (extra != null ? extra : null);
  setState(patch);
  loadScreenData(id, extra);
  loadNotifBadge();
  location.hash = hashFor(id, extra);
}

export function goHome() {
  const landing = landingFor(state.user!.role);
  setState({ screen: landing, deniedTarget: null });
  location.hash = hashFor(landing);
}

// Botón "ojito": toggle-password (ver actions.ts) alterna type text/password del
// input hermano vía DOM directo, sin pasar por setState — un re-render mientras
// se escribe borraría lo tecleado (el input es no controlado, ver router.ts).
const eyeIconOpen = '<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeIconClosed = '<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function loginBrand(): string {
  return `<div class="padmin-login-brand"><img src="${import.meta.env.BASE_URL}assets/img/logo-crea.png" alt="CREA Contenidos" class="padmin-login-logo"><span class="badge">PANEL INTERNO</span></div>`;
}

function passwordField(id: string, label: string, autocomplete: string, minlength?: number): string {
  return `<div class="padmin-field"><label for="${id}">${label}</label>
    <div class="padmin-password-wrap">
      <input id="${id}" type="password" autocomplete="${autocomplete}" required ${minlength ? `minlength="${minlength}"` : ''}>
      <button type="button" class="padmin-password-toggle" data-action="toggle-password" data-target="${id}" aria-controls="${id}" aria-pressed="false" aria-label="Mostrar contraseña" title="Mostrar contraseña"><span data-eye-show>${eyeIconOpen}</span><span data-eye-hide hidden>${eyeIconClosed}</span></button>
    </div>
  </div>`;
}

export function renderLogin(): string {
  const errorHtml = state.loginError ? `<p class="padmin-lede" style="color:var(--danger);margin:0 0 12px;">${esc(state.loginError)}</p>` : '';
  if (state.loginTwoFaRequired) {
    return `<div class="padmin-login-screen"><div class="padmin-login-card">
      ${loginBrand()}
      <p class="padmin-login-sub">Ingresa el código de tu app de autenticación</p>
      ${errorHtml}
      <form data-action="submit-2fa-verify">
        <div class="padmin-field"><label for="pl-2fa-code">Código de 6 dígitos (o un código de respaldo)</label><input id="pl-2fa-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="64" required autofocus></div>
        <div class="padmin-field padmin-field-inline"><input id="pl-2fa-remember" type="checkbox"><label for="pl-2fa-remember">Confiar en este dispositivo por 30 días</label></div>
        <button type="submit" class="padmin-btn" style="width:100%;text-align:center;" ${state.loginBusy ? 'disabled' : ''}>${state.loginBusy ? 'Verificando…' : 'Verificar'}</button>
      </form>
    </div></div>`;
  }
  if (state.loginView === 'forgot') {
    return `<div class="padmin-login-screen"><div class="padmin-login-card">
      ${loginBrand()}
      <p class="padmin-login-sub">Te mandamos un enlace para elegir una nueva contraseña</p>
      ${errorHtml}
      <form data-action="submit-forgot-password">
        <div class="padmin-field"><label for="pl-forgot-email">Correo</label><input id="pl-forgot-email" type="email" placeholder="tu@crea-contenidos.com" autocomplete="username" required autofocus></div>
        <button type="submit" class="padmin-btn" style="width:100%;text-align:center;" ${state.loginBusy ? 'disabled' : ''}>${state.loginBusy ? 'Enviando…' : 'Enviar enlace'}</button>
      </form>
      <p style="margin:16px 0 0;text-align:center;"><button type="button" data-action="show-login" style="background:none;border:none;cursor:pointer;font-size:var(--fs-sm);color:var(--text-mute);text-decoration:underline;">&larr; Volver a iniciar sesión</button></p>
    </div></div>`;
  }
  if (state.loginView === 'forgot-sent') {
    return `<div class="padmin-login-screen"><div class="padmin-login-card">
      ${loginBrand()}
      <p class="padmin-login-sub">Si ese correo existe en el panel, ya te llegó un enlace para recuperar tu contraseña. Revisa también spam.</p>
      <button type="button" class="padmin-btn" data-action="show-login" style="width:100%;text-align:center;">Volver a iniciar sesión</button>
    </div></div>`;
  }
  if (state.loginView === 'reset') {
    return `<div class="padmin-login-screen"><div class="padmin-login-card">
      ${loginBrand()}
      <p class="padmin-login-sub">Elige tu nueva contraseña</p>
      ${errorHtml}
      <form data-action="submit-reset-password">
        ${passwordField('pl-reset-pass', 'Nueva contraseña', 'new-password', 8)}
        ${passwordField('pl-reset-confirm', 'Confirmar nueva contraseña', 'new-password', 8)}
        <button type="submit" class="padmin-btn" style="width:100%;text-align:center;" ${state.loginBusy ? 'disabled' : ''}>${state.loginBusy ? 'Guardando…' : 'Guardar contraseña'}</button>
      </form>
    </div></div>`;
  }
  return `<div class="padmin-login-screen"><div class="padmin-login-card">
    ${loginBrand()}
    <p class="padmin-login-sub">Herramienta de trabajo para el equipo CREA</p>
    ${errorHtml}
    <form data-action="submit-login">
      <div class="padmin-field"><label for="pl-email">Correo</label><input id="pl-email" type="email" placeholder="tu@crea-contenidos.com" autocomplete="username" required></div>
      ${passwordField('pl-pass', 'Contraseña', 'current-password')}
      <button type="submit" class="padmin-btn" style="width:100%;text-align:center;" ${state.loginBusy ? 'disabled' : ''}>${state.loginBusy ? 'Ingresando…' : 'Iniciar sesión'}</button>
    </form>
    <p style="margin:16px 0 0;text-align:center;"><button type="button" data-action="show-forgot-password" style="background:none;border:none;cursor:pointer;font-size:var(--fs-sm);color:var(--text-mute);text-decoration:underline;">¿Olvidaste tu contraseña?</button></p>
  </div></div>`;
}
