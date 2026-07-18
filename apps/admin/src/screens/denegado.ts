// CREA Panel Admin — pantalla de acceso denegado.
import { state } from '../store';
import { esc, navItemsAll, roleLabels, landingFor } from '../util';

export function renderDenegado(): string {
  const deniedLabelMap: Record<string, string> = {};
  navItemsAll.forEach((n) => { deniedLabelMap[n.id] = n.label; });
  const label = state.deniedTarget ? (deniedLabelMap[state.deniedTarget] || state.deniedTarget) : '';
  return `<div class="padmin-denied-wrap"><div style="max-width:380px;text-align:center;">
    <div class="padmin-denied-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
    <h1 class="padmin-h1">Sin acceso</h1>
    <p style="font-size:13px;color:var(--text-mute);margin:0 0 24px;line-height:1.5;">Tu rol (${esc(roleLabels[state.user!.role] || state.user!.role)}) no tiene permiso para ver «${esc(label)}». Si crees que esto es un error, contacta a tu Director editorial.</p>
    <button type="button" class="padmin-btn" data-action="goto" data-id="${landingFor(state.user!.role)}">Volver a Inicio</button>
  </div></div>`;
}
