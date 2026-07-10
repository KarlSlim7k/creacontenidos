// CREA Panel Admin — pantallas Comercial (pipeline de clientes) y Leads.
import { state } from './store.js';
import { esc, badge, loadingCard, STATUS_LABEL } from './util.js';

var PIPELINE_STAGES_ORDER = ['identificado', 'contactado', 'propuesta_enviada', 'cerrado'];

function sponsorFieldsHtml(c) {
  return '<div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--line-soft);">' +
    '<p style="font-size:10px;color:var(--mute-2);margin:0 0 6px;">Datos de patrocinio (newsletter)</p>' +
    '<input type="text" id="sponsor-link-' + c.id + '" placeholder="Sitio web" value="' + esc(c.website_url || '') + '" style="width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--line-soft);border-radius:5px;box-sizing:border-box;margin-bottom:6px;">' +
    '<input type="text" id="sponsor-copy-' + c.id + '" placeholder="Copy (ej. Todo lo que necesitas para tu hogar)" value="' + esc(c.sponsor_copy || '') + '" style="width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--line-soft);border-radius:5px;box-sizing:border-box;margin-bottom:6px;">' +
    '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="save-sponsor-info" data-id="' + c.id + '">Guardar patrocinio</button>' +
    (c.last_sponsored_at ? '<p style="font-size:10px;color:var(--mute-2);margin:6px 0 0;">Último newsletter: ' + new Date(c.last_sponsored_at).toLocaleDateString('es-MX') + '</p>' : '') +
  '</div>';
}

function commColumn(title, stage, color, clients, canMove, canDelete) {
  var items = clients.filter(function (c) { return c.pipeline_stage === stage; });
  var nextStage = PIPELINE_STAGES_ORDER[PIPELINE_STAGES_ORDER.indexOf(stage) + 1];
  return '<div><p class="padmin-kanban-col-title">' + title + ' &middot; ' + items.length + '</p><div class="padmin-kanban-cards">' + items.map(function (c) {
    return '<div class="padmin-idea-card"><p class="padmin-row-title" style="margin-bottom:6px;">' + esc(c.name) + '</p><p class="padmin-row-meta" style="margin-bottom:8px;">' + esc(c.interest || '') + '</p><p style="font-size:12px;font-weight:600;color:' + color + ';margin:0 0 8px;">' + esc(c.estimated_value || '') + '</p><p style="font-size:10px;color:var(--mute-2);margin:0;">Últ. seguimiento: ' + (c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString('es-MX') : '—') + '</p>' +
      (canMove && nextStage ? '<button type="button" class="padmin-btn-sm padmin-btn-outline" style="margin-top:8px;" data-action="advance-client" data-id="' + c.id + '" data-stage="' + nextStage + '">Avanzar &rarr;</button>' : '') +
      (canDelete ? '<button type="button" class="padmin-btn-sm padmin-btn-danger" style="margin-top:8px;margin-left:6px;" data-action="delete-client" data-id="' + c.id + '">Eliminar</button>' : '') +
      (stage === 'cerrado' ? sponsorFieldsHtml(c) : '') +
    '</div>';
  }).join('') + '</div></div>';
}

export function renderComercial() {
  var clients = state.data.clients;
  if (!clients) return loadingCard();
  var canMove = state.user.role === 'comercial' || state.user.role === 'director';
  var canDelete = state.user.role === 'director';
  var errorHtml = state.clientFormError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.clientFormError) + '</p>' : '';
  var formHtml = state.clientFormOpen ? (
    '<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:640px;">' +
      errorHtml +
      '<form data-action="submit-new-client" class="padmin-grid2" style="gap:10px;">' +
        '<div class="padmin-field" style="margin:0;"><label>Nombre</label><input id="nc-name" type="text" required></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Negocio</label><input id="nc-business" type="text"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Paquete</label><select id="nc-package"><option value="básico">Básico</option><option value="profesional">Profesional</option><option value="premium">Premium</option></select></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Teléfono</label><input id="nc-phone" type="tel"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Correo</label><input id="nc-email" type="email"></div>' +
        '<div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">Crear cliente</button><button type="button" class="padmin-btn-outline" data-action="close-client-form">Cancelar</button></div>' +
      '</form>' +
    '</div>'
  ) : (canMove ? '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-client-form">+ Nuevo cliente</button>' : '');
  return '<div>' +
    '<h1 class="padmin-h1">Pipeline comercial</h1><p class="padmin-lede">Prospectos activos del equipo comercial.</p>' +
    formHtml +
    '<div class="padmin-kanban">' +
      commColumn('IDENTIFICADO', 'identificado', 'var(--accent)', clients, canMove, canDelete) +
      commColumn('CONTACTADO', 'contactado', 'var(--accent)', clients, canMove, canDelete) +
      commColumn('PROPUESTA ENVIADA', 'propuesta_enviada', 'var(--accent)', clients, canMove, canDelete) +
      commColumn('CERRADO', 'cerrado', 'var(--brand)', clients, canMove, canDelete) +
    '</div>' +
  '</div>';
}

