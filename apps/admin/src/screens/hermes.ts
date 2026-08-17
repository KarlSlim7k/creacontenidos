// CREA Panel Admin — pantallas Hermes (actividad) y Pipeline "Buenos días, Perote".
import { state, type ActivityEntry, type PipelineStep } from '../store';
import { esc, loadingCard, errorCard, relativeTime, badge, safeHttpUrl } from '../util';

export function renderHermes(): string {
  const activity = state.data.activity;
  if (!activity) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const skillCounts: Record<string, number> = {};
  activity.forEach((a: ActivityEntry) => { skillCounts[a.action] = (skillCounts[a.action] || 0) + 1; });
  const skills = Object.keys(skillCounts).map((k) => ({ name: k, count: skillCounts[k] })).sort((a, b) => b.count - a.count);
  return `<div>
    <h1 class="padmin-h1">Estado del agente Hermes</h1>
    <p class="padmin-section-title">Actividad reciente</p>
    ${activity.length ? `<div class="padmin-hermes-log">${activity.map((h: ActivityEntry) => {
      const ok = h.status === 'exito';
      return `<div class="padmin-hermes-row"><span class="padmin-hermes-time">${esc(relativeTime(h.created_at))}</span><span class="padmin-hermes-task">${esc(h.detail || h.action)}</span><span class="${ok ? 'padmin-hermes-status-ok' : 'padmin-hermes-status-fail'}">${ok ? '✓ éxito' : '✕ falló'}</span></div>`;
    }).join('')}</div>` : '<p class="padmin-lede">Sin actividad registrada todavía.</p>'}
    ${skills.length ? `<p class="padmin-section-title" style="margin-top:20px;margin-bottom:4px;">Skills generados desde tareas repetidas</p>
      <div class="padmin-card">${skills.map((sk) =>
        `<div class="padmin-row"><span class="padmin-t-body">${esc(sk.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text-mute);">${sk.count} usos</span></div>`
      ).join('')}</div>` : ''}
  </div>`;
}

function pipelineStepStyle(st: PipelineStep) {
  if (st.status === 'completado') return { dotColor: 'var(--brand)', ringColor: 'var(--brand)', badgeKey: 'activo', badgeLabel: '✅ Completado', textColor: 'var(--text)', weight: 500 };
  if (st.status === 'esperando') return { dotColor: 'var(--accent)', ringColor: 'var(--accent)', badgeKey: 'en_revision', badgeLabel: '⏳ Esperando acción', textColor: 'var(--text)', weight: 600 };
  return { dotColor: 'var(--surface)', ringColor: 'var(--line-soft)', badgeKey: 'inactivo', badgeLabel: 'Pendiente', textColor: 'var(--mute-2)', weight: 400 };
}

