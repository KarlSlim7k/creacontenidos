// CREA Panel Admin — pantalla Propuestas IA.
import { state, type Proposal } from '../store';
import { esc, loadingCard, errorCard } from '../util';

const sensColorMap: Record<string, string> = { verde: 'var(--brand)', amarillo: 'var(--accent-2)', rojo: 'var(--danger)' };

function renderPropuestasRechazadas(): string {
  const rechazadas = state.data.proposalsByKey.rechazada;
  if (!rechazadas || !rechazadas.length || state.user!.role !== 'director') return '';
  return `<p style="font-size:12px;font-weight:600;color:var(--text);margin:24px 0 12px;">Rechazadas</p>
    <div class="padmin-card">${rechazadas.map((p: Proposal) =>
      `<div class="padmin-row"><div><p class="padmin-row-title">${esc(p.title)}</p><p class="padmin-row-meta">${esc(p.review_comment || '')}</p></div>
        <button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-propuesta" data-id="${p.id}">Eliminar</button></div>`
    ).join('')}</div>`;
}

export function renderPropuestas(): string {
  const proposals = state.data.proposalsByKey.propuesta;
  if (!proposals) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  return `<div>
    <h1 class="padmin-h1">Propuestas de contenido</h1>
    <p class="padmin-lede">Generadas a partir de temas detectados en RADAR. Aprobar pasa la pieza al Editor de nota.</p>
    <div class="padmin-propuestas-grid">${proposals.length ? proposals.map((p: Proposal) => {
      const isRejecting = state.propuestaRejecting === p.id;
      let body: string;
      if (isRejecting) {
        body = `<div><label style="font-size:11px;color:var(--text-mute);display:block;margin:0 0 6px;">Motivo del rechazo</label>
          <textarea id="reject-reason-${p.id}" style="width:100%;min-height:56px;border:0.5px solid var(--line-soft);border-radius:6px;background:var(--bg-admin);margin-bottom:8px;padding:8px;font:inherit;font-size:12px;box-sizing:border-box;"></textarea>
          <button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="confirm-reject-propuesta" data-id="${p.id}">Confirmar rechazo</button></div>`;
      } else {
        body = `<div style="display:flex;gap:6px;">
          <button type="button" class="padmin-btn-sm" style="background:var(--brand);color:#fff;" data-action="approve-propuesta" data-id="${p.id}">Aprobar</button>
          <button type="button" class="padmin-btn-sm padmin-btn-danger-outline" data-action="start-reject-propuesta" data-id="${p.id}">Rechazar</button>
        </div>`;
      }
      return `<div class="padmin-propuesta-card">
        <span class="padmin-sens-dot" style="background:${sensColorMap[p.sensibilidad || ''] || 'var(--text-mute)'};"></span>
        <p style="font-size:10px;font-weight:600;color:var(--accent-text);background:var(--accent-soft);display:inline-block;padding:3px 8px;border-radius:4px;margin:0 0 10px;">${esc(p.format)}</p>
        <p style="font-size:13px;font-weight:500;color:var(--text);margin:0 0 10px;line-height:1.35;">${esc(p.title)}</p>
        <p style="font-size:12px;color:var(--text-2);margin:0 0 16px;line-height:1.4;">${esc(p.angulo || '')}</p>
        ${body}
      </div>`;
    }).join('') : '<p class="padmin-lede">Sin propuestas pendientes de decisión.</p>'}</div>
    ${renderPropuestasRechazadas()}
  </div>`;
}
