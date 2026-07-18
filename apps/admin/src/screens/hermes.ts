// CREA Panel Admin — pantallas Hermes (actividad) y Pipeline "Buenos días, Perote".
import { state } from '../store';
import { esc, loadingCard, relativeTime } from '../util';

export function renderHermes(): string {
  const activity = state.data.activity;
  if (!activity) return loadingCard();
  const skillCounts: Record<string, number> = {};
  activity.forEach((a: any) => { skillCounts[a.action] = (skillCounts[a.action] || 0) + 1; });
  const skills = Object.keys(skillCounts).map((k) => ({ name: k, count: skillCounts[k] })).sort((a, b) => b.count - a.count);
  return `<div>
    <h1 class="padmin-h1">Estado del agente Hermes</h1>
    <p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Actividad reciente</p>
    ${activity.length ? `<div class="padmin-hermes-log">${activity.map((h: any) => {
      const ok = h.status === 'exito';
      return `<div class="padmin-hermes-row"><span class="padmin-hermes-time">${esc(relativeTime(h.created_at))}</span><span class="padmin-hermes-task">${esc(h.detail || h.action)}</span><span style="color:${ok ? '#7CB084' : '#D98A7A'};flex-shrink:0;">${ok ? '✓ éxito' : '✕ falló'}</span></div>`;
    }).join('')}</div>` : '<p class="padmin-lede">Sin actividad registrada todavía.</p>'}
    ${skills.length ? `<p style="font-size:12px;font-weight:600;color:var(--text);margin:20px 0 4px;">Skills generados desde tareas repetidas</p>
      <div class="padmin-card">${skills.map((sk) =>
        `<div class="padmin-row"><span style="font-size:13px;color:var(--text);">${esc(sk.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text-mute);">${sk.count} usos</span></div>`
      ).join('')}</div>` : ''}
  </div>`;
}

function pipelineStepStyle(st: any) {
  if (st.status === 'completado') return { dotColor: 'var(--brand)', ringColor: 'var(--brand)', badgeBg: 'var(--brand-soft)', badgeColor: 'var(--brand)', badgeLabel: '✅ Automático completado', textColor: 'var(--text)', weight: 500 };
  if (st.status === 'esperando') return { dotColor: 'var(--accent)', ringColor: 'var(--accent)', badgeBg: 'var(--accent-soft)', badgeColor: 'var(--accent-text)', badgeLabel: '⏳ Esperando aprobación', textColor: 'var(--text)', weight: 600 };
  return { dotColor: '#fff', ringColor: 'var(--line-soft)', badgeBg: 'var(--bg-soft)', badgeColor: 'var(--mute-2)', badgeLabel: 'Pendiente — sin automatización', textColor: 'var(--mute-2)', weight: 400 };
}

export function renderPipeline(): string {
  const steps = state.data.pipeline;
  if (!steps) return loadingCard();
  return `<div>
    <h1 class="padmin-h1">Pipeline &middot; Buenos días, Perote</h1>
    <p class="padmin-lede">Estado del boletín matutino, derivado de la pieza editorial más reciente.</p>
    <div style="max-width:640px;">${steps.map((st: any) => {
      const sty = pipelineStepStyle(st);
      return `<div class="padmin-pipeline-step">
        <div class="padmin-pipeline-rail"><span class="padmin-pipeline-dot" style="background:${sty.dotColor};border-color:${sty.ringColor};"></span><span class="padmin-pipeline-line"></span></div>
        <div class="padmin-pipeline-body">
          <div class="padmin-pipeline-head"><p style="font-size:14px;font-weight:${sty.weight};color:${sty.textColor};margin:0;">${esc(st.label)}</p><span style="font-size:11px;color:var(--mute-2);">${esc(st.at ? relativeTime(st.at) : '—')}</span></div>
          <span class="padmin-badge" style="background:${sty.badgeBg};color:${sty.badgeColor};">${sty.badgeLabel}</span>
        </div>
      </div>`;
    }).join('')}</div>
    ${renderNewsletterCard()}
  </div>`;
}

function inputVal(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement).value;
}

export function readNewsletterForm() {
  const enBreveRaw = inputVal('nl-en-breve');
  return {
    weekday: state.newsletterContent.weekday,
    date: state.newsletterContent.date,
    clima: inputVal('nl-clima'),
    notaDelDia: {
      titulo: inputVal('nl-nota-titulo'),
      cuerpo: inputVal('nl-nota-cuerpo'),
    },
    enBreve: enBreveRaw.split('\n').map((s) => s.trim()).filter(Boolean),
    datoDelDia: inputVal('nl-dato'),
    agenda: inputVal('nl-agenda') || null,
    patrocinador: inputVal('nl-patro-nombre') ? {
      nombre: inputVal('nl-patro-nombre'),
      copy: inputVal('nl-patro-copy'),
      link: inputVal('nl-patro-link'),
    } : null,
  };
}