export function renderPipeline(): string {
  const steps = state.data.pipeline;
  if (!steps) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();

  const c = state.newsletterContent;
  const count = state.newsletterSubscriberCount;
  const events = state.data.newsletterEvents || [];
  const settings = state.data.newsletterSettings;
  const tab = state.pipelineTab || 'edicion';

  const totalWords = c ? ((c.notaDelDia?.cuerpo || '') + ' ' + (c.enBreve || []).join(' ') + ' ' + (c.guionPodcast || '')).split(/\s+/).filter(Boolean).length : 0;
  const readMins = Math.max(1, Math.round(totalWords / 180));

  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
      <div>
        <h1 class="padmin-h1" style="margin-bottom:4px;">Pipeline &middot; Buenos días, Perote</h1>
        <p class="padmin-lede" style="margin:0;">Centro de control para la generación, agenda, automatización y envío del boletín matutino.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="refresh-screen" title="Recargar estado">↻ Actualizar</button>
      </div>
    </div>

    <!-- Navegación de pestañas del pipeline -->
    <div class="padmin-tabs" style="margin-bottom:16px;">
      <button type="button" class="padmin-tab${tab === 'edicion' ? ' active' : ''}" data-action="set-pipeline-tab" data-tab="edicion">📰 Edición de hoy</button>
      <button type="button" class="padmin-tab${tab === 'agenda' ? ' active' : ''}" data-action="set-pipeline-tab" data-tab="agenda">📅 Agenda (${events.length})</button>
      <button type="button" class="padmin-tab${tab === 'programacion' ? ' active' : ''}" data-action="set-pipeline-tab" data-tab="programacion">⏰ Horario y Automatización</button>
    </div>

    ${tab === 'edicion' ? renderPipelineEdicion(steps, c, count, totalWords, readMins) : ''}
    ${tab === 'agenda' ? renderPipelineAgenda(events) : ''}
    ${tab === 'programacion' ? renderPipelineProgramacion(settings) : ''}
  </div>`;
}

function renderPipelineEdicion(steps: PipelineStep[], c: any, count: number | null, totalWords: number, readMins: number): string {
  return `<div>
    <!-- Barra de métricas y estado -->
    <div class="padmin-pipeline-metrics-bar">
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">AUDIENCIA</span>
        <span class="padmin-pipeline-metric-value">${count == null ? '—' : `${count} suscriptor${count === 1 ? '' : 'es'}`}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">ESTADO BOLETÍN</span>
        <span class="padmin-pipeline-metric-value">${c ? '📝 Listo para revisión' : '⏳ Pendiente de generar'}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">TEMAS USADOS</span>
        <span class="padmin-pipeline-metric-value">${c?.topicsUsed != null ? `${c.topicsUsed} temas` : '—'}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">LECTURA ESTIMADA</span>
        <span class="padmin-pipeline-metric-value">${c ? `~${readMins} min (${totalWords} pal.)` : '—'}</span>
      </div>
    </div>

    <!-- Línea de tiempo visual del pipeline -->
    <div class="padmin-card" style="padding:16px 20px 6px;margin-bottom:20px;">
      <p class="padmin-section-title" style="margin-bottom:14px;">Etapas de la edición matutina</p>
      <div class="padmin-pipeline-steps-wrap">${steps.map((st: PipelineStep) => {
        const sty = pipelineStepStyle(st);
        return `<div class="padmin-pipeline-step">
          <div class="padmin-pipeline-rail"><span class="padmin-pipeline-dot" style="background:${sty.dotColor};border-color:${sty.ringColor};"></span><span class="padmin-pipeline-line"></span></div>
          <div class="padmin-pipeline-body">
            <div class="padmin-pipeline-head">
              <p style="font-size:13px;font-weight:${sty.weight};color:${sty.textColor};margin:0;">${esc(st.label)}</p>
              <span style="font-size:11px;color:var(--mute-2);">${esc(st.at ? relativeTime(st.at) : '—')}</span>
            </div>
            ${badge(sty.badgeKey, sty.badgeLabel)}
          </div>
        </div>`;
      }).join('')}</div>
    </div>

    ${renderNewsletterCard()}
  </div>`;
}

function renderPipelineAgenda(events: any[]): string {
  return `<div class="padmin-card" style="padding:20px;max-width:760px;">
    <p class="padmin-section-title" style="margin-bottom:6px;">Agenda comunitaria del boletín</p>
    <p class="padmin-t-hint" style="margin-bottom:16px;">Eventos reales de la región (cortes de servicio, jornadas culturales, trámites o avisos). Esta información alimenta directamente la sección "Agenda" de la IA al redactar.</p>
    
    <form data-action="submit-newsletter-event" style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:flex-end;padding:14px;background:var(--bg-admin);border-radius:8px;border:0.5px solid var(--line-soft);">
      <div style="flex:0 0 160px;">
        <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px;">Fecha</label>
        <input id="ne-date" type="date" required style="width:100%;box-sizing:border-box;">
      </div>
      <div style="flex:1;min-width:220px;">
        <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px;">Título / Descripción del evento</label>
        <input id="ne-title" type="text" placeholder="Ej. Jornada de vacunación en Centro de Salud, 9:00 a 14:00" required style="width:100%;box-sizing:border-box;">
      </div>
      <button type="submit" class="padmin-btn padmin-btn-brand padmin-btn-sm">+ Agregar evento</button>
    </form>

    <div class="padmin-card" style="margin:0;">
      <div class="padmin-table-head" style="grid-template-columns: 140px 1fr 100px;">
        <span>FECHA</span>
        <span>EVENTO</span>
        <span style="text-align:right;">ACCIÓN</span>
      </div>
      ${events.length ? events.map((ev: any) =>
        `<div class="padmin-table-row" style="grid-template-columns: 140px 1fr 100px;align-items:center;">
          <span class="padmin-t-mute" style="font-size:12px;font-weight:500;">${esc(ev.event_date)}</span>
          <span class="padmin-row-title" style="font-size:13px;margin:0;">${esc(ev.title)}</span>
          <span style="text-align:right;">
            <button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-newsletter-event" data-id="${ev.id}">Eliminar</button>
          </span>
        </div>`
      ).join('') : '<p class="padmin-lede" style="padding:16px;">Sin eventos cargados. Agrega eventos para que aparezcan en el boletín matutino.</p>'}
    </div>
  </div>`;
}

function renderPipelineProgramacion(settings: any): string {
  if (!settings) return loadingCard('Cargando configuración de horario…');
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return `<div class="padmin-card" style="padding:20px;max-width:580px;">
    <p class="padmin-section-title" style="margin-bottom:6px;">Automatización y horario de generación</p>
    <p class="padmin-t-hint" style="margin-bottom:16px;">A la hora programada, el agente genera automáticamente el contenido matutino (clima, noticias y guion) y lo deja en espera para tu revisión. Nunca se envía a la audiencia sin tu aprobación.</p>

    <form data-action="submit-newsletter-settings">
      <div class="padmin-field padmin-field-inline" style="margin-bottom:16px;">
        <input id="nls-enabled" type="checkbox"${settings.enabled ? ' checked' : ''}>
        <label for="nls-enabled" style="font-weight:600;">Activar generación automática diaria</label>
      </div>
      
      <div class="padmin-editor-grid2" style="margin-bottom:12px;">
        <div class="padmin-field" style="margin:0;">
          <label>Hora de generación</label>
          <select id="nls-hour">${hours.map((h) => `<option value="${h}"${h === settings.send_hour ? ' selected' : ''}>${String(h).padStart(2, '0')} hrs</option>`).join('')}</select>
        </div>
        <div class="padmin-field" style="margin:0;">
          <label>Minuto</label>
          <select id="nls-minute">${minutes.map((m) => `<option value="${m}"${m === settings.send_minute ? ' selected' : ''}>${String(m).padStart(2, '0')} min</option>`).join('')}</select>
        </div>
      </div>

      <p style="font-size:11px;color:var(--mute-2);margin:0 0 16px;">Zona horaria configurada: America/Mexico_City.</p>
      ${state.errorMsg ? `<p style="font-size:12px;color:var(--danger);margin:0 0 12px;">${esc(state.errorMsg)}</p>` : ''}
      <button type="submit" class="padmin-btn padmin-btn-brand padmin-btn-sm">💾 Guardar horario</button>
    </form>
  </div>`;
}

function inputVal(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  return el ? el.value : '';
}

export function readNewsletterForm() {
  const enBreveRaw = inputVal('nl-en-breve');
  const fallbackDate = new Date().toISOString().slice(0, 10);
  return {
    weekday: state.newsletterContent ? state.newsletterContent.weekday : 'Hoy',
    date: state.newsletterContent ? state.newsletterContent.date : fallbackDate,
    clima: inputVal('nl-clima'),
    notaDelDia: {
      titulo: inputVal('nl-nota-titulo'),
      cuerpo: inputVal('nl-nota-cuerpo'),
    },
    enBreve: enBreveRaw.split('\n').map((s) => s.trim()).filter(Boolean),
    datoDelDia: inputVal('nl-dato'),
    agenda: inputVal('nl-agenda') || null,
    guionPodcast: inputVal('nl-guion') || null,
    patrocinador: inputVal('nl-patro-nombre') ? {
      nombre: inputVal('nl-patro-nombre'),
      copy: inputVal('nl-patro-copy'),
      link: inputVal('nl-patro-link'),
    } : null,
  };
}

function renderNewsletterCard(): string {
  const count = state.newsletterSubscriberCount;
  const countHtml = `<p class="padmin-t-hint">${count == null ? 'Cargando suscriptores…' : count + ' suscriptor' + (count === 1 ? '' : 'es') + ' activos en Resend.'}</p>`;

  if (!state.newsletterContent) {
    return `<div class="padmin-card" style="padding:24px;border:1px dashed var(--line-soft);text-align:center;">
      <div style="max-width:420px;margin:0 auto;">
        <p class="padmin-row-title" style="font-size:16px;margin-bottom:6px;">Boletín del día aún no generado</p>
        <p class="padmin-row-meta" style="margin-bottom:16px;">Genera la edición matutina a partir de las notas editoriales y temas detectados en RADAR.</p>
        ${countHtml}
        <button type="button" class="padmin-btn padmin-btn-brand" style="margin-top:12px;" data-action="generate-newsletter" ${state.newsletterBusy ? 'disabled' : ''}>
          ${state.newsletterBusy ? 'Generando contenido con IA…' : '✨ Generar contenido con IA'}
        </button>
        ${state.errorMsg ? `<p style="font-size:12px;color:var(--danger);margin:12px 0 0;">${esc(state.errorMsg)}</p>` : ''}
      </div>
    </div>`;
  }

  const c = state.newsletterContent;
  const enBreveText = (c.enBreve || []).join('\n');
  const enBreveCount = (c.enBreve || []).length;
  const podcastWords = (c.guionPodcast || '').split(/\s+/).filter(Boolean).length;
  const podcastEstDuration = podcastWords ? `~${Math.max(1, Math.round(podcastWords / 130))} min (${podcastWords} palabras)` : '—';
  const patroLinkSafe = safeHttpUrl(c.patrocinador?.link);

  return `<div>
    <!-- Barra superior de acciones fijas del newsletter -->
    <div class="padmin-card padmin-pipeline-action-bar">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:600;color:var(--text);">Edición: ${esc(c.weekday)} ${esc(c.date)}</span>
        <span class="padmin-badge" style="background:var(--brand-soft);color:var(--brand);">Borrador editable</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="regenerate-newsletter" ${state.newsletterBusy ? 'disabled' : ''} title="Volver a generar todo con IA">
          ${state.newsletterBusy ? 'Generando…' : '🔄 Regenerar IA'}
        </button>
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="save-newsletter" ${state.newsletterSaving ? 'disabled' : ''} title="Guardar borrador actual">
          ${state.newsletterSaving ? 'Guardando…' : '💾 Guardar borrador'}
        </button>
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="revert-newsletter" ${state.newsletterBusy ? 'disabled' : ''} title="Descartar cambios no guardados y volver al último guardado">
          ↩ Deshacer cambios
        </button>
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="preview-newsletter">
          👁 Vista previa
        </button>
        <button type="button" class="padmin-btn-sm padmin-btn-brand" data-action="send-newsletter" ${state.newsletterSending ? 'disabled' : ''}>
          ${state.newsletterSending ? 'Enviando…' : '🚀 Enviar newsletter'}
        </button>
      </div>
    </div>

    ${state.errorMsg ? `<div class="padmin-card" style="padding:12px 16px;background:var(--danger-soft);border:0.5px solid var(--danger);margin-bottom:16px;"><p style="font-size:12px;color:var(--danger);margin:0;">${esc(state.errorMsg)}</p></div>` : ''}

    <div class="padmin-pipeline-blocks-grid">
      <!-- BLOQUE 1: Contenido editorial del newsletter -->
      <div class="padmin-card padmin-pipeline-block">
        <div class="padmin-pipeline-block-header">
          <div>
            <p class="padmin-pipeline-block-title">📰 Contenido del Newsletter</p>
            <p class="padmin-t-hint">Estructura editorial que recibirán los suscriptores por correo.</p>
          </div>
        </div>

        <div class="padmin-field"><label>El clima</label><input id="nl-clima" type="text" value="${esc(c.clima)}" placeholder="Ej. 18°C despejado en Perote"></div>
        <div class="padmin-field"><label>La nota del día — Título</label><input id="nl-nota-titulo" type="text" value="${esc(c.notaDelDia?.titulo || '')}" placeholder="Título principal"></div>
        <div class="padmin-field"><label>La nota del día — Cuerpo</label><textarea id="nl-nota-cuerpo" style="width:100%;min-height:90px;box-sizing:border-box;">${esc(c.notaDelDia?.cuerpo || '')}</textarea></div>
        
        <div class="padmin-field">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <label style="margin:0;">En breve (una por línea)</label>
            <span style="font-size:11px;color:var(--mute-2);">${enBreveCount} viñeta${enBreveCount === 1 ? '' : 's'}</span>
          </div>
          <textarea id="nl-en-breve" style="width:100%;min-height:80px;box-sizing:border-box;">${esc(enBreveText)}</textarea>
        </div>

        <div class="padmin-field"><label>Dato curioso / Dato del día</label><input id="nl-dato" type="text" value="${esc(c.datoDelDia || '')}" placeholder="Dato relevante local o histórico"></div>
        <div class="padmin-field"><label>Agenda comunitaria / Eventos</label><textarea id="nl-agenda" style="width:100%;min-height:55px;box-sizing:border-box;" placeholder="Eventos locales o avisos del municipio">${esc(c.agenda || '')}</textarea></div>
      </div>

      <!-- BLOQUE 2 & 3: Patrocinio y Podcast -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <!-- Patrocinio -->
        <div class="padmin-card padmin-pipeline-block">
          <div class="padmin-pipeline-block-header">
            <div>
              <p class="padmin-pipeline-block-title">🤝 Patrocinio Comercial</p>
              <p class="padmin-t-hint">Espacio publicitario integrado en la plantilla.</p>
            </div>
            ${patroLinkSafe ? `<a href="${esc(patroLinkSafe)}" target="_blank" rel="noopener noreferrer" class="padmin-btn-sm padmin-btn-outline" style="text-decoration:none;font-size:11px;">↗ Probar enlace</a>` : ''}
          </div>

          <div class="padmin-grid2" style="gap:10px;margin-bottom:10px;">
            <div class="padmin-field" style="margin:0;"><label>Nombre patrocinador</label><input id="nl-patro-nombre" type="text" value="${esc(c.patrocinador ? c.patrocinador.nombre : '')}" placeholder="Ej. Ferretería Central"></div>
            <div class="padmin-field" style="margin:0;"><label>Enlace web / WhatsApp</label><input id="nl-patro-link" type="text" value="${esc(c.patrocinador ? c.patrocinador.link : '')}" placeholder="https://…"></div>
          </div>
          <div class="padmin-field" style="margin:0;"><label>Copy o mensaje promocional</label><input id="nl-patro-copy" type="text" value="${esc(c.patrocinador ? c.patrocinador.copy : '')}" placeholder="Texto breve para acompañar el patrocinio"></div>
        </div>

        <!-- Podcast Matutino -->
        <div class="padmin-card padmin-pipeline-block">
          <div class="padmin-pipeline-block-header">
            <div>
              <p class="padmin-pipeline-block-title">🎙️ Podcast Matutino & Audio</p>
              <p class="padmin-t-hint">Guion adaptado a locución radial (${podcastEstDuration}).</p>
            </div>
            <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="copy-podcast-script" title="Copiar guion al portapapeles">📋 Copiar guion</button>
          </div>

          <div class="padmin-field">
            <label>Guion para narración (editable)</label>
            <textarea id="nl-guion" style="width:100%;min-height:130px;box-sizing:border-box;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.45;">${esc(c.guionPodcast || '')}</textarea>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:6px;border-top:0.5px solid var(--line-soft);">
            <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="generate-newsletter-audio" ${state.newsletterAudioBusy ? 'disabled' : ''}>
              ${state.newsletterAudioBusy ? '⏳ Sintetizando audio…' : '🔊 Generar audio (TTS)'}
            </button>
            <span style="font-size:11px;color:var(--mute-2);">Mezcla voz con cortinillas fijas</span>
          </div>

          ${state.newsletterAudioUrl ? `<div style="margin-top:12px;padding:10px;background:var(--bg-admin);border-radius:6px;border:0.5px solid var(--line-soft);">
            <p style="font-size:11px;font-weight:600;color:var(--text);margin:0 0 6px;">Audio generado:</p>
            <audio controls src="${esc(state.newsletterAudioUrl)}" style="width:100%;height:36px;"></audio>
          </div>` : ''}
        </div>
      </div>
    </div>

    ${renderNewsletterPreview()}
  </div>`;
}

function renderNewsletterPreview(): string {
  if (!state.newsletterPreview) return '';
  const isMobile = state.newsletterPreviewDevice === 'mobile';

  return `<div class="padmin-card padmin-preview-wrapper" style="margin-top:20px;padding:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <p style="font-size:12px;font-weight:600;color:var(--text);margin:0;">VISTA PREVIA DEL CORREO</p>
        <div class="padmin-tabs" style="margin:0;display:inline-flex;">
          <button type="button" class="padmin-tab${!isMobile ? ' active' : ''}" style="padding:4px 10px;font-size:11px;" data-action="set-newsletter-preview-device" data-device="desktop">🖥 Escritorio</button>
          <button type="button" class="padmin-tab${isMobile ? ' active' : ''}" style="padding:4px 10px;font-size:11px;" data-action="set-newsletter-preview-device" data-device="mobile">📱 Móvil</button>
        </div>
      </div>
      <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="close-newsletter-preview">Cerrar vista previa &times;</button>
    </div>
    <div style="display:flex;justify-content:center;background:var(--bg-admin);padding:14px;border-radius:6px;border:0.5px solid var(--line-soft);">
      <iframe srcdoc="${esc(state.newsletterPreview)}" class="padmin-preview-frame" style="max-width:${isMobile ? '375px' : '640px'};height:580px;box-shadow:0 4px 12px rgba(0,0,0,0.06);"></iframe>
    </div>
  </div>`;
}

