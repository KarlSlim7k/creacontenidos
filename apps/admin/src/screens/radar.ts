// CREA Panel Admin — pantalla RADAR (social listening).
import { state } from '../store';
import { esc, loadingCard } from '../util';

function sentimentStyle(label: string): { color: string; text: string } {
  if (label === 'positivo') return { color: 'var(--brand)', text: 'Positivo' };
  if (label === 'negativo') return { color: 'var(--danger)', text: 'Negativo' };
  return { color: 'var(--text-mute)', text: 'Neutral' };
}

function renderRadarDetail(): string {
  if (state.selectedRadarId == null) return '';
  const topics = state.data.topics || [];
  const topic = topics.filter((r: any) => r.id === state.selectedRadarId)[0];
  if (!topic) return '';
  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-radar"></div>
    <div class="padmin-drawer">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;"><p class="padmin-drawer-eyebrow">FICHA DE CONTEXTO</p><span class="padmin-drawer-close" data-action="close-radar">Cerrar &times;</span></div>
      <h2 style="font-size:16px;font-weight:600;color:var(--text);margin:0 0 16px;line-height:1.35;">${esc(topic.title)}</h2>
      <div style="display:flex;gap:16px;margin-bottom:22px;"><span style="font-size:11px;color:var(--text-mute);">Fuente: <b style="color:var(--text);">${esc(topic.source)}</b></span><span style="font-size:11px;color:var(--text-mute);">Menciones: <b style="color:var(--text);">${topic.mentions}</b></span></div>
      <p class="padmin-drawer-section-title">ANTECEDENTES</p><p class="padmin-drawer-section-body">${esc(topic.antecedentes || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">ACTORES INVOLUCRADOS</p><p class="padmin-drawer-section-body">${esc(topic.actores || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">ÁNGULOS DE COBERTURA SUGERIDOS</p><p class="padmin-drawer-section-body">${esc(topic.angulos || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">POTENCIAL DE AUDIENCIA</p><p class="padmin-drawer-section-body" style="margin-bottom:0;">${esc(topic.audiencia || 'Sin datos.')}</p>
      ${state.user!.role === 'director' || state.user!.role === 'produccion' ?
        `<div style="margin-top:20px;padding-top:16px;border-top:0.5px solid var(--line-soft);display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select id="proposal-format-${topic.id}" style="font-size:12px;border:0.5px solid var(--line-soft);border-radius:6px;padding:6px 8px;background:#fff;">
            ${['nota', 'post', 'guion_audio', 'guion_video'].map((f) => `<option value="${f}">${f}</option>`).join('')}
          </select>
          <button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-proposal-from-topic" data-id="${topic.id}" ${state.generatingProposal ? 'disabled' : ''}>${state.generatingProposal ? 'Generando…' : 'Generar propuesta IA'}</button>
          ${topic.status !== 'Revisado' ? `<button type="button" class="padmin-btn-sm" style="background:var(--brand-soft);color:var(--brand);" data-action="approve-topic" data-id="${topic.id}">✓ Aprobar</button>` : ''}
          <button type="button" class="padmin-btn-sm padmin-btn-danger" style="margin-left:auto;" data-action="delete-topic" data-id="${topic.id}">🗑 Eliminar</button>
        </div>` : ''}
    </div>
  </div>`;
}

export function renderRadar(): string {
  const tabs = '<div class="padmin-tabs">' + [
    { id: 'temas', label: 'Temas' },
    { id: 'competencia', label: 'Competencia' },
  ].map((t) =>
    `<button type="button" class="padmin-tab${state.radarTab === t.id ? ' active' : ''}" data-action="set-radar-tab" data-tab="${t.id}">${t.label}</button>`
  ).join('') + '</div>';
  return `<div>
    <h1 class="padmin-h1">RADAR &middot; Social listening</h1>
    <p class="padmin-lede">Temas detectados por listening y publicaciones de la competencia. Feed de trabajo, no contenido editorial.</p>
    ${tabs}
    ${state.radarTab === 'competencia' ? renderRadarCompetencia() : renderRadarTemas()}
  </div>`;
}

function renderRadarCompetencia(): string {
  const posts = state.data.competitors;
  if (!posts) return loadingCard();
  const canManage = state.user!.role === 'director' || state.user!.role === 'produccion';
  const detectBtn = canManage
    ? `<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px;">
        <button type="button" class="padmin-btn padmin-btn-sm padmin-btn-outline" data-action="detect-competitors-fb" ${state.competitorsBusy ? 'disabled' : ''}>${state.competitorsBusy ? 'Escaneando…' : '📘 Escanear Facebook'}</button>
        <button type="button" class="padmin-btn padmin-btn-sm" data-action="detect-competitors" ${state.competitorsBusy ? 'disabled' : ''}>${state.competitorsBusy ? 'Explorando…' : '🔎 Explorar competencia'}</button>
        ${posts.length ? '<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-danger" data-action="clear-competitors">🗑 Limpiar todo</button>' : ''}
      </div>`
    : '';
  return detectBtn +
    `<div class="padmin-card">
      <div class="padmin-table-head padmin-cols-competencia"><span>CUENTA</span><span>PUBLICACIÓN</span><span>FECHA</span><span>INTERACCIONES</span><span>ESTADO</span><span>ACCIONES</span></div>
      ${posts.length ? posts.map((p: any) => {
        const inter = (p.reactions || 0) + (p.comments || 0) + (p.shares || 0);
        const st = p.analyzed ? { label: 'Analizado', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Nuevo', bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
        const text = String(p.post_text || '—');
        return `<div class="padmin-table-row padmin-cols-competencia">
          <div style="min-width:0;"><p class="padmin-row-title">${esc(p.source_account || '—')}</p><p class="padmin-row-meta" style="text-transform:uppercase;">${esc(p.source_platform || '')}</p></div>
          <div style="min-width:0;"><span style="font-size:12px;color:var(--text-2);line-height:1.4;" title="${esc(text)}">${esc(text.slice(0, 160))}${text.length > 160 ? '…' : ''}</span>
            ${p.post_url ? `<a href="${esc(p.post_url)}" target="_blank" rel="noopener" style="display:block;font-size:11px;color:var(--accent-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.post_url)}</a>` : ''}</div>
          <span style="font-size:11px;color:var(--text-mute);">${p.post_date ? new Date(p.post_date).toLocaleDateString('es-MX') : '—'}</span>
          <span style="font-size:12px;font-weight:600;color:var(--text);">${inter}</span>
          <span><span class="padmin-badge" style="background:${st.bg};color:${st.color};">${st.label}</span></span>
          <span style="display:flex;gap:4px;flex-wrap:wrap;">
            ${canManage ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" title="Crear idea en la bandeja a partir de esta publicación" data-action="competitor-to-idea" data-id="${p.id}">→ Idea</button>` : ''}
            ${canManage && !p.analyzed ? `<button type="button" class="padmin-icon-btn" title="Marcar analizado" data-action="analyze-competitor" data-id="${p.id}">✓</button>` : ''}
            ${canManage ? `<button type="button" class="padmin-icon-btn" title="Eliminar" data-action="delete-competitor" data-id="${p.id}">🗑</button>` : ''}
          </span>
        </div>`;
      }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin publicaciones de competencia. Usa "Explorar competencia" para escanear con IA.</p></div>'}
    </div>`;
}

function renderRadarTemas(): string {
  const topics = state.data.topics;
  if (!topics) return loadingCard();
  // Valores = source en BD (topic-detection → 'Web Search'; FB → 'Facebook').
  // No usar nombres de proveedor (Perplexity/Firecrawl): el filtro es igualdad exacta.
  const sources = ['Todas', 'Web Search', 'Facebook'];
  const statuses = ['Todos', 'Nuevo', 'Revisado'];
  const sourceChips = sources.map((src) => {
    const active = state.radarSource === src;
    return `<span class="padmin-chip" data-action="set-radar-source" data-value="${esc(src)}" style="background:${active ? 'var(--brand)' : 'var(--surface)'};color:${active ? '#fff' : 'var(--text)'};border-color:${active ? 'var(--brand)' : 'var(--line-soft)'};">${esc(src)}</span>`;
  }).join('');
  const statusChips = statuses.map((st) => {
    const active = state.radarStatus === st;
    return `<span class="padmin-chip" data-action="set-radar-status" data-value="${esc(st)}" style="background:${active ? 'var(--accent)' : 'var(--surface)'};color:${active ? '#fff' : 'var(--text)'};border-color:${active ? 'var(--accent)' : 'var(--line-soft)'};">${esc(st)}</span>`;
  }).join('');
  const filtered = topics.filter((r: any) =>
    (state.radarSource === 'Todas' || r.source === state.radarSource) && (state.radarStatus === 'Todos' || r.status === state.radarStatus)
  );

  return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap;">${sourceChips}<span style="width:1px;height:16px;background:var(--line-soft);margin:0 6px;"></span>${statusChips}
      ${state.user!.role === 'director' || state.user!.role === 'produccion' ?
        `<span style="margin-left:auto;display:flex;gap:8px;">
          ${topics.length ? '<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-danger" data-action="clear-topics">🗑 Limpiar todo</button>' : ''}
          <button type="button" class="padmin-btn padmin-btn-sm" data-action="detect-radar" ${state.radarBusy ? 'disabled' : ''}>${state.radarBusy ? 'Buscando…' : '🔍 Buscar tendencias'}</button>
        </span>` : ''}
    </div>
    <div class="padmin-card">
      <div class="padmin-table-head padmin-cols-radar"><span>TEMA</span><span>FUENTE</span><span>MENCIONES</span><span>SENTIMIENTO</span><span>ESTADO</span><span>ACCIONES</span></div>
      ${filtered.map((r: any) => {
        const sent = sentimentStyle(r.sentiment);
        const stStyle = r.status === 'Nuevo' ? { bg: 'var(--accent-soft)', color: 'var(--accent-text)' } : { bg: 'var(--brand-soft)', color: 'var(--brand)' };
        const canManage = state.user!.role === 'director' || state.user!.role === 'produccion';
        return `<div class="padmin-table-row clickable padmin-cols-radar" data-action="open-radar" data-id="${r.id}">
          <span style="font-size:13px;color:var(--text);">${esc(r.title)}</span>
          <span style="font-size:12px;color:var(--text-mute);">${esc(r.source)}</span>
          <span style="font-size:12px;color:var(--text);font-weight:600;">${r.mentions}</span>
          <span style="font-size:11px;font-weight:600;color:${sent.color};">${sent.text}</span>
          <span class="padmin-badge" style="background:${stStyle.bg};color:${stStyle.color};width:fit-content;">${esc(r.status)}</span>
          <span style="display:flex;gap:4px;">
            <button type="button" title="Ver" data-action="open-radar" data-id="${r.id}" class="padmin-icon-btn">👁</button>
            ${canManage ? `<button type="button" title="Aprobar" data-action="approve-topic" data-id="${r.id}" class="padmin-icon-btn" ${r.status === 'Revisado' ? 'disabled' : ''}>✓</button>` : ''}
            ${canManage ? `<button type="button" title="Eliminar" data-action="delete-topic" data-id="${r.id}" class="padmin-icon-btn">🗑</button>` : ''}
          </span>
        </div>`;
      }).join('')}
    </div>
    ${renderRadarDetail()}`;
}
