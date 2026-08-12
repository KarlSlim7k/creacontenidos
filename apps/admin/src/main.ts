// CREA Panel Admin — entry point (Vite + TS).
import { tryResumeSession } from './auth';
import { handleClick, handleSubmit, handleChange, handleInput } from './actions';
import { initPwa } from './pwa';
import { FOCUSABLE } from './router';
import { state, setState } from './store';

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')!;
  app.addEventListener('click', handleClick);
  app.addEventListener('submit', handleSubmit as EventListener);
  app.addEventListener('change', handleChange);
  app.addEventListener('input', handleInput);
  // Los toasts viven fuera de #app (ver router.ts): su botón de cerrar necesita
  // la misma delegación, si no queda muerto.
  document.getElementById('toasts')!.addEventListener('click', handleClick);
  // Enter/Espacio sobre elementos con role="button": hoy solo las filas clickable
  // del dashboard, que no contienen controles dentro. Si una fila lleva botones
  // adentro NO se le pone role="button" (sus hijos quedarían presentacionales):
  // ahí el disparador es un <button> propio. Los <button> reales ya activan con
  // teclado de forma nativa — se excluyen para no duplicar el click.
  app.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, textarea')) return;
    const el = t.closest('[role="button"]');
    if (el) { e.preventDefault(); (el as HTMLElement).click(); }
  });
  // Focus trap: con un modal abierto, Tab no debe salirse a la pantalla de atrás
  // (que sigue en el DOM y es operable con teclado, aunque visualmente esté tapada).
  // Solo la capa de arriba atrapa — con dos overlays apilados manda el último.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const overlays = app.querySelectorAll<HTMLElement>('.padmin-overlay');
    const overlay = overlays[overlays.length - 1];
    if (!overlay) return;
    // offsetParent null = oculto: un campo con display:none no debe recibir el foco.
    const items = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Escape cierra la capa de arriba. En document y no en app: si el foco quedó en
  // <body> el keydown no pasa por #app. Para los overlays se hace click en su
  // fondo, que ya lleva el data-action de cierre correcto — así no hay que
  // mantener en paralelo una lista de qué estado limpia cada modal.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const backdrops = app.querySelectorAll<HTMLElement>('.padmin-overlay .padmin-overlay-bg');
    if (backdrops.length) { backdrops[backdrops.length - 1].click(); return; }
    if (state.showNotifications) setState({ showNotifications: false });
  });
  tryResumeSession();
  initPwa();
});