function renderNewsletterCard(): string {
  const count = state.newsletterSubscriberCount;
  const countHtml = `<p style="font-size:12px;color:var(--text-mute);margin:0 0 14px;">${count == null ? 'Cargando suscriptores…' : count + ' suscriptor' + (count === 1 ? '' : 'es') + ' activos en Resend.'}</p>`;

  if (!state.newsletterContent) {
    return `<div class="padmin-card" style="max-width:640px;margin-top:28px;padding:20px;">
      <p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 10px;">Newsletter del día</p>
      ${countHtml}
      <button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-newsletter" ${state.newsletterBusy ? 'disabled' : ''}>${state.newsletterBusy ? 'Generando…' : 'Generar contenido con IA'}</button>
      ${state.errorMsg ? `<p style="font-size:12px;color:var(--danger);margin:10px 0 0;">${esc(state.errorMsg)}</p>` : ''}
    </div>`;
  }

  const c = state.newsletterContent;
  const enBreveText = (c.enBreve || []).join('\n');
  return `<div class="padmin-card" style="max-width:640px;margin-top:28px;padding:20px;">
    <p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 10px;">Newsletter del día — ${esc(c.weekday)} ${esc(c.date)}</p>
    ${countHtml}
    <div class="padmin-field"><label>El clima</label><input id="nl-clima" type="text" value="${esc(c.clima)}"></div>
    <div class="padmin-field"><label>La nota del día — título</label><input id="nl-nota-titulo" type="text" value="${esc(c.notaDelDia.titulo)}"></div>
    <div class="padmin-field"><label>La nota del día — cuerpo</label><textarea id="nl-nota-cuerpo" style="width:100%;min-height:80px;box-sizing:border-box;">${esc(c.notaDelDia.cuerpo)}</textarea></div>
    <div class="padmin-field"><label>En breve (una por línea)</label><textarea id="nl-en-breve" style="width:100%;min-height:70px;box-sizing:border-box;">${esc(enBreveText)}</textarea></div>
    <div class="padmin-field"><label>Dato del día</label><input id="nl-dato" type="text" value="${esc(c.datoDelDia || '')}"></div>
    <div class="padmin-field"><label>Agenda (manual — sin fuente automática)</label><textarea id="nl-agenda" style="width:100%;min-height:50px;box-sizing:border-box;">${esc(c.agenda || '')}</textarea></div>
    <div class="padmin-editor-grid2">
      <div class="padmin-field" style="margin:0;"><label>Patrocinador (opcional)</label><input id="nl-patro-nombre" type="text" value="${esc(c.patrocinador ? c.patrocinador.nombre : '')}" placeholder="Nombre"></div>
      <div class="padmin-field" style="margin:0;"><label>Link</label><input id="nl-patro-link" type="text" value="${esc(c.patrocinador ? c.patrocinador.link : '')}" placeholder="https://…"></div>
    </div>
    <div class="padmin-field"><label>Copy del patrocinador</label><input id="nl-patro-copy" type="text" value="${esc(c.patrocinador ? c.patrocinador.copy : '')}"></div>
    ${state.errorMsg ? `<p style="font-size:12px;color:var(--danger);margin:10px 0;">${esc(state.errorMsg)}</p>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
      <button type="button" class="padmin-btn-outline" data-action="regenerate-newsletter" ${state.newsletterBusy ? 'disabled' : ''}>${state.newsletterBusy ? 'Generando…' : 'Regenerar con IA'}</button>
      <button type="button" class="padmin-btn-outline" data-action="preview-newsletter">Vista previa</button>
      <button type="button" class="padmin-btn-outline" data-action="generate-newsletter-audio" ${state.newsletterAudioBusy ? 'disabled' : ''}>${state.newsletterAudioBusy ? 'Generando audio…' : 'Generar audio (prueba)'}</button>
      ${state.user!.role === 'director' ? `<button type="button" class="padmin-btn padmin-btn-brand" data-action="send-newsletter" ${state.newsletterSending ? 'disabled' : ''}>${state.newsletterSending ? 'Enviando…' : 'Enviar newsletter'}</button>` : ''}
    </div>
    ${state.newsletterAudioUrl ? `<audio controls src="${esc(state.newsletterAudioUrl)}" style="width:100%;margin-top:14px;"></audio>` : ''}
    ${renderNewsletterPreview()}
  </div>`;
}

function renderNewsletterPreview(): string {
  if (!state.newsletterPreview) return '';
  return `<div style="margin-top:16px;border-top:1px solid var(--line-soft);padding-top:14px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><p style="font-size:11px;font-weight:600;color:var(--text);margin:0;">VISTA PREVIA</p><span class="padmin-drawer-close" data-action="close-newsletter-preview">Cerrar &times;</span></div>
    <iframe srcdoc="${esc(state.newsletterPreview)}" class="padmin-preview-frame"></iframe>
  </div>`;
}
