// CREA Panel Admin — pantalla Configuración (tabs: usuarios, permisos, integraciones,
// newsletter, servicios, cuentas FB, métricas del sitio).
import { state, type AdminUser, type Integration, type NewsletterEvent, type Service, type FbAccount, type TrustedDevice } from '../store';
import { esc, loadingCard, errorCard, relativeTime, roleLabels, navItemsAll, badge } from '../util';
import { isPwaInstalled, isIosDevice, pushSupported } from '../pwa';
import { icon } from '../icons';

function renderPwaInstallCard(): string {
  let body: string;
  if (isPwaInstalled()) {
    body = '<p class="padmin-lede" style="margin:0;">Ya está instalada en este dispositivo.</p>';
  } else if (state.pwaInstallAvailable) {
    body = '<button type="button" class="padmin-btn padmin-btn-sm" data-action="install-pwa">Instalar aplicación (Admin)</button>';
  } else if (isIosDevice()) {
    body = '<p class="padmin-lede" style="margin:0;">En Safari: botón Compartir → "Agregar a inicio".</p>';
  } else {
    body = '<p class="padmin-lede" style="margin:0;">Tu navegador aún no ofreció instalar. Busca el ícono de instalar en la barra de direcciones.</p>';
  }
  return `<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:560px;">
    <p style="font-size:13px;font-weight:600;color:var(--text);margin:0 0 8px;">Instalar como aplicación</p>
    <p class="padmin-lede" style="margin:0 0 10px;">Agrega el panel a la pantalla de inicio de tu teléfono o computadora — se abre como app aparte.</p>
    ${body}
  </div>`;
}

function renderPushCard(): string {
  // En iOS el push solo funciona con la PWA agregada a inicio (iOS 16.4+) — Safari
  // nunca manda push a una pestaña normal. Mismo requisito se pide en Android/desktop
  // por simplicidad, aunque ahí no hace falta técnicamente.
  if (!isPwaInstalled()) {
    return `<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:560px;">
      <p style="font-size:13px;font-weight:600;color:var(--text);margin:0 0 8px;">Notificaciones push</p>
      <p class="padmin-lede" style="margin:0;">Instala la app primero (arriba) para poder activar notificaciones.</p>
    </div>`;
  }
  if (!pushSupported()) {
    return `<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:560px;">
      <p style="font-size:13px;font-weight:600;color:var(--text);margin:0 0 8px;">Notificaciones push</p>
      <p class="padmin-lede" style="margin:0;">Este navegador no soporta notificaciones push.</p>
    </div>`;
  }
  const errorHtml = state.pushError ? `<p class="padmin-lede" style="color:var(--danger);margin:0 0 10px;">${esc(state.pushError)}</p>` : '';
  let body: string;
  if (state.pushEnabled == null) {
    body = '<p class="padmin-lede" style="margin:0;">Comprobando…</p>';
  } else if (state.pushEnabled) {
    body = `<button type="button" class="padmin-btn-outline padmin-btn-sm" data-action="disable-push" ${state.pushBusy ? 'disabled' : ''}>${state.pushBusy ? 'Desactivando…' : 'Desactivar notificaciones'}</button>`;
  } else {
    body = `<button type="button" class="padmin-btn padmin-btn-sm" data-action="enable-push" ${state.pushBusy ? 'disabled' : ''}>${state.pushBusy ? 'Activando…' : 'Activar notificaciones'}</button>`;
  }
  return `<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:560px;">
    <p style="font-size:13px;font-weight:600;color:var(--text);margin:0 0 8px;">Notificaciones push</p>
    <p class="padmin-lede" style="margin:0 0 10px;">Avisos en el teléfono para: nuevo lead, pieza en revisión, propuesta generada por IA.</p>
    ${errorHtml}${body}
  </div>`;
}

