// CREA Panel Admin — pantallas Aprobación y Distribución.
import { state, type Proposal, type DistLogEntry, type DistChannel } from '../store';
import { esc, loadingCard, errorCard, relativeTime } from '../util';

const transparencyLabels = ['100% humano', 'Asistido por IA', 'Generado con IA'];

function renderAprobacionDesktop(piecesInReview: Proposal[]): string {
  return `<div class="padmin-card">${piecesInReview.map((p) => {
    const selected = state.transparency[p.id];
    const chips = transparencyLabels.map((label) => {
      const active = selected === label;
      return `<button type="button" class="padmin-chip${active ? ' active' : ''}" data-action="set-transparency" data-piece="${p.id}" data-label="${esc(label)}">${esc(label)}</button>`;
    }).join('');
    return `<div style="padding:16px 18px;border-bottom:0.5px solid var(--line-soft);">
      <div class="padmin-review-head">
        <div><p class="padmin-row-title" style="font-size:14px;">${esc(p.title)}</p><p class="padmin-row-meta">${esc(p.section || '')}</p></div>
        <div class="padmin-review-actions">
          <button type="button" class="padmin-btn-sm padmin-btn-brand" data-action="approve-piece" data-id="${p.id}" ${selected ? '' : 'disabled'}>Aprobar</button>
          <button type="button" class="padmin-btn-sm padmin-btn-outline" style="font-weight:500;" data-action="open-comentario" data-id="${p.id}">Devolver con comentarios</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-size:11px;color:var(--text-mute);margin-right:2px;">Origen del contenido (obligatorio):</span>${chips}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderComentarioModal(): string {
  if (state.comentarioPieceId == null) return '';
  const pieces = state.data.proposalsByKey.en_revision || [];
  const piece = pieces.filter((p: Proposal) => p.id === state.comentarioPieceId)[0];
  if (!piece) return '';
  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-comentario"></div>
    <div class="padmin-modal">
      <p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">Devolver con comentarios</p>
      <p style="font-size:12px;color:var(--text-mute);margin:0 0 16px;">${esc(piece.title)}</p>
      <label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:6px;">Motivo de la devolución</label>
      <textarea id="comentario-text" class="padmin-modal-textarea" placeholder="Describe qué debe ajustarse antes de publicar...">${esc(state.comentarioText)}</textarea>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button type="button" class="padmin-btn-outline" data-action="close-comentario">Cancelar</button>
        <button type="button" class="padmin-btn" data-action="confirm-comentario" data-id="${piece.id}">Confirmar devolución</button>
      </div>
    </div>
  </div>`;
}

function renderDistribucion(): string {
  const published = state.data.proposalsByKey.published;
  const channels = state.data.distChannels;
  if (!published || !channels) return '';
  const lastPush: Record<string, DistLogEntry> = {};
  (state.data.distLog || []).forEach((e: DistLogEntry) => {
    const k = e.proposal_id + ':' + e.platform;
    if (!lastPush[k]) lastPush[k] = e;
  });
  const rows = published.slice(0, 10).map((p: Proposal) => {
    const buttons = channels.map((ch: DistChannel) => {
      const push = lastPush[p.id + ':' + ch.channel];
      const busy = state.distBusy === ch.channel + ':' + p.id;
      let mark = '';
      if (push && push.status === 'ok') mark = `<span title="Enviado ${esc(relativeTime(push.published_at))}" style="color:var(--brand);font-size:11px;margin-left:2px;">✓</span>`;
      else if (push) mark = `<span title="${esc(push.detail || 'Falló')}" style="color:var(--danger);font-size:11px;margin-left:2px;">✕</span>`;
      return `<span style="display:inline-flex;align-items:center;">
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="distribute" data-channel="${ch.channel}" data-id="${p.id}" ${!ch.connected || busy ? 'disabled' : ''}${!ch.connected ? ' title="Canal no configurado (variables de entorno)"' : ''}>${busy ? 'Enviando…' : esc(ch.label)}</button>${mark}</span>`;
    }).join('');
    return `<div class="padmin-row" style="flex-wrap:wrap;gap:8px;">
      <div style="min-width:0;"><p class="padmin-row-title">${esc(p.title)}</p><p class="padmin-row-meta">${esc(p.section || '')}${p.published_at ? ' · publicada ' + esc(relativeTime(p.published_at)) : ''}</p></div>
      <span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">${buttons}</span>
    </div>`;
  }).join('');
  return `<p class="padmin-section-title" style="margin-top:28px;">Distribución &middot; publicadas recientes</p>
    <div class="padmin-card">${rows || '<div class="padmin-row"><p class="padmin-row-meta">Todavía no hay notas publicadas para distribuir.</p></div>'}</div>`;
}

export function renderAprobacion(): string {
  const piecesInReview = state.data.proposalsByKey.en_revision;
  if (!piecesInReview) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  return `<div>
    <h1 class="padmin-h1">Aprobación</h1>
    <p class="padmin-lede">Piezas pendientes de revisión editorial.</p>
    ${piecesInReview.length ? renderAprobacionDesktop(piecesInReview) : loadingCard('Nada en revisión.')}
    ${renderDistribucion()}
    ${renderComentarioModal()}
  </div>`;
}
