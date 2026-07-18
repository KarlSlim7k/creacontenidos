// CREA Panel Admin — render raíz y mapa de pantallas.
import { state, setRender, type Screen } from './store';
import { renderLogin } from './auth';
import { renderShell } from './shell';
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

export function render() {
  const app = document.getElementById('app')!;
  if (state.screen === 'login' || !state.user) {
    app.innerHTML = renderLogin();
    return;
  }
  const fn = screenRenderers[state.screen] || renderDashboard;
  app.innerHTML = renderShell(fn());
}

setRender(render);
