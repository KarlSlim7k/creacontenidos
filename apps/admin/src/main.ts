// CREA Panel Admin — entry point (Vite + TS).
import { tryResumeSession } from './auth';
import { handleClick, handleSubmit, handleChange } from './actions';
import { initPwa } from './pwa';

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app')!;
  app.addEventListener('click', handleClick);
  app.addEventListener('submit', handleSubmit as EventListener);
  app.addEventListener('change', handleChange);
  tryResumeSession();
  initPwa();
});