export function renderLeads() {
  var leads = state.data.leads;
  if (!leads) return loadingCard();
  var canDelete = state.user.role === 'director';
  var statuses = ['todos', 'nuevo', 'contactado', 'descartado'];
  var chips = statuses.map(function (st) {
    var active = state.leadsStatus === st;
    return '<span class="padmin-chip" data-action="set-leads-status" data-value="' + st + '" style="background:' + (active ? 'var(--brand)' : 'var(--surface)') + ';color:' + (active ? '#fff' : 'var(--text)') + ';border-color:' + (active ? 'var(--brand)' : 'var(--line-soft)') + ';">' + (st === 'todos' ? 'Todos' : STATUS_LABEL[st]) + '</span>';
  }).join('');
  var filtered = leads.filter(function (l) { return state.leadsStatus === 'todos' || l.status === state.leadsStatus; });
  var nuevos = leads.filter(function (l) { return l.status === 'nuevo'; }).length;

  return '<div>' +
    '<h1 class="padmin-h1">Leads</h1>' +
    '<p class="padmin-lede">Mensajes del formulario de contacto del sitio. ' + (nuevos ? nuevos + ' sin atender.' : 'Sin pendientes.') + '</p>' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap;">' + chips + '</div>' +
    '<div class="padmin-card">' +
      '<div class="padmin-table-head padmin-cols-leads"><span>RECIBIDO</span><span>CONTACTO</span><span>INTERÉS</span><span>MENSAJE</span><span>ESTADO</span><span>ACCIONES</span></div>' +
      (filtered.length ? filtered.map(function (l) {
        return '<div class="padmin-table-row padmin-cols-leads">' +
          '<span style="font-size:11px;color:var(--text-mute);">' + esc(relativeTime(l.created_at)) + '</span>' +
          '<div style="min-width:0;"><p class="padmin-row-title">' + esc(l.name) + (l.company ? ' · ' + esc(l.company) : '') + '</p><p class="padmin-row-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(l.email || '') + '</p></div>' +
          '<span style="font-size:12px;color:var(--text-mute);">' + esc(l.service_interest || '—') + '</span>' +
          '<span style="font-size:12px;color:var(--text-2);line-height:1.4;" title="' + esc(l.message || '') + '">' + esc((l.message || '—').slice(0, 140)) + ((l.message || '').length > 140 ? '…' : '') + '</span>' +
          '<span>' + badge(l.status) + '</span>' +
          '<span style="display:flex;gap:4px;flex-wrap:wrap;">' +
            (l.status === 'nuevo' ? '<button type="button" class="padmin-icon-btn" title="Marcar contactado" data-action="mark-lead" data-id="' + l.id + '" data-status="contactado">✓</button>' : '') +
            (l.status !== 'descartado' ? '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="convert-lead" data-id="' + l.id + '">→ Cliente</button>' : '') +
            (l.status !== 'descartado' ? '<button type="button" class="padmin-icon-btn" title="Descartar" data-action="mark-lead" data-id="' + l.id + '" data-status="descartado">✕</button>' : '') +
            (canDelete ? '<button type="button" class="padmin-icon-btn" title="Eliminar" data-action="delete-lead" data-id="' + l.id + '">🗑</button>' : '') +
          '</span>' +
        '</div>';
      }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">' + (leads.length ? 'Sin leads con ese estado.' : 'Todavía no llegan mensajes del formulario de contacto.') + '</p></div>') +
    '</div>' +
  '</div>';
}