export function renderConfigUsuarios(): string {
  const users = state.data.users;
  if (!users) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const editingId = state.form?.kind === 'user' ? state.form.editingId : null;
  const editing = editingId != null ? users.find((u: AdminUser) => u.id === editingId) : null;
  const errorHtml = state.formError ? `<p class="padmin-lede" style="color:var(--danger);">${esc(state.formError)}</p>` : '';
  const formHtml = state.form?.kind === 'user' ? (
    `<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:760px;">
      ${errorHtml}
      <form data-action="submit-new-user" class="padmin-grid2" style="gap:10px;">
        <div class="padmin-field" style="margin:0;"><label>Nombre</label><input id="nu-name" type="text" required value="${esc(editing ? editing.name : '')}"></div>
        <div class="padmin-field" style="margin:0;"><label>Correo</label><input id="nu-email" type="email" required value="${esc(editing ? editing.email : '')}"></div>
        <div class="padmin-field" style="margin:0;"><label>${editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label><input id="nu-password" type="password"${editing ? '' : ' required'}></div>
        <div class="padmin-field" style="margin:0;"><label>Rol</label><select id="nu-role">${Object.keys(roleLabels).map((r) => `<option value="${r}"${editing && editing.role === r ? ' selected' : ''}>${esc(roleLabels[r])}</option>`).join('')}</select></div>
        <div class="padmin-field" style="margin:0;"><label>Código 2FA del director</label><input id="nu-2fa-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="64" required></div>
        <div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">${editing ? 'Guardar cambios' : 'Crear usuario'}</button><button type="button" class="padmin-btn-outline" data-action="close-new-user">Cancelar</button></div>
      </form>
    </div>`
  ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-user">+ Nuevo usuario</button>';

  return formHtml + `<div class="padmin-card" style="max-width:760px;">
    <div class="padmin-table-head padmin-cols-users"><span>NOMBRE</span><span>ROL</span><span>ESTADO</span><span></span></div>
    ${users.map((u: AdminUser) => {
      return `<div class="padmin-table-row padmin-cols-users">
        <span class="padmin-t-body">${esc(u.name)}</span>
        <span class="padmin-t-mute">${esc(roleLabels[u.role] || u.role)}</span>
        ${badge(u.active ? 'activo' : 'inactivo')}
        <span style="display:flex;gap:4px;flex-wrap:wrap;">
          <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="open-edit-user" data-id="${u.id}">Editar</button>
          <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-user-active" data-id="${u.id}" data-active="${!u.active}">${u.active ? 'Desactivar' : 'Activar'}</button>
        </span>
      </div>`;
    }).join('')}</div>`;
}

export function renderConfigPermisos(): string {
  const roles = state.data.roleModules;
  if (!roles) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const roleOrder = ['director', 'produccion', 'comercial', 'colaborador'];
  const mark = (v: boolean) => v ? `<span style="color:var(--brand);display:inline-flex;align-items:center;">${icon('check', { size: 14 })}</span>` : '<span style="color:var(--line);">—</span>';
  return `<div class="padmin-card" style="max-width:780px;overflow:auto;">
    <div class="padmin-table-head padmin-cols-permisos"><span>MÓDULO</span><span>DIRECTOR</span><span>PRODUCCIÓN</span><span>COMERCIAL</span><span>COLABORADOR</span></div>
    ${navItemsAll.map((n) =>
      `<div class="padmin-table-row padmin-cols-permisos"><span class="padmin-t-body">${esc(n.label)}</span>${roleOrder.map((r) =>
        `<span style="font-weight:600;">${mark((roles[r] || []).indexOf(n.id) !== -1)}</span>`
      ).join('')}</div>`
    ).join('')}</div>`;
}

export function renderConfigIntegraciones(): string {
  const integrations = state.data.integrations;
  if (!integrations) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  return renderPwaInstallCard() + renderPushCard() +
    '<p class="padmin-lede" style="margin-bottom:14px;">Solo lectura — refleja las variables de entorno configuradas en el servidor.</p>' +
    `<div class="padmin-integraciones-grid">${integrations.map((i: Integration) => {
      const dot = i.connected ? 'var(--brand)' : 'var(--line)';
      return `<div class="padmin-integracion-card"><div style="display:flex;align-items:center;gap:10px;"><span class="padmin-dot" style="background:${dot};"></span><div><p style="font-size:13px;font-weight:500;color:var(--text);margin:0 0 2px;">${esc(i.name)}</p><p style="font-size:11px;color:var(--text-mute);margin:0;">${esc(i.desc)}</p></div></div>${badge(i.connected ? 'activo' : 'inactivo', i.connected ? 'Conectado' : 'Desconectado')}</div>`;
    }).join('')}</div>`;
}

export function renderConfigNewsletter(): string {
  const settings = state.data.newsletterSettings;
  if (!settings) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  return `<div class="padmin-card" style="max-width:480px;padding:20px;">
    <form data-action="submit-newsletter-settings">
      <div class="padmin-field padmin-field-inline">
        <input id="nls-enabled" type="checkbox"${settings.enabled ? ' checked' : ''}>
        <label for="nls-enabled">Envío automático diario activo</label>
      </div>
      <p class="padmin-t-hint">A la hora configurada, el sistema genera el contenido (clima real + IA) y lo deja pendiente de aprobación en Pipeline → Buenos días, Perote. Nunca se envía solo.</p>
      <div class="padmin-editor-grid2">
        <div class="padmin-field" style="margin:0;"><label>Hora</label><select id="nls-hour">${hours.map((h) => `<option value="${h}"${h === settings.send_hour ? ' selected' : ''}>${String(h).padStart(2, '0')}</option>`).join('')}</select></div>
        <div class="padmin-field" style="margin:0;"><label>Minuto</label><select id="nls-minute">${minutes.map((m) => `<option value="${m}"${m === settings.send_minute ? ' selected' : ''}>${String(m).padStart(2, '0')}</option>`).join('')}</select></div>
      </div>
      <p style="font-size:11px;color:var(--mute-2);margin:10px 0 14px;">Zona horaria: America/Mexico_City.</p>
      ${state.errorMsg ? `<p style="font-size:12px;color:var(--danger);margin:0 0 10px;">${esc(state.errorMsg)}</p>` : ''}
      <button type="submit" class="padmin-btn padmin-btn-sm">Guardar</button>
    </form>
  </div>${renderConfigAgenda()}`;
}

export function renderConfigAgenda(): string {
  const events = state.data.newsletterEvents;
  return `<div class="padmin-card" style="max-width:480px;padding:20px;margin-top:16px;">
    <p class="padmin-section-title" style="margin-bottom:10px;">Agenda del newsletter</p>
    <p class="padmin-t-hint">Eventos reales del día (cortes de agua, eventos culturales, partidos, trámites). Sin esto, la sección "Agenda" del newsletter queda vacía — nunca se inventa.</p>
    <form data-action="submit-newsletter-event" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <input id="ne-date" type="date" required style="flex:0 0 150px;">
      <input id="ne-title" type="text" placeholder="Ej. Corte de agua en colonia Centro, 9am-2pm" required style="flex:1;min-width:200px;">
      <button type="submit" class="padmin-btn-sm">Agregar</button>
    </form>
    ${events == null ? loadingCard() : (events.length ? events.map((ev: NewsletterEvent) =>
      `<div class="padmin-row" style="padding:8px 0;"><div><p class="padmin-row-title" style="font-size:13px;">${esc(ev.title)}</p><p class="padmin-row-meta">${esc(ev.event_date)}</p></div>
        <button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-newsletter-event" data-id="${ev.id}">Eliminar</button></div>`
    ).join('') : '<p class="padmin-lede">Sin eventos próximos cargados.</p>')}
  </div>`;
}

export function renderConfigServicios(): string {
  const services = state.data.services;
  if (!services) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const editingId = state.form?.kind === 'service' ? state.form.editingId : null;
  const editing = editingId != null ? services.find((s: Service) => s.id === editingId) : null;
  const errorHtml = state.formError ? `<p class="padmin-lede" style="color:var(--danger);">${esc(state.formError)}</p>` : '';
  const formHtml = state.form?.kind === 'service' ? (
    `<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:640px;">
      ${errorHtml}
      <form data-action="submit-service" class="padmin-grid2" style="gap:10px;">
        <div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Nombre del paquete</label><input id="sv-name" type="text" required value="${esc(editing ? editing.name : '')}"></div>
        <div class="padmin-field" style="margin:0;"><label>Precio (texto libre)</label><input id="sv-price" type="text" placeholder="$2,500–$5,000 MXN/mes" required value="${esc(editing ? editing.price_label : '')}"></div>
        <div class="padmin-field" style="margin:0;"><label>Interés para el form de contacto</label><input id="sv-interest" type="text" placeholder="Otro" value="${esc(editing ? editing.cta_interest : '')}"></div>
        <div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Descripción</label><textarea id="sv-desc" required style="min-height:70px;">${esc(editing ? editing.description : '')}</textarea></div>
        <div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Qué incluye (una por línea)</label><textarea id="sv-features" style="min-height:70px;">${esc(editing ? (editing.features || []).join('\n') : '')}</textarea></div>
        <div class="padmin-field" style="margin:0;"><label>Orden</label><input id="sv-order" type="number" value="${editing ? editing.sort_order : services.length}"></div>
        <div class="padmin-field padmin-field-inline" style="margin:0;padding-top:18px;"><input id="sv-active" type="checkbox"${editing ? (editing.active ? ' checked' : '') : ' checked'}><label>Activo (visible en el sitio)</label></div>
        <div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">${editing ? 'Guardar cambios' : 'Crear paquete'}</button><button type="button" class="padmin-btn-outline" data-action="close-service-form">Cancelar</button></div>
      </form>
    </div>`
  ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-service">+ Nuevo servicio</button>';

  return formHtml + `<div class="padmin-card" style="max-width:780px;">
    <div class="padmin-table-head padmin-cols-services"><span>NOMBRE</span><span>PRECIO</span><span>ESTADO</span><span></span></div>
    ${services.length ? services.map((s: Service) => {
      return `<div class="padmin-table-row padmin-cols-services">
        <span class="padmin-t-body">${esc(s.name)}</span>
        <span class="padmin-t-mute">${esc(s.price_label)}</span>
        ${badge(s.active ? 'activo' : 'inactivo')}
        <span style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="edit-service" data-id="${s.id}">Editar</button>
          <button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-service" data-id="${s.id}">Borrar</button>
        </span>
      </div>`;
    }).join('') : '<p class="padmin-lede" style="padding:16px;">Sin paquetes cargados. El catálogo público quedará vacío hasta que agregues uno.</p>'}
  </div>`;
}

export function renderConfigCuentasFb(): string {
  const accounts = state.data.fbAccounts;
  if (!accounts) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const editingId = state.form?.kind === 'fbAccount' ? state.form.editingId : null;
  const editing = editingId != null ? accounts.find((a: FbAccount) => a.id === editingId) : null;
  const errorHtml = state.formError ? `<p class="padmin-lede" style="color:var(--danger);">${esc(state.formError)}</p>` : '';
  const formHtml = state.form?.kind === 'fbAccount' ? (
    `<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:760px;">
      ${errorHtml}
      <form data-action="submit-fb-account" class="padmin-grid2" style="gap:10px;">
        <div class="padmin-field" style="margin:0;"><label>Nombre del medio</label><input id="fba-label" type="text" required value="${esc(editing ? editing.label : '')}"></div>
        <div class="padmin-field" style="margin:0;"><label>Handle o URL de Facebook</label><input id="fba-handle" type="text" placeholder="NombreDeLaPagina o https://facebook.com/..." required value="${esc(editing ? editing.handle_or_url : '')}"></div>
        <div class="padmin-field padmin-field-inline" style="margin:0;padding-top:18px;"><input id="fba-active" type="checkbox"${editing ? (editing.active ? ' checked' : '') : ' checked'}><label>Activa (se usa al escanear Facebook)</label></div>
        <div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">${editing ? 'Guardar cambios' : 'Agregar cuenta'}</button><button type="button" class="padmin-btn-outline" data-action="close-fb-account-form">Cancelar</button></div>
      </form>
    </div>`
  ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-fb-account">+ Nueva cuenta</button>';

  return '<p class="padmin-lede">Cuentas de Facebook que usa "Escanear Facebook" en RADAR → Competencia cuando no se especifican otras. Solo las activas se scrapean.</p>' +
    formHtml + `<div class="padmin-card" style="max-width:760px;">
    <div class="padmin-table-head padmin-cols-services"><span>MEDIO</span><span>CUENTA</span><span>ESTADO</span><span></span></div>
    ${accounts.length ? accounts.map((a: FbAccount) => {
      return `<div class="padmin-table-row padmin-cols-services">
        <span class="padmin-t-body">${esc(a.label)}</span>
        <span class="padmin-t-mute">${esc(a.handle_or_url)}</span>
        ${badge(a.active ? 'activo' : 'inactivo', a.active ? 'Activa' : 'Inactiva')}
        <span style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="edit-fb-account" data-id="${a.id}">Editar</button>
          <button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-fb-account" data-id="${a.id}">Borrar</button>
        </span>
      </div>`;
    }).join('') : '<p class="padmin-lede" style="padding:16px;">Sin cuentas cargadas. "Escanear Facebook" fallará hasta que agregues al menos una.</p>'}
  </div>`;
}

export function renderConfigMetricas(): string {
  const m = state.data.siteMetrics;
  if (!m) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  return `<div class="padmin-card" style="max-width:480px;padding:20px;">
    <form data-action="submit-site-metrics" class="padmin-grid2" style="gap:10px;">
      <div class="padmin-field" style="margin:0;"><label>Alcance mensual</label><input id="sm-reach" type="text" value="${esc(m.monthly_reach_label)}" placeholder="42K"></div>
      <div class="padmin-field" style="margin:0;"><label>Municipios cubiertos</label><input id="sm-municipios" type="number" min="0" value="${m.municipalities_count}"></div>
      <div class="padmin-field" style="margin:0;"><label>Oyentes Tercer Tiempo</label><input id="sm-listeners" type="text" value="${esc(m.tercer_tiempo_listeners_label)}" placeholder="+1K"></div>
      <div></div>
      <div class="padmin-field" style="margin:0;"><label>Edad 18-24 (%)</label><input id="sm-age-1" type="number" min="0" max="100" value="${m.audience_age_18_24_pct}"></div>
      <div class="padmin-field" style="margin:0;"><label>Edad 25-44 (%)</label><input id="sm-age-2" type="number" min="0" max="100" value="${m.audience_age_25_44_pct}"></div>
      <div class="padmin-field" style="margin:0;"><label>Edad 45+ (%)</label><input id="sm-age-3" type="number" min="0" max="100" value="${m.audience_age_45_plus_pct}"></div>
      <div></div>
      ${state.errorMsg ? `<p style="grid-column:1 / -1;font-size:12px;color:var(--danger);margin:0;">${esc(state.errorMsg)}</p>` : ''}
      <div style="grid-column:1 / -1;"><button type="submit" class="padmin-btn padmin-btn-sm">Guardar</button></div>
    </form>
    <p style="font-size:11px;color:var(--mute-2);margin:12px 0 0;">Actualizado ${esc(relativeTime(m.updated_at))} &middot; se refleja de inmediato en Estudio (Inicio, Media kit, Tercer Tiempo).</p>
  </div>`;
}

function renderTwoFactorCard(enabled: boolean): string {
  const errorHtml = state.errorMsg ? `<p style="font-size:12px;color:var(--danger);margin:0 0 10px;">${esc(state.errorMsg)}</p>` : '';
  if (state.twoFaBackupCodes) {
    return `<div class="padmin-card" style="max-width:480px;padding:20px;margin-bottom:16px;">
      <p class="padmin-section-title" style="margin-bottom:6px;">Guarda tus códigos de respaldo</p>
      <p class="padmin-t-hint">Cada uno sirve una sola vez si pierdes acceso a tu app de autenticación. No se vuelven a mostrar.</p>
      <div id="tfa-backup-codes" style="font-family:monospace;font-size:14px;background:var(--bg-soft);border-radius:6px;padding:12px;margin-bottom:14px;line-height:1.8;">${state.twoFaBackupCodes.map((c) => esc(c)).join('<br>')}</div>
      <button type="button" class="padmin-btn padmin-btn-sm" data-action="dismiss-2fa-backup-codes">Ya los guardé</button>
    </div>`;
  }
  if (state.twoFaSetup) {
    return `<div class="padmin-card" style="max-width:480px;padding:20px;margin-bottom:16px;">
      <p class="padmin-section-title" style="margin-bottom:6px;">Activar verificación en dos pasos</p>
      <p class="padmin-t-hint">Escanea el código con Google Authenticator, Authy o similar, luego confirma con el código de 6 dígitos que te muestre la app.</p>
      <img src="${esc(state.twoFaSetup.qr_data_url)}" alt="Código QR" width="180" height="180" style="display:block;margin-bottom:10px;">
      <p style="font-size:11px;color:var(--mute-2);margin:0 0 14px;word-break:break-all;">O ingresa manualmente: <code>${esc(state.twoFaSetup.secret)}</code></p>
      ${errorHtml}
      <form data-action="submit-2fa-enable" class="padmin-grid2" style="gap:10px;">
        <div class="padmin-field" style="margin:0;"><label>Código de 6 dígitos</label><input id="tfa-enable-code" type="text" inputmode="numeric" maxlength="64" required autofocus></div>
        <div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm" ${state.twoFaBusy ? 'disabled' : ''}>Confirmar</button><button type="button" class="padmin-btn-outline" data-action="cancel-2fa-setup">Cancelar</button></div>
      </form>
    </div>`;
  }
  const body = enabled
    ? `<p class="padmin-t-hint">Activada — se pide un código además de tu contraseña al iniciar sesión.</p>
       ${state.user!.role === 'director' ? '<p class="padmin-t-hint">Es obligatoria para cuentas Director y no puede desactivarse.</p>' : `
       ${errorHtml}
       <form data-action="submit-2fa-disable" class="padmin-grid2" style="gap:10px;">
         <div class="padmin-field" style="margin:0;"><label>Código actual (o uno de respaldo), para desactivar</label><input id="tfa-disable-code" type="text" inputmode="numeric" maxlength="64" required></div>
         <div style="grid-column:1 / -1;"><button type="submit" class="padmin-btn-outline padmin-btn-sm" ${state.twoFaBusy ? 'disabled' : ''}>Desactivar 2FA</button></div>
       </form>`}`
    : `<p class="padmin-t-hint">No activada — agrega una capa extra de seguridad a tu cuenta.</p>
       ${errorHtml}
       <button type="button" class="padmin-btn padmin-btn-sm" data-action="start-2fa-setup" ${state.twoFaBusy ? 'disabled' : ''}>${state.twoFaBusy ? 'Generando…' : 'Activar 2FA'}</button>`;
  return `<div class="padmin-card" style="max-width:480px;padding:20px;margin-bottom:16px;">
    <p class="padmin-section-title" style="margin-bottom:6px;">Verificación en dos pasos</p>
    ${body}
  </div>`;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function renderTrustedDevicesCard(): string {
  const devices = state.data.trustedDevices;
  if (devices == null) return '';
  const empty = `<p class="padmin-t-hint">Ningún dispositivo recordado todavía. Al verificar el código 2FA puedes marcar "Confiar en este dispositivo" para no repetirlo por 30 días.</p>`;
  return `<div class="padmin-card" style="max-width:480px;padding:20px;margin-bottom:16px;">
    <p class="padmin-section-title" style="margin-bottom:6px;">Dispositivos confiables</p>
    <p class="padmin-t-hint" style="margin-bottom:10px;">No piden el código 2FA por 30 días desde el último uso. Revoca cualquiera que no reconozcas.</p>
    ${devices.length ? devices.map((d: TrustedDevice) => `<div class="padmin-row" style="padding:8px 0;">
      <div><p class="padmin-row-title" style="font-size:13px;">${esc(d.label)}${d.current ? ' <span style="color:var(--brand);font-weight:600;">(este dispositivo)</span>' : ''}</p>
      <p class="padmin-row-meta">Último uso ${esc(relativeTime(d.last_used_at))} &middot; vence en ${daysUntil(d.expires_at)}d</p></div>
      <button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="revoke-trusted-device" data-id="${d.id}">Revocar</button>
    </div>`).join('') : empty}
    ${devices.length > 1 ? '<button type="button" class="padmin-btn-outline padmin-btn-sm" style="margin-top:10px;" data-action="revoke-all-trusted-devices">Revocar todos</button>' : ''}
  </div>`;
}

export function renderConfigPerfil(): string {
  const me = state.data.myProfile;
  const isDirector = state.user!.role === 'director';
  const settings = state.data.editorialSettings;
  if (!me || (isDirector && !state.requiresTwoFaSetup && !settings)) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const directivaCard = !isDirector || state.requiresTwoFaSetup ? '' : `<div class="padmin-card" style="max-width:480px;padding:20px;">
    <p class="padmin-section-title" style="margin-bottom:6px;">Directriz editorial</p>
    <p class="padmin-t-hint">Instrucción general que la IA aplica antes de redactar cualquier propuesta o borrador — precarga el campo por-nota en RADAR y el Editor cuando esa nota no trae una directriz propia. Vacío = voz estándar de CREA.</p>
    <form data-action="submit-editorial-settings">
      <div class="padmin-field" style="margin:0 0 12px;">
        <textarea id="es-directive" style="min-height:110px;" placeholder="Ej: priorizar impacto económico sobre político. Incluir siempre versión ciudadana, no solo oficial.">${esc(settings!.default_directive || '')}</textarea>
      </div>
      <button type="submit" class="padmin-btn padmin-btn-sm">Guardar</button>
    </form>
    <p style="font-size:11px;color:var(--mute-2);margin:12px 0 0;">Actualizado ${esc(relativeTime(settings!.updated_at))}.</p>
  </div>`;
  return `<div class="padmin-card" style="max-width:480px;padding:20px;margin-bottom:16px;">
    ${state.requiresTwoFaSetup ? '<p class="padmin-lede" style="color:var(--danger);">Activa la verificación en dos pasos para desbloquear el panel Director.</p>' : ''}
    <p class="padmin-section-title" style="margin-bottom:10px;">Mi cuenta</p>
    <form data-action="submit-my-profile" class="padmin-grid2" style="gap:10px;">
      <div class="padmin-field" style="margin:0;"><label>Nombre</label><input id="me-name" type="text" required value="${esc(me.name)}"></div>
      <div class="padmin-field" style="margin:0;"><label>Correo</label><input id="me-email" type="email" required value="${esc(me.email)}"></div>
      <div class="padmin-field" style="margin:0;"><label>Rol</label><input type="text" value="${esc(roleLabels[me.role] || me.role)}" disabled></div>
      <div class="padmin-field" style="margin:0;"><label>Nueva contraseña (opcional)</label><input id="me-password" type="password" placeholder="Dejar vacío para no cambiar"></div>
      <div class="padmin-field" style="margin:0;"><label>Confirmar nueva contraseña</label><input id="me-password-confirm" type="password" placeholder="Repite la nueva contraseña"></div>
      <div class="padmin-field" style="margin:0;"><label>Contraseña actual (si cambias correo o contraseña)</label><input id="me-current-password" type="password" autocomplete="current-password"></div>
      ${me.two_factor_enabled ? '<div class="padmin-field" style="margin:0;"><label>Código 2FA para cambios sensibles</label><input id="me-2fa-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="64"></div>' : ''}
      ${state.errorMsg ? `<p style="grid-column:1 / -1;font-size:12px;color:var(--danger);margin:0;">${esc(state.errorMsg)}</p>` : ''}
      <div style="grid-column:1 / -1;"><button type="submit" class="padmin-btn padmin-btn-sm">Guardar cambios</button></div>
    </form>
  </div>
  ${renderTwoFactorCard(me.two_factor_enabled)}
  ${me.two_factor_enabled ? renderTrustedDevicesCard() : ''}
  ${directivaCard}`;
}

export function renderConfiguracion(): string {
  const isDirector = state.user!.role === 'director';
  // Roles no-director solo tienen Integraciones y Perfil — el resto de tabs (usuarios,
  // permisos, newsletter, servicios, cuentas-fb, métricas) son exclusivos de Director,
  // así que un configTab heredado se recorta a uno de los dos disponibles.
  const tab = state.requiresTwoFaSetup ? 'perfil' : (isDirector ? state.configTab : (state.configTab === 'perfil' ? 'perfil' : 'integraciones'));
  const body = tab === 'permisos' ? renderConfigPermisos() : (tab === 'integraciones' ? renderConfigIntegraciones() : (tab === 'newsletter' ? renderConfigNewsletter() : (tab === 'servicios' ? renderConfigServicios() : (tab === 'metricas-sitio' ? renderConfigMetricas() : (tab === 'cuentas-fb' ? renderConfigCuentasFb() : (tab === 'perfil' ? renderConfigPerfil() : renderConfigUsuarios()))))));
  // aria-current y no role="tab": role="tab" obliga a tabpanel + aria-controls +
  // navegación con flechas, y a medias es peor que nada. Estos son botones que
  // cambian la vista, y aria-current marca cuál está activo sin prometer más.
  const tabBtn = (id: string, label: string) => {
    const active = tab === id;
    return `<button type="button" class="padmin-tab${active ? ' active' : ''}"${active ? ' aria-current="true"' : ''} data-action="set-config-tab" data-tab="${id}">${label}</button>`;
  };
  const tabs = state.requiresTwoFaSetup ? tabBtn('perfil', 'Activar 2FA') : isDirector
    ? `${tabBtn('usuarios', 'Usuarios')}${tabBtn('permisos', 'Permisos')}${tabBtn('integraciones', 'Integraciones')}${tabBtn('newsletter', 'Newsletter')}${tabBtn('servicios', 'Servicios')}${tabBtn('cuentas-fb', 'Cuentas FB')}${tabBtn('metricas-sitio', 'Métricas del sitio')}${tabBtn('perfil', 'Perfil')}`
    : `${tabBtn('integraciones', 'Integraciones')}${tabBtn('perfil', 'Perfil')}`;
  return `<div>
    <h1 class="padmin-h1">Configuración</h1>
    <p class="padmin-lede">${isDirector ? 'Usuarios, permisos e integraciones del panel. Solo visible para Director.' : 'Instalación de la app, notificaciones y tu cuenta.'}</p>
    <div class="padmin-tabs" role="group" aria-label="Secciones de configuración">${tabs}</div>
    ${body}
  </div>`;
}
