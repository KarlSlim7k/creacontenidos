// CREA Panel Admin — render raíz y mapa de pantallas.
import { state, setRender } from './store.js';
import { renderLogin } from './auth.js';
import { renderShell } from './shell.js';
import { renderDashboard } from './dashboard.js';
import { renderIdeas } from './ideas.js';
import { renderEditor } from './editor.js';
import { renderAprobacion } from './aprobacion.js';
import { renderComercial, renderLeads } from './comercial.js';
import { renderMetricas } from './metricas.js';
import { renderRadar } from './radar.js';
import { renderPropuestas } from './propuestas.js';
import { renderHermes, renderPipeline } from './hermes.js';
import { renderProducciones, renderPublicadas } from './producciones.js';
import { renderConfiguracion } from './configuracion.js';
import { renderDenegado } from './denegado.js';

var screenRenderers = {
  dashboard: renderDashboard, ideas: renderIdeas, editor: renderEditor, aprobacion: renderAprobacion,
  comercial: renderComercial, leads: renderLeads, metricas: renderMetricas, radar: renderRadar, propuestas: renderPropuestas,
  producciones: renderProducciones, publicadas: renderPublicadas,
  hermes: renderHermes, pipeline: renderPipeline, denegado: renderDenegado, configuracion: renderConfiguracion
};

export function render() {
  var app = document.getElementById('app');
  if (state.screen === 'login' || !state.user) {
    app.innerHTML = renderLogin();
    return;
  }
  var fn = screenRenderers[state.screen] || renderDashboard;
  app.innerHTML = renderShell(fn());
}

setRender(render);
