// CREA Panel Admin — pantalla Configuración (tabs: usuarios, permisos, integraciones,
// newsletter, servicios, cuentas FB, métricas del sitio).
import { state } from './store.js';
import { esc, loadingCard, relativeTime, roleLabels, navItemsAll } from './util.js';

export function renderConfigUsuarios() {
  var users = state.data.users;
  if (!users) return loadingCard();
  var editing = state.editingUserId != null ? users.find(function (u) { return u.id === state.editingUserId; }) : null;
  var errorHtml = state.newUserError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.newUserError) + '</p>' : '';
  var formHtml = state.newUserOpen ? (
    '<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:760px;">' +
      errorHtml +
      '<form data-action="submit-new-user" class="padmin-grid2" style="gap:10px;">' +
        '<div class="padmin-field" style="margin:0;"><label>Nombre</label><input id="nu-name" type="text" required value="' + esc(editing ? editing.name : '') + '"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Correo</label><input id="nu-email" type="email" required value="' + esc(editing ? editing.email : '') + '"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>' + (editing ? 'Nueva contraseña (opcional)' : 'Contraseña') + '</label><input id="nu-password" type="password"' + (editing ? '' : ' required') + '></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Rol</label><select id="nu-role">' + Object.keys(roleLabels).map(function (r) { return '<option value="' + r + '"' + (editing && editing.role === r ? ' selected' : '') + '>' + esc(roleLabels[r]) + '</option>'; }).join('') + '</select></div>' +
        '<div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">' + (editing ? 'Guardar cambios' : 'Crear usuario') + '</button><button type="button" class="padmin-btn-outline" data-action="close-new-user">Cancelar</button></div>' +
      '</form>' +
    '</div>'
  ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-user">+ Nuevo usuario</button>';

  return formHtml + '<div class="padmin-card" style="max-width:760px;">' +
    '<div class="padmin-table-head padmin-cols-users"><span>NOMBRE</span><span>ROL</span><span>ESTADO</span><span></span></div>' +
    users.map(function (u) {
      var st = u.active ? { label: 'Activo', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Inactivo', bg: 'var(--bg-soft)', color: 'var(--mute-2)' };
      return '<div class="padmin-table-row padmin-cols-users">' +
        '<span style="font-size:13px;color:var(--text);">' + esc(u.name) + '</span>' +
        '<span style="font-size:12px;color:var(--text-mute);">' + esc(roleLabels[u.role] || u.role) + '</span>' +
        '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';width:fit-content;">' + st.label + '</span>' +
        '<span style="display:flex;gap:4px;flex-wrap:wrap;">' +
          '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="open-edit-user" data-id="' + u.id + '">Editar</button>' +
          '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-user-active" data-id="' + u.id + '" data-active="' + (!u.active) + '">' + (u.active ? 'Desactivar' : 'Activar') + '</button>' +
        '</span>' +
      '</div>';
    }).join('') + '</div>';
}

export function renderConfigPermisos() {
  var roles = state.data.roleModules;
  if (!roles) return loadingCard();
  var roleOrder = ['director', 'produccion', 'comercial', 'colaborador'];
  function mark(v) { return v ? '<span style="color:var(--brand);">✓</span>' : '<span style="color:var(--line);">—</span>'; }
  return '<div class="padmin-card" style="max-width:780px;overflow:auto;">' +
    '<div class="padmin-table-head padmin-cols-permisos"><span>MÓDULO</span><span>DIRECTOR</span><span>PRODUCCIÓN</span><span>COMERCIAL</span><span>COLABORADOR</span></div>' +
    navItemsAll.map(function (n) {
      return '<div class="padmin-table-row padmin-cols-permisos"><span style="font-size:13px;color:var(--text);">' + esc(n.label) + '</span>' +
        roleOrder.map(function (r) {
          return '<span style="font-weight:600;">' + mark((roles[r] || []).indexOf(n.id) !== -1) + '</span>';
        }).join('') + '</div>';
    }).join('') + '</div>';
}

export function renderConfigIntegraciones() {
  var integrations = state.data.integrations;
  if (!integrations) return loadingCard();
  return '<p class="padmin-lede" style="margin-bottom:14px;">Solo lectura — refleja las variables de entorno configuradas en el servidor.</p>' +
    '<div class="padmin-integraciones-grid">' + integrations.map(function (i) {
    var st = i.connected ? { label: 'Conectado', bg: 'var(--brand-soft)', color: 'var(--brand)', dot: 'var(--brand)' } : { label: 'Desconectado', bg: 'var(--bg-soft)', color: 'var(--mute-2)', dot: 'var(--line)' };
    return '<div class="padmin-integracion-card"><div style="display:flex;align-items:center;gap:10px;"><span class="padmin-dot" style="background:' + st.dot + ';"></span><div><p style="font-size:13px;font-weight:500;color:var(--text);margin:0 0 2px;">' + esc(i.name) + '</p><p style="font-size:11px;color:var(--text-mute);margin:0;">' + esc(i.desc) + '</p></div></div><span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + st.label + '</span></div>';
  }).join('') + '</div>';
}

export function renderConfigNewsletter() {
  var settings = state.data.newsletterSettings;
  if (!settings) return loadingCard();
  var hours = Array.from({ length: 24 }, function (_, i) { return i; });
  var minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  return '<div class="padmin-card" style="max-width:480px;padding:20px;">' +
    '<form data-action="submit-newsletter-settings">' +
      '<div class="padmin-field padmin-field-inline">' +
        '<input id="nls-enabled" type="checkbox"' + (settings.enabled ? ' checked' : '') + '>' +
        '<label for="nls-enabled">Envío automático diario activo</label>' +
      '</div>' +
      '<p style="font-size:12px;color:var(--text-mute);margin:0 0 14px;">A la hora configurada, el sistema genera el contenido (clima real + IA) y lo deja pendiente de aprobación en Pipeline → Buenos días, Perote. Nunca se envía solo.</p>' +
      '<div class="padmin-editor-grid2">' +
        '<div class="padmin-field" style="margin:0;"><label>Hora</label><select id="nls-hour">' + hours.map(function (h) { return '<option value="' + h + '"' + (h === settings.send_hour ? ' selected' : '') + '>' + String(h).padStart(2, '0') + '</option>'; }).join('') + '</select></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Minuto</label><select id="nls-minute">' + minutes.map(function (m) { return '<option value="' + m + '"' + (m === settings.send_minute ? ' selected' : '') + '>' + String(m).padStart(2, '0') + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<p style="font-size:11px;color:var(--mute-2);margin:10px 0 14px;">Zona horaria: America/Mexico_City.</p>' +
      (state.errorMsg ? '<p style="font-size:12px;color:var(--danger);margin:0 0 10px;">' + esc(state.errorMsg) + '</p>' : '') +
      '<button type="submit" class="padmin-btn padmin-btn-sm">Guardar</button>' +
    '</form>' +
  '</div>' +
  renderConfigAgenda();
}

export function renderConfigAgenda() {
  var events = state.data.newsletterEvents;
  return '<div class="padmin-card" style="max-width:480px;padding:20px;margin-top:16px;">' +
    '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 10px;">Agenda del newsletter</p>' +
    '<p style="font-size:12px;color:var(--text-mute);margin:0 0 14px;">Eventos reales del día (cortes de agua, eventos culturales, partidos, trámites). Sin esto, la sección "Agenda" del newsletter queda vacía — nunca se inventa.</p>' +
    '<form data-action="submit-newsletter-event" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">' +
      '<input id="ne-date" type="date" required style="flex:0 0 150px;">' +
      '<input id="ne-title" type="text" placeholder="Ej. Corte de agua en colonia Centro, 9am-2pm" required style="flex:1;min-width:200px;">' +
      '<button type="submit" class="padmin-btn-sm">Agregar</button>' +
    '</form>' +
    (events == null ? loadingCard() : (events.length ? events.map(function (ev) {
      return '<div class="padmin-row" style="padding:8px 0;"><div><p class="padmin-row-title" style="font-size:13px;">' + esc(ev.title) + '</p><p class="padmin-row-meta">' + esc(ev.event_date) + '</p></div>' +
        '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-newsletter-event" data-id="' + ev.id + '">Eliminar</button></div>';
    }).join('') : '<p class="padmin-lede">Sin eventos próximos cargados.</p>')) +
  '</div>';
}

export function renderConfigServicios() {
  var services = state.data.services;
  if (!services) return loadingCard();
  var editing = state.editingServiceId != null ? services.find(function (s) { return s.id === state.editingServiceId; }) : null;
  var errorHtml = state.serviceFormError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.serviceFormError) + '</p>' : '';
  var formHtml = state.serviceFormOpen ? (
    '<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:640px;">' +
      errorHtml +
      '<form data-action="submit-service" class="padmin-grid2" style="gap:10px;">' +
        '<div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Nombre del paquete</label><input id="sv-name" type="text" required value="' + esc(editing ? editing.name : '') + '"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Precio (texto libre)</label><input id="sv-price" type="text" placeholder="$2,500–$5,000 MXN/mes" required value="' + esc(editing ? editing.price_label : '') + '"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Interés para el form de contacto</label><input id="sv-interest" type="text" placeholder="Otro" value="' + esc(editing ? editing.cta_interest : '') + '"></div>' +
        '<div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Descripción</label><textarea id="sv-desc" required style="min-height:70px;">' + esc(editing ? editing.description : '') + '</textarea></div>' +
        '<div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Qué incluye (una por línea)</label><textarea id="sv-features" style="min-height:70px;">' + esc(editing ? (editing.features || []).join('\n') : '') + '</textarea></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Orden</label><input id="sv-order" type="number" value="' + (editing ? editing.sort_order : services.length) + '"></div>' +
        '<div class="padmin-field padmin-field-inline" style="margin:0;padding-top:18px;"><input id="sv-active" type="checkbox"' + (editing ? (editing.active ? ' checked' : '') : ' checked') + '><label>Activo (visible en el sitio)</label></div>' +
        '<div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">' + (editing ? 'Guardar cambios' : 'Crear paquete') + '</button><button type="button" class="padmin-btn-outline" data-action="close-service-form">Cancelar</button></div>' +
      '</form>' +
    '</div>'
  ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-service">+ Nuevo servicio</button>';

  return formHtml + '<div class="padmin-card" style="max-width:780px;">' +
    '<div class="padmin-table-head padmin-cols-services"><span>NOMBRE</span><span>PRECIO</span><span>ESTADO</span><span></span></div>' +
    (services.length ? services.map(function (s) {
      var st = s.active ? { label: 'Activo', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Inactivo', bg: 'var(--bg-soft)', color: 'var(--mute-2)' };
      return '<div class="padmin-table-row padmin-cols-services">' +
        '<span style="font-size:13px;color:var(--text);">' + esc(s.name) + '</span>' +
        '<span style="font-size:12px;color:var(--text-mute);">' + esc(s.price_label) + '</span>' +
        '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';width:fit-content;">' + st.label + '</span>' +
        '<span style="display:flex;gap:6px;">' +
          '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="edit-service" data-id="' + s.id + '">Editar</button>' +
          '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-service" data-id="' + s.id + '">Borrar</button>' +
        '</span>' +
      '</div>';
    }).join('') : '<p class="padmin-lede" style="padding:16px;">Sin paquetes cargados. El catálogo público quedará vacío hasta que agregues uno.</p>') +
  '</div>';
}

export function renderConfigCuentasFb() {
  var accounts = state.data.fbAccounts;
  if (!accounts) return loadingCard();
  var editing = state.editingFbAccountId != null ? accounts.find(function (a) { return a.id === state.editingFbAccountId; }) : null;
  var errorHtml = state.fbAccountFormError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.fbAccountFormError) + '</p>' : '';
  var formHtml = state.fbAccountFormOpen ? (
    '<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:760px;">' +
      errorHtml +
      '<form data-action="submit-fb-account" class="padmin-grid2" style="gap:10px;">' +
        '<div class="padmin-field" style="margin:0;"><label>Nombre del medio</label><input id="fba-label" type="text" required value="' + esc(editing ? editing.label : '') + '"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Handle o URL de Facebook</label><input id="fba-handle" type="text" placeholder="NombreDeLaPagina o https://facebook.com/..." required value="' + esc(editing ? editing.handle_or_url : '') + '"></div>' +
        '<div class="padmin-field padmin-field-inline" style="margin:0;padding-top:18px;"><input id="fba-active" type="checkbox"' + (editing ? (editing.active ? ' checked' : '') : ' checked') + '><label>Activa (se usa al escanear Facebook)</label></div>' +
        '<div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">' + (editing ? 'Guardar cambios' : 'Agregar cuenta') + '</button><button type="button" class="padmin-btn-outline" data-action="close-fb-account-form">Cancelar</button></div>' +
      '</form>' +
    '</div>'
  ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-fb-account">+ Nueva cuenta</button>';

  return '<p class="padmin-lede">Cuentas de Facebook que usa "Escanear Facebook" en RADAR → Competencia cuando no se especifican otras. Solo las activas se scrapean.</p>' +
    formHtml + '<div class="padmin-card" style="max-width:760px;">' +
    '<div class="padmin-table-head padmin-cols-services"><span>MEDIO</span><span>CUENTA</span><span>ESTADO</span><span></span></div>' +
    (accounts.length ? accounts.map(function (a) {
      var st = a.active ? { label: 'Activa', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Inactiva', bg: 'var(--bg-soft)', color: 'var(--mute-2)' };
      return '<div class="padmin-table-row padmin-cols-services">' +
        '<span style="font-size:13px;color:var(--text);">' + esc(a.label) + '</span>' +
        '<span style="font-size:12px;color:var(--text-mute);">' + esc(a.handle_or_url) + '</span>' +
        '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';width:fit-content;">' + st.label + '</span>' +
        '<span style="display:flex;gap:6px;">' +
          '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="edit-fb-account" data-id="' + a.id + '">Editar</button>' +
          '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-fb-account" data-id="' + a.id + '">Borrar</button>' +
        '</span>' +
      '</div>';
    }).join('') : '<p class="padmin-lede" style="padding:16px;">Sin cuentas cargadas. "Escanear Facebook" fallará hasta que agregues al menos una.</p>') +
  '</div>';
}

export function renderConfigMetricas() {
  var m = state.data.siteMetrics;
  if (!m) return loadingCard();
  return '<div class="padmin-card" style="max-width:480px;padding:20px;">' +
    '<form data-action="submit-site-metrics" class="padmin-grid2" style="gap:10px;">' +
      '<div class="padmin-field" style="margin:0;"><label>Alcance mensual</label><input id="sm-reach" type="text" value="' + esc(m.monthly_reach_label) + '" placeholder="42K"></div>' +
      '<div class="padmin-field" style="margin:0;"><label>Municipios cubiertos</label><input id="sm-municipios" type="number" min="0" value="' + m.municipalities_count + '"></div>' +
      '<div class="padmin-field" style="margin:0;"><label>Oyentes Tercer Tiempo</label><input id="sm-listeners" type="text" value="' + esc(m.tercer_tiempo_listeners_label) + '" placeholder="+1K"></div>' +
      '<div></div>' +
      '<div class="padmin-field" style="margin:0;"><label>Edad 18-24 (%)</label><input id="sm-age-1" type="number" min="0" max="100" value="' + m.audience_age_18_24_pct + '"></div>' +
      '<div class="padmin-field" style="margin:0;"><label>Edad 25-44 (%)</label><input id="sm-age-2" type="number" min="0" max="100" value="' + m.audience_age_25_44_pct + '"></div>' +
      '<div class="padmin-field" style="margin:0;"><label>Edad 45+ (%)</label><input id="sm-age-3" type="number" min="0" max="100" value="' + m.audience_age_45_plus_pct + '"></div>' +
      '<div></div>' +
      (state.errorMsg ? '<p style="grid-column:1 / -1;font-size:12px;color:var(--danger);margin:0;">' + esc(state.errorMsg) + '</p>' : '') +
      '<div style="grid-column:1 / -1;"><button type="submit" class="padmin-btn padmin-btn-sm">Guardar</button></div>' +
    '</form>' +
    '<p style="font-size:11px;color:var(--mute-2);margin:12px 0 0;">Actualizado ' + esc(relativeTime(m.updated_at)) + ' &middot; se refleja de inmediato en Estudio (Inicio, Media kit, Tercer Tiempo).</p>' +
  '</div>';
}

export function renderConfiguracion() {
  var tab = state.configTab;
  var body = tab === 'permisos' ? renderConfigPermisos() : (tab === 'integraciones' ? renderConfigIntegraciones() : (tab === 'newsletter' ? renderConfigNewsletter() : (tab === 'servicios' ? renderConfigServicios() : (tab === 'metricas-sitio' ? renderConfigMetricas() : (tab === 'cuentas-fb' ? renderConfigCuentasFb() : renderConfigUsuarios())))));
  function tabBtn(id, label) {
    var active = tab === id;
    return '<button type="button" class="padmin-tab' + (active ? ' active' : '') + '" data-action="set-config-tab" data-tab="' + id + '">' + label + '</button>';
  }
  return '<div>' +
    '<h1 class="padmin-h1">Configuración</h1>' +
    '<p class="padmin-lede">Usuarios, permisos e integraciones del panel. Solo visible para Director.</p>' +
    '<div class="padmin-tabs">' + tabBtn('usuarios', 'Usuarios') + tabBtn('permisos', 'Permisos') + tabBtn('integraciones', 'Integraciones') + tabBtn('newsletter', 'Newsletter') + tabBtn('servicios', 'Servicios') + tabBtn('cuentas-fb', 'Cuentas FB') + tabBtn('metricas-sitio', 'Métricas del sitio') + '</div>' +
    body +
  '</div>';
}
