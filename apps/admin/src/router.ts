// CREA Panel Admin — render raíz y mapa de pantallas.
import { state, setRender, setRenderToasts, type Screen } from './store';
import { renderLogin } from './auth';
import { renderShell, renderToasts } from './shell';
import { renderDashboard } from './screens/dashboard';
import { renderIdeas } from './screens/ideas';
import { renderEditor } from './screens/editor';
import { renderAprobacion } from './screens/aprobacion';
import { renderComercial, renderLeads } from './screens/comercial';
import { renderMetricas } from './screens/metricas';
import { renderRadar } from './screens/radar';
import { renderPropuestas } from './screens/propuestas';
import { renderHermes, renderPipeline } from './screens/hermes';
import { renderProducciones, renderPublicadas } from './screens/producciones';
import { renderConfiguracion } from './screens/configuracion';
import { renderDenegado } from './screens/denegado';

const screenRenderers: Record<Exclude<Screen, 'login'>, () => string> = {
  dashboard: renderDashboard, ideas: renderIdeas, editor: renderEditor, aprobacion: renderAprobacion,
  comercial: renderComercial, leads: renderLeads, metricas: renderMetricas, radar: renderRadar, propuestas: renderPropuestas,
  producciones: renderProducciones, publicadas: renderPublicadas,
  hermes: renderHermes, pipeline: renderPipeline, denegado: renderDenegado, configuracion: renderConfiguracion,
};

export function renderToastStack() {
  document.getElementById('toasts')!.innerHTML = renderToasts();
}

interface FocusSnapshot { key: string | null; start: number | null; end: number | null; scroll: number }

// Cómo volver a encontrar el elemento enfocado después de que innerHTML lo destruyó.
// El id solo existe en campos de formulario: los botones del panel no lo llevan, pero
// sí data-action (+ data-id), que sobrevive al repintado y los identifica igual.
function focusKeyOf(el: Element): string | null {
  if (el.id) return '#' + CSS.escape(el.id);
  const action = el.getAttribute('data-action');
  if (!action) return null;
  const id = el.getAttribute('data-id');
  // El tag es parte de la clave, no decoración: una fila clickable y el botón que
  // lleva dentro comparten data-action y data-id (RADAR, Editor), así que sin él
  // querySelector devolvía el <div> de la fila — que no acepta foco, y el foco se perdía.
  return el.tagName.toLowerCase() + `[data-action="${CSS.escape(action)}"]` + (id ? `[data-id="${CSS.escape(id)}"]` : '');
}

// Red de seguridad del re-render total: sin esto, cualquier setState mientras el
// encargado escribe le mueve el cursor al inicio del campo (o se lo quita). No
// sustituye a sincronizar el form al state — solo evita el salto visible.
function captureFocus(): FocusSnapshot {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  const content = document.querySelector('.padmin-content');
  let start: number | null = null;
  let end: number | null = null;
  // selectionStart lanza InvalidStateError en input[type=email|number]: no todos
  // los tipos exponen selección, y ahí solo interesa recuperar el foco.
  try { start = el ? el.selectionStart : null; end = el ? el.selectionEnd : null; } catch { /* tipo sin selección */ }
  return { key: el ? focusKeyOf(el) : null, start, end, scroll: content ? content.scrollTop : 0 };
}

function restoreFocus(snap: FocusSnapshot) {
  const content = document.querySelector('.padmin-content');
  if (content && snap.scroll) content.scrollTop = snap.scroll;
  if (!snap.key) return;
  const el = document.querySelector(snap.key) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return;
  el.focus();
  if (snap.start != null) {
    try { el.setSelectionRange(snap.start, snap.end != null ? snap.end : snap.start); } catch { /* tipo sin selección */ }
  }
}

export const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Foco de modales, centralizado: los 5 overlays comparten estructura, así que la
// regla vive aquí y no repetida en cada pantalla. Al abrir se recuerda quién tenía el
// foco (por focusKeyOf, porque el re-render destruye el nodo) y al cerrar se le
// devuelve — si no, cerrar un modal dejaba el foco en <body> y el teclado volvía
// al inicio de la página, lejos de la fila donde estaba trabajando.
let overlayWasOpen = false;
let focusReturnKey: string | null = null;

function manageOverlayFocus(previousFocusKey: string | null) {
  const overlays = document.querySelectorAll<HTMLElement>('.padmin-overlay');
  const overlay = overlays[overlays.length - 1];
  if (overlay) {
    if (!overlayWasOpen) { focusReturnKey = previousFocusKey; overlayWasOpen = true; }
    if (!overlay.contains(document.activeElement)) {
      const first = overlay.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
    }
    return;
  }
  if (overlayWasOpen) {
    overlayWasOpen = false;
    const back = focusReturnKey ? document.querySelector<HTMLElement>(focusReturnKey) : null;
    focusReturnKey = null;
    if (back) back.focus();
  }
}

export function render() {
  const app = document.getElementById('app')!;
  const snap = captureFocus();
  if (state.screen === 'login' || !state.user) {
    app.innerHTML = renderLogin();
  } else {
    const fn = screenRenderers[state.screen] || renderDashboard;
    app.innerHTML = renderShell(fn());
  }
  restoreFocus(snap);
  manageOverlayFocus(snap.key);
  renderToastStack();
}

setRender(render);
setRenderToasts(renderToastStack);
