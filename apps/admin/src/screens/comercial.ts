// CREA Panel Admin — pantallas Comercial (pipeline de clientes) y Leads.
import { state, type Client, type Lead } from '../store';
import { esc, badge, loadingCard, errorCard, STATUS_LABEL, relativeTime, paginateRows, renderPager, safeHttpUrl } from '../util';

const PIPELINE_STAGES_ORDER = ['identificado', 'contactado', 'propuesta_enviada', 'cerrado'];
const STAGE_NAMES: Record<string, string> = {
  identificado: 'Identificado',
  contactado: 'Contactado',
  propuesta_enviada: 'Propuesta enviada',
  cerrado: 'Cerrado',
};

function sponsorFieldsHtml(c: Client): string {
  return `<div style="margin-top:10px;padding-top:10px;border-top:0.5px solid var(--line-soft);">
    <p style="font-size:10px;font-weight:600;color:var(--text-mute);margin:0 0 6px;text-transform:uppercase;letter-spacing:0.04em;">Patrocinio Newsletter</p>
    <input type="text" id="sponsor-link-${c.id}" class="padmin-sponsor-input" placeholder="Sitio web / WhatsApp (https://…)" value="${esc(c.website_url || '')}">
    <input type="text" id="sponsor-copy-${c.id}" class="padmin-sponsor-input" placeholder="Copy (ej. Lo mejor para tu hogar)" value="${esc(c.sponsor_copy || '')}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:4px;">
      <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="save-sponsor-info" data-id="${c.id}">Guardar datos</button>
      ${c.last_sponsored_at ? `<span style="font-size:10px;color:var(--mute-2);">Último: ${new Date(c.last_sponsored_at).toLocaleDateString('es-MX')}</span>` : ''}
    </div>
  </div>`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function commColumn(title: string, stage: string, color: string, clients: Client[], canMove: boolean, canDelete: boolean): string {
  const items = clients.filter((c) => c.pipeline_stage === stage);
  const currentIdx = PIPELINE_STAGES_ORDER.indexOf(stage);
  const prevStage = currentIdx > 0 ? PIPELINE_STAGES_ORDER[currentIdx - 1] : null;
  const nextStage = currentIdx < PIPELINE_STAGES_ORDER.length - 1 ? PIPELINE_STAGES_ORDER[currentIdx + 1] : null;

  return `<div class="padmin-kanban-col">
    <div class="padmin-kanban-col-head">
      <p class="padmin-kanban-col-title" style="margin:0;">${title}</p>
      <span class="padmin-badge" style="background:var(--bg-soft);color:var(--text-mute);font-size:11px;">${items.length}</span>
    </div>
    <div class="padmin-kanban-cards">
      ${items.length ? items.map((c) => {
        const phoneClean = c.phone ? c.phone.replace(/[^\d+]/g, '') : '';
        const days = daysSince(c.last_contact_at);
        const isStale = days != null && days >= 7;

        return `<div class="padmin-idea-card padmin-client-card" style="border-top:3px solid ${color};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
            <p class="padmin-row-title" style="margin:0;font-size:13px;line-height:1.3;">${esc(c.name)}</p>
            ${c.package ? `<span class="padmin-badge" style="font-size:10px;background:var(--bg-soft);">${esc(c.package)}</span>` : ''}
          </div>
          
          ${c.business_name ? `<p style="font-size:11px;color:var(--text-mute);margin:0 0 6px;">${esc(c.business_name)}</p>` : ''}
          ${c.interest ? `<p class="padmin-row-meta" style="margin-bottom:6px;font-size:11px;">${esc(c.interest)}</p>` : ''}
          
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:12px;font-weight:600;color:${color};">${esc(c.estimated_value || '—')}</span>
            <span style="font-size:10px;color:${isStale ? 'var(--danger)' : 'var(--mute-2)'};font-weight:${isStale ? '600' : '400'};" title="${c.last_contact_at ? new Date(c.last_contact_at).toLocaleString('es-MX') : 'Sin registro'}">
              ${isStale ? '⚠️ ' : ''}${c.last_contact_at ? `Contacto: hace ${days}d` : 'Sin contacto'}
            </span>
          </div>

          <!-- Contacto rápido -->
          <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
            ${c.phone ? `<a href="tel:${esc(phoneClean)}" class="padmin-btn-sm padmin-btn-outline" style="text-decoration:none;padding:2px 6px;font-size:11px;" title="Llamar / WhatsApp">📞 Tel</a>` : ''}
            ${c.email ? `<a href="mailto:${esc(c.email)}" class="padmin-btn-sm padmin-btn-outline" style="text-decoration:none;padding:2px 6px;font-size:11px;" title="Enviar correo">✉️ Email</a>` : ''}
            ${canMove ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" style="padding:2px 6px;font-size:11px;" data-action="touch-client-contact" data-id="${c.id}" title="Registrar contacto hoy">Hoy ✓</button>` : ''}
          </div>

          <!-- Acciones de movimiento -->
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap;padding-top:6px;border-top:0.5px solid var(--line-soft);">
            <div style="display:flex;gap:4px;">
              ${canMove && prevStage ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" style="padding:3px 7px;" data-action="set-client-stage" data-id="${c.id}" data-stage="${prevStage}" title="Mover a ${STAGE_NAMES[prevStage]}">&larr;</button>` : ''}
              ${canMove && nextStage ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" style="padding:3px 7px;" data-action="set-client-stage" data-id="${c.id}" data-stage="${nextStage}" title="Mover a ${STAGE_NAMES[nextStage]}">&rarr;</button>` : ''}
            </div>
            ${canDelete ? `<button type="button" class="padmin-btn-sm padmin-btn-danger" style="padding:3px 7px;" data-action="delete-client" data-id="${c.id}" title="Eliminar cliente">🗑</button>` : ''}
          </div>

          ${stage === 'cerrado' ? sponsorFieldsHtml(c) : ''}
        </div>`;
      }).join('') : `<div style="padding:16px 12px;border:1px dashed var(--line-soft);border-radius:6px;text-align:center;"><p style="font-size:11px;color:var(--mute-2);margin:0;">Sin prospectos</p></div>`}
    </div>
  </div>`;
}

export function renderComercial(): string {
  const clients = state.data.clients;
  if (!clients) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const canMove = state.user!.role === 'comercial' || state.user!.role === 'director';
  const canDelete = state.user!.role === 'director';
  const search = (state.comercialSearch || '').trim().toLowerCase();

  const filtered = search ? clients.filter((c: Client) => {
    return (c.name && c.name.toLowerCase().includes(search)) ||
           (c.business_name && c.business_name.toLowerCase().includes(search)) ||
           (c.package && c.package.toLowerCase().includes(search)) ||
           (c.email && c.email.toLowerCase().includes(search)) ||
           (c.interest && c.interest.toLowerCase().includes(search));
  }) : clients;

  const errorHtml = state.formError ? `<p class="padmin-lede" style="color:var(--danger);">${esc(state.formError)}</p>` : '';
  const formHtml = state.form?.kind === 'client' ? (
    `<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:640px;">
      ${errorHtml}
      <form data-action="submit-new-client" class="padmin-grid2" style="gap:10px;">
        <div class="padmin-field" style="margin:0;"><label>Nombre del prospecto</label><input id="nc-name" type="text" required placeholder="Persona de contacto"></div>
        <div class="padmin-field" style="margin:0;"><label>Negocio o Empresa</label><input id="nc-business" type="text" placeholder="Nombre comercial"></div>
        <div class="padmin-field" style="margin:0;"><label>Paquete de interés</label><select id="nc-package"><option value="básico">Básico</option><option value="profesional">Profesional</option><option value="premium">Premium</option></select></div>
        <div class="padmin-field" style="margin:0;"><label>Teléfono</label><input id="nc-phone" type="tel" placeholder="ej. 282 123 4567"></div>
        <div class="padmin-field" style="margin:0;"><label>Correo</label><input id="nc-email" type="email" placeholder="cliente@ejemplo.com"></div>
        <div style="grid-column:1 / -1;display:flex;gap:8px;margin-top:6px;"><button type="submit" class="padmin-btn padmin-btn-sm">Crear cliente</button><button type="button" class="padmin-btn-outline" data-action="close-client-form">Cancelar</button></div>
      </form>
    </div>`
  ) : '';

  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
      <div>
        <h1 class="padmin-h1" style="margin-bottom:4px;">Pipeline comercial</h1>
        <p class="padmin-lede" style="margin:0;">Gestión de prospectos, patrocinios y clientes en proceso.</p>
      </div>
      ${canMove && state.form?.kind !== 'client' ? `<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-brand" data-action="open-client-form">+ Nuevo cliente</button>` : ''}
    </div>

    <!-- Barra de búsqueda y resumen -->
    <div class="padmin-card padmin-pipeline-action-bar" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;flex:1;max-width:380px;">
        <input id="comercial-search-input" type="search" placeholder="🔍 Buscar por nombre, negocio o paquete…" value="${esc(state.comercialSearch || '')}" style="width:100%;font-size:12px;padding:6px 10px;border-radius:6px;border:0.5px solid var(--line-soft);background:var(--bg-admin);color:var(--text);">
        ${state.comercialSearch ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="clear-comercial-search" style="padding:4px 8px;">&times;</button>` : ''}
      </div>
      <div style="display:flex;gap:14px;align-items:center;font-size:12px;color:var(--text-mute);">
        <span>Total: <strong>${filtered.length}</strong> prospecto${filtered.length === 1 ? '' : 's'}</span>
        <span>Cerrados: <strong>${filtered.filter((c: Client) => c.pipeline_stage === 'cerrado').length}</strong></span>
      </div>
    </div>

    ${formHtml}

    <div class="padmin-kanban">
      ${commColumn('IDENTIFICADO', 'identificado', 'var(--accent)', filtered, canMove, canDelete)}
      ${commColumn('CONTACTADO', 'contactado', 'var(--accent)', filtered, canMove, canDelete)}
      ${commColumn('PROPUESTA ENVIADA', 'propuesta_enviada', 'var(--accent)', filtered, canMove, canDelete)}
      ${commColumn('CERRADO', 'cerrado', 'var(--brand)', filtered, canMove, canDelete)}
    </div>
  </div>`;
}

export function renderLeads(): string {
  const leads = state.data.leads;
  if (!leads) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const canDelete = state.user!.role === 'director';
  const statuses = ['todos', 'nuevo', 'contactado', 'descartado'];
  const chips = statuses.map((st) => {
    const active = state.leadsStatus === st;
    return `<button type="button" class="padmin-chip${active ? ' active' : ''}" aria-pressed="${active}" data-action="set-leads-status" data-value="${st}">${st === 'todos' ? 'Todos' : STATUS_LABEL[st]}</button>`;
  }).join('');
  const filtered = leads.filter((l: Lead) => state.leadsStatus === 'todos' || l.status === state.leadsStatus);
  const nuevos = leads.filter((l: Lead) => l.status === 'nuevo').length;
  const { pageItems, page, totalPages } = paginateRows(filtered, state.leadsPage);

  return `<div>
    <h1 class="padmin-h1">Leads</h1>
    <p class="padmin-lede">Mensajes del formulario de contacto del sitio. ${nuevos ? nuevos + ' sin atender.' : 'Sin pendientes.'}</p>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap;" role="group" aria-label="Filtrar leads por estado">${chips}</div>
    <div class="padmin-card">
      <div class="padmin-table-head padmin-cols-leads"><span>RECIBIDO</span><span>CONTACTO</span><span>INTERÉS</span><span>MENSAJE</span><span>ESTADO</span><span>ACCIONES</span></div>
      ${filtered.length ? pageItems.map((l: Lead) =>
        `<div class="padmin-table-row padmin-cols-leads">
          <span class="padmin-t-small">${esc(relativeTime(l.created_at))}</span>
          <div style="min-width:0;"><p class="padmin-row-title">${esc(l.name)}${l.company ? ' · ' + esc(l.company) : ''}</p><p class="padmin-row-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(l.email || '')}</p></div>
          <span class="padmin-t-mute">${esc(l.service_interest || '—')}</span>
          <span style="font-size:12px;color:var(--text-2);line-height:1.4;" title="${esc(l.message || '')}">${esc((l.message || '—').slice(0, 140))}${(l.message || '').length > 140 ? '…' : ''}</span>
          <span>${badge(l.status)}</span>
          <span style="display:flex;gap:4px;flex-wrap:wrap;">
            ${l.status === 'nuevo' ? `<button type="button" class="padmin-icon-btn" title="Marcar contactado" aria-label="Marcar lead como contactado" data-action="mark-lead" data-id="${l.id}" data-status="contactado">✓</button>` : ''}
            ${l.status !== 'descartado' ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="convert-lead" data-id="${l.id}">→ Cliente</button>` : ''}
            ${l.status !== 'descartado' ? `<button type="button" class="padmin-icon-btn" title="Descartar" aria-label="Descartar lead" data-action="mark-lead" data-id="${l.id}" data-status="descartado">✕</button>` : ''}
            ${canDelete ? `<button type="button" class="padmin-icon-btn" title="Eliminar" aria-label="Eliminar lead" data-action="delete-lead" data-id="${l.id}">🗑</button>` : ''}
          </span>
        </div>`
      ).join('') : `<div class="padmin-row"><p class="padmin-row-meta">${leads.length ? 'Sin leads con ese estado.' : 'Todavía no llegan mensajes del formulario de contacto.'}</p></div>`}
      ${renderPager(page, totalPages, filtered.length, 'set-leads-page')}
    </div>
  </div>`;
}

