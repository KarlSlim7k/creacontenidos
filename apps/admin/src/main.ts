// CREA Panel Admin — entry point (Vite + TS).
import { tryResumeSession } from './auth';
import { handleClick, handleSubmit, handleChange } from './actions';
import { initPwa } from './pwa';
import { state, setState } from './store';

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')!;
  app.addEventListener('click', handleClick);
  app.addEventListener('submit', handleSubmit as EventListener);
  app.addEventListener('change', handleChange);
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
