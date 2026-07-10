// CREA Panel Admin — pantallas Aprobación y Distribución.
import { state } from './store.js';
import { esc, loadingCard, relativeTime } from './util.js';

var transparencyLabels = ['100% humano', 'Asistido por IA', 'Generado con IA'];

function renderAprobacionDesktop(piecesInReview) {
  return '<div class="padmin-card">' + piecesInReview.map(function (p) {
    var selected = state.transparency[p.id];
    var approveBg = selected ? 'var(--brand)' : 'var(--bg-soft)';
    var approveColor = selected ? '#fff' : 'var(--mute-2)';
    var chips = transparencyLabels.map(function (label) {
      var active = selected === label;
      return '<span class="padmin-chip" data-action="set-transparency" data-piece="' + p.id + '" data-label="' + esc(label) + '" style="background:' + (active ? 'var(--brand)' : 'var(--bg-soft)') + ';color:' + (active ? '#fff' : 'var(--text-mute)') + ';border-color:' + (active ? 'var(--brand)' : 'var(--line-soft)') + ';">' + esc(label) + '</span>';
    }).join('');
    return '<div style="padding:16px 18px;border-bottom:0.5px solid var(--line-soft);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div><p class="padmin-row-title" style="font-size:14px;">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section || '') + '</p></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<span class="padmin-btn-sm" style="background:' + approveBg + ';color:' + approveColor + ';cursor:' + (selected ? 'pointer' : 'not-allowed') + ';" ' + (selected ? 'data-action="approve-piece" data-id="' + p.id + '"' : '') + '>Aprobar</span>' +
          '<span class="padmin-btn-sm padmin-btn-outline" style="font-weight:500;" data-action="open-comentario" data-id="' + p.id + '">Devolver con comentarios</span>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-size:11px;color:var(--text-mute);margin-right:2px;">Origen del contenido (obligatorio):</span>' + chips + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function renderComentarioModal() {
  if (state.comentarioPieceId == null) return '';
  var pieces = state.data.proposalsByKey.en_revision || [];
  var piece = pieces.filter(function (p) { return p.id === state.comentarioPieceId; })[0];
  if (!piece) return '';
  return '<div class="padmin-overlay">' +
    '<div class="padmin-overlay-bg" data-action="close-comentario"></div>' +
    '<div class="padmin-modal">' +
      '<p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">Devolver con comentarios</p>' +
      '<p style="font-size:12px;color:var(--text-mute);margin:0 0 16px;">' + esc(piece.title) + '</p>' +
      '<label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:6px;">Motivo de la devolución</label>' +
      '<textarea id="comentario-text" placeholder="Describe qué debe ajustarse antes de publicar..." style="width:100%;min-height:100px;border:0.5px solid var(--line-soft);border-radius:6px;background:var(--bg-admin);padding:10px 12px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical;margin-bottom:16px;">' + esc(state.comentarioText) + '</textarea>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
        '<button type="button" class="padmin-btn-outline" data-action="close-comentario">Cancelar</button>' +
        '<button type="button" class="padmin-btn" data-action="confirm-comentario" data-id="' + piece.id + '">Confirmar devolución</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderDistribucion() {
  var published = state.data.proposalsByKey.published;
  var channels = state.data.distChannels;
  if (!published || !channels) return '';
  var lastPush = {};
  (state.data.distLog || []).forEach(function (e) {
    var k = e.proposal_id + ':' + e.platform;
    if (!lastPush[k]) lastPush[k] = e;
  });
  var rows = published.slice(0, 10).map(function (p) {
    var buttons = channels.map(function (ch) {
      var push = lastPush[p.id + ':' + ch.channel];
      var busy = state.distBusy === ch.channel + ':' + p.id;
      var mark = '';
      if (push && push.status === 'ok') mark = '<span title="Enviado ' + esc(relativeTime(push.published_at)) + '" style="color:var(--brand);font-size:11px;margin-left:2px;">✓</span>';
      else if (push) mark = '<span title="' + esc(push.detail || 'Falló') + '" style="color:var(--danger);font-size:11px;margin-left:2px;">✕</span>';
      return '<span style="display:inline-flex;align-items:center;">' +
        '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="distribute" data-channel="' + ch.channel + '" data-id="' + p.id + '" ' +
        (!ch.connected || busy ? 'disabled' : '') + (!ch.connected ? ' title="Canal no configurado (variables de entorno)"' : '') + '>' +
        (busy ? 'Enviando…' : esc(ch.label)) + '</button>' + mark + '</span>';
    }).join('');
    return '<div class="padmin-row" style="flex-wrap:wrap;gap:8px;">' +
      '<div style="min-width:0;"><p class="padmin-row-title">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section || '') + (p.published_at ? ' · publicada ' + esc(relativeTime(p.published_at)) : '') + '</p></div>' +
      '<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' + buttons + '</span>' +
    '</div>';
  }).join('');
  return '<p style="font-size:12px;font-weight:600;color:var(--text);margin:28px 0 12px;">Distribución &middot; publicadas recientes</p>' +
    '<div class="padmin-card">' + (rows || '<div class="padmin-row"><p class="padmin-row-meta">Todavía no hay notas publicadas para distribuir.</p></div>') + '</div>';
}

export function renderAprobacion() {
  var piecesInReview = state.data.proposalsByKey.en_revision;
  if (!piecesInReview) return loadingCard();
  return '<div>' +
    '<h1 class="padmin-h1">Aprobación</h1>' +
    '<p class="padmin-lede">Piezas pendientes de revisión editorial.</p>' +
    (piecesInReview.length ? renderAprobacionDesktop(piecesInReview) : loadingCard('Nada en revisión.')) +
    renderDistribucion() +
    renderComentarioModal() +
  '</div>';
}
