// CREA Panel Admin — entry point (ES module). Reemplaza el IIFE de panel.js.
import { tryResumeSession } from './auth.js';
import { handleClick, handleSubmit, handleChange } from './actions.js';

document.addEventListener('DOMContentLoaded', function () {
  var app = document.getElementById('app');
  app.addEventListener('click', handleClick);
  app.addEventListener('submit', handleSubmit);
  app.addEventListener('change', handleChange);
  tryResumeSession();
});
