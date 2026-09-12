// CREA Panel Admin — Editor de nota (picker, formulario, vista previa, QA).
import { state, type Proposal, type EditorDraft } from '../store';

interface NotaPreviewInput {
  body?: string | null;
  cover_image_url?: string | null;
  author_name?: string | null;
  is_sponsored?: boolean;
  sponsor_name?: string | null;
  section?: string | null;
  title?: string | null;
  dek?: string | null;
}
import { esc, badge, loadingCard, errorCard, initialsOf, safeHttpUrl, relativeTime } from '../util';
import type { ContentRender, RenderChannel, ProposalVersion } from '../store';

function pickerRow(p: Proposal, editable: boolean): string {
  const fecha = p.updated_at ? new Date(p.updated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '';
  const thumbUrl = safeHttpUrl(p.cover_image_url);
  const thumb = thumbUrl
    ? `<img src="${esc(thumbUrl)}" alt="" class="padmin-picker-thumb" data-image-error="invisible">`
    : '<div class="padmin-picker-thumb padmin-picker-thumb-empty">Sin<br>imagen</div>';
  const meta = [p.section || '', fecha, p.author_name || ''].filter(Boolean).join(' · ');
  // El disparador por teclado es el título (botón real), no la fila: la fila lleva
  // botones dentro y un role="button" en el contenedor los volvería presentacionales.
  const title = editable
    ? `<button type="button" class="padmin-row-title padmin-row-title-btn" data-action="open-editor" data-id="${p.id}">${esc(p.title)}</button>`
    : `<p class="padmin-row-title">${esc(p.title)}</p>`;
  return `<div class="padmin-row${editable ? ` clickable" data-action="open-editor" data-id="${p.id}"` : '"'} style="gap:12px;">
    ${thumb}
    <div style="flex:1;min-width:0;">
      ${title}
      <p class="padmin-row-meta">${esc(meta)}${p.dek ? ' — ' + esc(String(p.dek).slice(0, 90)) : ''}</p>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
      ${badge(p.status)}
      <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="preview-piece" data-id="${p.id}">Vista previa</button>
      ${editable && state.user!.role === 'director' ? `<button type="button" class="padmin-btn-sm padmin-btn-danger-outline" data-action="delete-borrador" data-id="${p.id}">Eliminar</button>` : ''}
    </div>
  </div>`;
}

function renderPickerPreview(): string {
  if (!state.pickerPreview) return '';
  const p = state.pickerPreview;
  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-picker-preview"></div>
    <div class="padmin-modal" role="dialog" aria-modal="true" aria-label="Vista previa de la nota" style="width:720px;padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <p style="font-size:11px;font-weight:600;color:var(--text-mute);letter-spacing:0.06em;margin:0;">VISTA PREVIA — ${esc(p.title || '')}</p>
        <button type="button" class="padmin-drawer-close" data-action="close-picker-preview">Cerrar &times;</button>
      </div>
      <iframe srcdoc="${esc(buildNotaPreviewDoc(p))}" class="padmin-preview-frame" sandbox=""></iframe>
    </div>
  </div>`;
}

function renderEditorPicker(): string {
  const list = state.data.proposalsByKey.borrador;
  if (!list) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const mine = state.user!.role === 'produccion' ? list.filter((p: Proposal) => p.author_id === state.user!.id) : list;
  const inReview = state.data.proposalsByKey.en_revision || [];
  return `<div>
    <h1 class="padmin-h1">Editor de nota</h1>
    <p class="padmin-lede">Elige una pieza en borrador para editar.</p>
    <div class="padmin-card">${mine.length ? mine.map((p: Proposal) => pickerRow(p, true)).join('') :
      '<div class="padmin-row"><p class="padmin-row-meta">No hay piezas en borrador. Aprueba una propuesta desde "Propuestas IA".</p></div>'}</div>
    ${inReview.length ?
      `<p style="font-size:11px;font-weight:600;color:var(--text-mute);letter-spacing:0.06em;margin:22px 0 10px;">EN REVISIÓN (solo lectura — se editan devolviéndolas desde Aprobación)</p>
      <div class="padmin-card">${inReview.map((p: Proposal) => pickerRow(p, false)).join('')}</div>`
    : ''}
    ${renderPickerPreview()}
  </div>`;
}

function defaultImagePrompt(d: EditorDraft): string {
  const tema = d.title ? `"${d.title}"${d.dek ? '. ' + d.dek : ''}` : 'la nota';
  const sens = (d.sensibilidad || '').toLowerCase();
  if (sens === 'rojo' || sens === 'amarillo') {
    return `Ilustración editorial narrativa tipo cómic urbano para ${tema}. Contexto: sección ${d.section || 'Local'} de un medio digital en Perote, Veracruz. Dramatización visual con personajes semirrealistas (no fotorrealistas), iluminación cinematográfica, textura grunge, composición de cartel informativo. Tono serio, sin exageraciones caricaturescas — debe leerse claramente como ilustración/dramatización, nunca como fotografía del hecho real. Sin contenido gráfico explícito, sin texto sobre la imagen.`;
  }
  return `Imagen realista y profesional para ilustrar ${tema}. Contexto: sección ${d.section || 'Local'} de un medio digital en Perote, Veracruz. Estilo fotográfico documental, tonos cálidos y neutros, alta resolución, sin texto sobre la imagen.`;
}

export function renderEditor(): string {
  if (!state.editorProposalId) return renderEditorPicker();
  if (!state.editorDraft) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const d = state.editorDraft;
  const imagePrompt = state.editorImagePrompt != null ? state.editorImagePrompt : (d.image_prompt || defaultImagePrompt(d));
  const sens = (d.sensibilidad || '').toLowerCase();
  const isSensitive = sens === 'rojo' || sens === 'amarillo';
  const skipImageDefault = sens === 'rojo';
  const sensBadge = isSensitive
    ? `<div class="padmin-field" style="background:${sens === 'rojo' ? '#F4D9D9' : '#F6ECC9'};border-radius:6px;padding:8px 10px;margin-bottom:12px;">
        <strong style="font-size:11px;color:${sens === 'rojo' ? '#8A2E2E' : '#8A6B0F'};">⚠ SENSIBILIDAD: ${sens.toUpperCase()}</strong>
        <p style="font-size:11px;color:var(--text-2);margin:4px 0 0;">Tema sensible — evita fotos explícitas de lugares/personas reales; usa ilustración editorial.</p>
      </div>`
    : '';
  return `<div class="padmin-editor-wrap">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;">
      <h1 class="padmin-h1" style="margin:0;">Editor de nota</h1> ${badge('borrador')}
    </div>
    ${renderAutosaveBanner()}
    <div class="padmin-editor-cols">
    <div class="padmin-editor-card padmin-editor-main">
      ${sensBadge}
      <div class="padmin-field" style="margin-bottom:16px;">
        <label class="padmin-t-small">Directriz editorial (opcional)</label>
        <textarea id="editor-directive" placeholder="Ej: enfocar en impacto económico, no político. Incluir versión ciudadana, no solo oficial." style="min-height:60px;font-size:13px;">${esc(d.editorial_directive)}</textarea>
        <p style="font-size:11px;color:var(--text-mute);margin:4px 0 0;">Se aplica antes de generar título/cuerpo con IA. Vacío = voz estándar de CREA.</p>
      </div>
      <label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:8px;">Título</label>
      <input id="editor-title" class="padmin-title-input" value="${esc(d.title)}" style="width:100%;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;margin-top:12px;">
        <label class="padmin-t-small">Cuerpo</label>
        <button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-draft" ${state.generatingDraft ? 'disabled' : ''}>${state.generatingDraft ? 'Generando…' : 'Generar borrador con IA'}</button>
      </div>
      <textarea id="editor-body" class="padmin-body-textarea">${esc(d.body)}</textarea>
    </div>
    <aside class="padmin-editor-card padmin-editor-meta">
      <p class="padmin-editor-meta-title">Metadatos de la nota</p>
      <div class="padmin-field"><label>Sección editorial</label><select id="editor-section">${['Local', 'Cultura', 'Economía', 'Entretenimiento', 'Deportes', 'Opinión'].map((s) => `<option${d.section === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="padmin-field"><label>Dek / bajada</label><input id="editor-dek" type="text" value="${esc(d.dek)}"></div>
      <div class="padmin-field"><label>Slug</label>
        <div style="display:flex;gap:6px;">
          <input id="editor-slug" type="text" value="${esc(d.slug)}" placeholder="vacío = se genera automático del título al guardar" style="flex:1;">
          <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="suggest-slug" ${state.suggestingSlug ? 'disabled' : ''}>${state.suggestingSlug ? '…' : 'Generar slug recomendado'}</button>
        </div>
      </div>
      <div class="padmin-field"><label>Autor / firma</label><input id="editor-author" type="text" value="${esc(d.author_name)}"></div>
      <div class="padmin-field"><label>Imagen de portada (URL)</label><input id="editor-cover" type="text" value="${esc(d.cover_image_url)}" placeholder="https://..."></div>
      ${safeHttpUrl(d.cover_image_url) ? `<img id="editor-cover-thumb" src="${esc(safeHttpUrl(d.cover_image_url))}" alt="" style="display:block;width:100%;max-height:200px;object-fit:cover;border-radius:6px;margin:-8px 0 14px;" data-image-error="hide">` : `<img id="editor-cover-thumb" style="display:none;width:100%;max-height:200px;object-fit:cover;border-radius:6px;margin:-8px 0 14px;" data-image-error="hide">`}
      ${isSensitive ? `<div class="padmin-field-inline padmin-field"><input id="editor-skip-image" type="checkbox" ${skipImageDefault ? 'checked' : ''}><label for="editor-skip-image" class="padmin-t-body">No generar imagen (nota sensible)</label></div>` : ''}
      <div class="padmin-ia-image" id="editor-ia-image-block" style="display:${isSensitive && skipImageDefault ? 'none' : ''};">
        <p class="padmin-ia-image-title">Generación de imagen de portada con IA</p>
        <button type="button" class="padmin-btn" data-action="generate-image" style="width:100%;margin-bottom:12px;" ${state.generatingImage ? 'disabled' : ''}>${state.generatingImage ? 'Generando imagen…' : 'Generar imagen con IA'}</button>
        <div class="padmin-field"><label>Prompt sugerido (editable)</label><textarea id="editor-image-prompt" style="min-height:110px;font-size:12px;">${esc(imagePrompt)}</textarea></div>
      </div>
      <div class="padmin-field-inline padmin-field"><input id="editor-sponsored" type="checkbox" ${d.is_sponsored ? 'checked' : ''}><label for="editor-sponsored" class="padmin-t-body">Nota patrocinada (publicidad)</label></div>
      <div class="padmin-field" id="editor-sponsor-name-field" style="margin-bottom:0;display:${d.is_sponsored ? '' : 'none'};"><label>Patrocinado por</label><input id="editor-sponsor-name" type="text" value="${esc(d.sponsor_name)}" placeholder="Nombre del negocio"></div>
      ${renderEditChat()}
    </aside>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button type="button" class="padmin-btn padmin-btn-brand" data-action="submit-review" data-id="${state.editorProposalId}">Enviar a revisión</button>
      <button type="button" class="padmin-btn-outline" data-action="save-draft" data-id="${state.editorProposalId}">Guardar borrador</button>
      ${d.body ? `<button type="button" class="padmin-btn-outline" data-action="run-qa" ${state.qaBusy ? 'disabled' : ''}>${state.qaBusy ? 'Verificando…' : 'Verificar texto'}</button>` : ''}
      <button type="button" class="padmin-btn-outline" data-action="preview-nota">Vista previa</button>
      <button type="button" class="padmin-btn-outline" data-action="close-editor">Volver</button>
    </div>
    ${renderQaResult()}
    ${renderNotaPreview()}
    ${renderChannelRenders()}
    ${renderVersionHistory()}
  </div>`;
}

// R2-59: aviso de un cambio sin guardar detectado en localStorage (recarga o cierre
// accidental) — nunca se aplica solo, el editor decide restaurar o descartar.
function renderAutosaveBanner(): string {
  const pending = state.editorAutosavePending;
  if (!pending) return '';
  return `<div class="padmin-field" style="background:#F6ECC9;border-radius:6px;padding:10px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
    <p style="margin:0;font-size:12px;color:#8A6B0F;">Se encontró un cambio sin guardar de ${esc(relativeTime(pending.savedAt))} (recarga o cierre accidental de esta pestaña).</p>
    <div style="display:flex;gap:6px;flex-shrink:0;">
      <button type="button" class="padmin-btn-sm padmin-btn-brand" data-action="restore-autosave">Restaurar</button>
      <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="discard-autosave">Descartar</button>
    </div>
  </div>`;
}

// R2-59: historial mínimo de versiones — snapshots de IA (generate-proposal/-draft)
// y de cada "Guardar borrador" explícito. Restaurar solo llena el formulario, no
// guarda por sí solo (misma regla que el resto del panel: guardar es un clic humano).
function renderVersionHistory(): string {
  const versions = state.editorVersions;
  if (!versions || !versions.length) return '';
  return `<div class="padmin-editor-card" style="margin-top:10px;">
    <p class="padmin-editor-meta-title">Historial de versiones</p>
    ${versions.map((v) => renderVersionRow(v)).join('')}
  </div>`;
}

function renderVersionRow(v: ProposalVersion): string {
  const label = v.source === 'ai_generated' ? 'Generado por IA' : 'Guardado';
  return `<div style="border-top:1px solid var(--line);padding:8px 0;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
    <span class="padmin-t-small">${badge(v.source === 'ai_generated' ? 'signal' : 'activo', label)} ${esc(relativeTime(v.created_at))} — <em>${esc((v.title || '').slice(0, 60))}</em></span>
    <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="restore-version" data-version-id="${v.id}">Restaurar</button>
  </div>`;
}

// R2-38 (fase 6): estado del render vigente por canal (web/whatsapp/facebook/audio) +
// regenerar uno a la vez. Regenerar es siempre un clic humano explícito — nunca un
// efecto secundario de guardar/publicar (docs/implementaciones/radar2/06-multiformato.md).
const RENDER_CHANNELS: { key: RenderChannel; label: string }[] = [
  { key: 'web', label: 'Web — lectura del análisis' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'social', label: 'Facebook' },
  { key: 'audio', label: 'Audio' },
];

function renderChannelRenders(): string {
  const renders = state.editorRenders;
  return `<div class="padmin-editor-card" style="margin-top:10px;">
    <p class="padmin-editor-meta-title">Renders por canal</p>
    <p style="font-size:11px;color:var(--text-mute);margin:0 0 4px;">Empaque del análisis del Motor Editorial para cada canal (si el tema tiene uno; si no, usa título/dek de la nota). "Desactualizado" = el tema ya tiene un análisis más nuevo que el usado aquí.</p>
    ${renders === null
      ? '<p class="padmin-t-small">Cargando…</p>'
      : RENDER_CHANNELS.map((c) => renderChannelRow(c.key, c.label, renders.find((r) => r.channel === c.key) || null)).join('')}
  </div>`;
}

function renderChannelRow(channel: RenderChannel, label: string, render: ContentRender | null): string {
  const busy = state.regeneratingRenderChannel === channel;
  const statusBadge = !render
    ? badge('sin_evaluar', 'Sin generar')
    : (render.stale ? badge('stale', 'Desactualizado') : badge('ok', 'Vigente'));
  const preview = render ? (typeof render.content === 'string' ? render.content : render.content.body) : '';
  return `<div style="border-top:1px solid var(--line);padding:10px 0;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
      <span class="padmin-t-body">${esc(label)}</span>
      <div style="display:flex;gap:6px;align-items:center;">
        ${statusBadge}
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="regenerate-render" data-channel="${channel}" ${busy ? 'disabled' : ''}>${busy ? '…' : (render ? 'Regenerar' : 'Generar')}</button>
      </div>
    </div>
    ${preview ? `<p class="padmin-t-small" style="margin:6px 0 0;white-space:pre-line;">${esc(preview.slice(0, 220))}${preview.length > 220 ? '…' : ''}</p>` : ''}
  </div>`;
}

function renderNotaPreview(): string {
  if (!state.notaPreviewHtml) return '';
  return `<div class="padmin-editor-card" style="margin-top:10px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <p style="font-size:11px;font-weight:600;color:var(--text-mute);letter-spacing:0.06em;margin:0;">VISTA PREVIA — así se vería publicada</p>
      <button type="button" class="padmin-drawer-close" data-action="close-nota-preview">Cerrar &times;</button>
    </div>
    <iframe srcdoc="${esc(state.notaPreviewHtml)}" class="padmin-preview-frame" sandbox=""></iframe>
  </div>`;
}

function inputVal(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement).value;
}
function checkedVal(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement).checked;
}

export function readEditorForm() {
  return {
    title: inputVal('editor-title'),
    body: inputVal('editor-body'),
    section: inputVal('editor-section'),
    dek: inputVal('editor-dek'),
    slug: inputVal('editor-slug'),
    cover_image_url: inputVal('editor-cover'),
    author_name: inputVal('editor-author'),
    is_sponsored: checkedVal('editor-sponsored'),
    sponsor_name: inputVal('editor-sponsor-name'),
    editorial_directive: inputVal('editor-directive'),
  };
}

// Construye un documento HTML autocontenido que imita el render público (apps/web)
// con los tokens del tema editorial para que el editor vea el resultado final sin depender
// de que la nota ya esté publicada. Hex hardcodeados a propósito (el iframe no hereda var()).
export function buildNotaPreviewDoc(d: NotaPreviewInput): string {
  const body = String(d.body || '');
  const minutes = Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200));
  const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const paras = body.split(/\n\s*\n/).filter(Boolean).map((p) =>
    `<p style="font-size:16px;line-height:1.75;margin:0 0 18px;">${esc(p)}</p>`
  ).join('');
  const coverUrl = safeHttpUrl(d.cover_image_url);
  const cover = coverUrl
    ? `<img src="${esc(coverUrl)}" alt="" style="width:100%;max-height:420px;object-fit:cover;border-radius:8px;margin-bottom:24px;display:block;">`
    : '<div style="width:100%;height:260px;background:#DCE6D6;border-radius:8px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#2F5233;">Sin imagen de portada</div>';
  const authorName = d.author_name || 'CREA Contenidos';
  const sponsorBlock = d.is_sponsored
    ? `<div style="background:#E2DFD3;border-radius:8px;padding:14px 18px;font-size:12px;color:#6B6A60;margin-top:18px;">Contenido patrocinado por <strong style="color:#1F2A22;">${esc(d.sponsor_name || 'un aliado de CREA')}</strong>.</div>`
    : '';
  return `<!DOCTYPE html><html lang="es-MX"><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <style>body{margin:0;padding:28px 24px;background:#ECEAE2;color:#1F2A22;font-family:'Inter',sans-serif;} .eyebrow{font-size:11px;font-weight:600;letter-spacing:0.06em;color:#2F5233;}</style>
    </head><body>
    <div style="max-width:640px;margin:0 auto;">
      <p class="eyebrow">${esc((d.section || 'LOCAL').toUpperCase())}${d.is_sponsored ? ' &middot; CONTENIDO PATROCINADO' : ''}</p>
      <h1 style="font-family:'Roboto Slab',serif;font-size:32px;line-height:1.2;margin:10px 0 16px;">${esc(d.title || 'Sin título')}</h1>
      ${d.dek ? `<p style="font-size:16px;color:#6B6A60;line-height:1.5;margin:0 0 20px;">${esc(d.dek)}</p>` : ''}
      <div style="display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:0.5px solid #C9C6B8;margin-bottom:24px;">
        <div style="width:36px;height:36px;border-radius:50%;background:#E3E2DD;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;">${esc(initialsOf(authorName))}</div>
        <div style="font-size:12px;color:#6B6A60;"><strong style="color:#1F2A22;">${esc(authorName)}</strong> &middot; ${esc(fecha)} &middot; ${minutes} min de lectura</div>
      </div>
      ${cover}
      ${paras || '<p style="font-size:13px;color:#9A9A93;">Sin contenido todavía.</p>'}
      ${sponsorBlock}
    </div></body></html>`;
}

// Chat de edición con IA, integrado en la columna derecha (metadatos): ahí ya vive
// el contexto de la nota y sobra espacio en pantalla frente al textarea de cuerpo.
// Cada hunk es un párrafo propuesto — el encargado aplica o descarta uno por uno
// (diff parcial), nunca todo-o-nada.
function renderEditChat(): string {
  const messages = state.editChatMessages.map((m) =>
    `<div class="padmin-chat-msg padmin-chat-msg-${m.role}">${esc(m.content)}</div>`
  ).join('');
  const pending = state.editChatPending.map((h) => `
    <div class="padmin-chat-hunk">
      <p class="padmin-chat-hunk-label">Párrafo ${h.index + 1}</p>
      <p class="padmin-chat-hunk-old">${esc(h.original)}</p>
      <p class="padmin-chat-hunk-new">${esc(h.suggested)}</p>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button type="button" class="padmin-btn-sm padmin-btn-brand" data-action="accept-edit-hunk" data-index="${h.index}">Aplicar</button>
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="reject-edit-hunk" data-index="${h.index}">Descartar</button>
      </div>
    </div>`).join('');
  const legend = state.editChatModel
    ? `<p class="padmin-chat-legend">Usando modelo: <strong>${esc(state.editChatModel)}</strong> · vía: <strong>${esc(state.editChatProvider || '')}</strong>${state.editChatUsesLeft != null ? ` · ${state.editChatUsesLeft} uso(s) restante(s) hoy` : ''}</p>`
    : '';
  return `<div class="padmin-chat">
    <p class="padmin-editor-meta-title">Asistente de edición (IA)</p>
    <div class="padmin-chat-messages">${messages || '<p class="padmin-chat-empty">Pide un cambio, ej. "acorta el segundo párrafo" o "corrige el tono".</p>'}</div>
    ${pending ? `<div class="padmin-chat-pending">${pending}</div>` : ''}
    ${state.editChatError ? `<p class="padmin-chat-error">${esc(state.editChatError)}</p>` : ''}
    <div style="display:flex;gap:6px;margin-top:10px;">
      <textarea id="edit-chat-input" class="padmin-chat-input" placeholder="Instrucción de edición..." rows="2" ${state.editChatBusy ? 'disabled' : ''}></textarea>
      <button type="button" class="padmin-btn padmin-btn-sm" data-action="send-edit-chat" ${state.editChatBusy ? 'disabled' : ''}>${state.editChatBusy ? '…' : 'Enviar'}</button>
    </div>
    ${legend}
  </div>`;
}

function renderQaResult(): string {
  if (!state.qaResult) return '';
  const q = state.qaResult;
  const color = q.score > 80 ? 'var(--brand)' : (q.score >= 50 ? 'var(--accent-2)' : 'var(--danger)');
  const issues = (q.issues || []).map((i) =>
    `<li style="margin-bottom:4px;">[${esc(i.type)}${i.line ? ' · línea ' + i.line : ''}] ${esc(i.text)}</li>`
  ).join('');
  return `<div class="padmin-editor-card" style="margin-top:10px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <p style="font-size:14px;font-weight:600;color:${color};margin:0;">Score: ${q.score}/100</p>
      <button type="button" class="padmin-drawer-close" data-action="close-qa">Cerrar &times;</button>
    </div>
    <ul style="font-size:12px;color:var(--text-2);padding-left:18px;margin:0 0 10px;">${issues || '<li>Sin observaciones.</li>'}</ul>
    <p style="font-size:12px;color:var(--text-mute);margin:0;">${esc(q.summary || '')}</p>
  </div>`;
}
