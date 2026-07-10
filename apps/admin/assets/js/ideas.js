// CREA Panel Admin — pantalla Bandeja de ideas.
import { state } from './store.js';
import { esc, badge, loadingCard, STATUS_LABEL, initialsOf } from './util.js';

function ideaCard(i, canMove) {
  var moveHtml = canMove ? '<select data-action="move-idea" data-id="' + i.id + '" style="font-size:10px;border:0.5px solid var(--line-soft);border-radius:4px;padding:2px 4px;">' +
    ['nueva', 'en_analisis', 'aprobada', 'descartada'].map(function (c) {
      return '<option value="' + c + '"' + (i.column_status === c ? ' selected' : '') + '>' + esc(STATUS_LABEL[c]) + '</option>';
    }).join('') + '</select>' : '';
  var deleteHtml = (canMove && state.user.role === 'director')
    ? '<button type="button" class="padmin-btn-sm padmin-btn-outline" style="margin-top:8px;" data-action="delete-idea" data-id="' + i.id + '">Eliminar</button>' : '';
  return '<div class="padmin-idea-card' + (i.column_status === 'descartada' ? ' discarded' : '') + '">' +
    '<p class="padmin-idea-cat">' + esc(i.category || '') + '</p>' +
    '<p class="padmin-idea-title">' + esc(i.title) + '</p>' +
    '<div class="padmin-idea-foot"><span class="padmin-idea-score">' + (i.score != null ? 'Score ' + i.score : '') + '</span><span class="padmin-idea-avatar">' + initialsOf(i.collaborator_name) + '</span></div>' +
    (moveHtml ? '<div style="margin-top:8px;">' + moveHtml + '</div>' : '') +
    deleteHtml +
  '</div>';
}

function ideasKanban() {
  var ideas = state.data.ideas;
  if (!ideas) return loadingCard();
  var canMove = state.user.role === 'director' || state.user.role === 'produccion';
  var cols = [
    { title: 'NUEVA', key: 'nueva' }, { title: 'EN ANÁLISIS', key: 'en_analisis' },
    { title: 'APROBADA', key: 'aprobada' }, { title: 'DESCARTADA', key: 'descartada' }
  ].map(function (c) { return { title: c.title, items: ideas.filter(function (i) { return i.column_status === c.key; }) }; });
  return '<div>' +
    '<h1 class="padmin-h1">Bandeja de ideas</h1><p class="padmin-lede">Flujo editorial de ideas propuestas.</p>' +
    '<div class="padmin-kanban">' + cols.map(function (col) {
      return '<div><p class="padmin-kanban-col-title">' + col.title + ' &middot; ' + col.items.length + '</p><div class="padmin-kanban-cards">' + col.items.map(function (i) { return ideaCard(i, canMove); }).join('') + '</div></div>';
    }).join('') + '</div>' +
  '</div>';
}

function ideasMine() {
  var ideas = state.data.ideas;
  if (!ideas) return loadingCard();
  var demoNote = state.demoNote === 'idea' ? '<p class="padmin-demo-hint">Idea enviada.</p>' : '';
  return '<div style="max-width:640px;">' +
    '<h1 class="padmin-h1">Tus ideas</h1>' +
    '<p class="padmin-lede">Envía una idea de nota y da seguimiento a su estado.</p>' +
    '<div class="padmin-card" style="padding:20px;margin-bottom:24px;">' +
      '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 14px;">Nueva idea</p>' +
      '<form data-action="submit-idea">' +
        '<div class="padmin-field"><label for="idea-title">Título</label><input id="idea-title" type="text" required></div>' +
        '<div class="padmin-field"><label for="idea-cat">Categoría</label><select id="idea-cat"><option>Local</option><option>Cultura</option><option>Economía</option><option>Entretenimiento</option><option>Deportes</option><option>Opinión</option></select></div>' +
        '<div class="padmin-field"><label for="idea-desc">Descripción</label><textarea id="idea-desc" style="min-height:70px;"></textarea></div>' +
        '<button type="submit" class="padmin-btn" style="align-self:flex-start;">Enviar idea</button>' +
        demoNote +
      '</form>' +
    '</div>' +
    '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Estado de tus ideas</p>' +
    '<div class="padmin-card">' + (ideas.length ? ideas.map(function (i) {
      return '<div class="padmin-row"><div><p class="padmin-row-title">' + esc(i.title) + '</p><p class="padmin-row-meta">' + esc(i.category || '') + '</p></div>' + badge(i.column_status) + '</div>';
    }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Todavía no envías ninguna idea.</p></div>') + '</div>' +
  '</div>';
}

export function renderIdeas() {
  return state.user.role === 'colaborador' ? ideasMine() : ideasKanban();
}
