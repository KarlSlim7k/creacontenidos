// CREA Panel Admin — pantalla RADAR (social listening + verificación editorial).
import { state, type Topic, type CompetitorPost, type RadarSource, type RadarStats, type EditorialAnalysis } from '../store';
import { esc, loadingCard, errorCard, badge, statusStyle, paginateRows, renderPager, safeHttpUrl, relativeTime } from '../util';
import { icon } from '../icons';
import { reasonSelectOptions } from '../reasons';

function canManageRadar(): boolean {
  return state.user!.role === 'director' || state.user!.role === 'produccion';
}

function verificationBadge(v: Topic['verification_status']): string {
  return badge(v || 'sin_evaluar');
}

function confidenceBand(c: number | null): { className: string; text: string } {
  if (c == null || Number.isNaN(c)) return { className: '', text: '—' };
  const n = Math.round(Number(c));
  if (n >= 75) return { className: 'high', text: String(n) };
  if (n >= 40) return { className: 'mid', text: String(n) };
  return { className: 'low', text: String(n) };
}

function confidenceBadge(c: number | null): string {
  const b = confidenceBand(c);
  if (b.text === '—') return `<span class="padmin-t-mute">—</span>`;
  const st = statusStyle(b.className === 'high' ? 'high' : b.className === 'mid' ? 'medium' : 'low');
  return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:24px;border-radius:12px;font-size:12px;font-weight:700;background:${st.bg};color:${st.color};">${esc(b.text)}</span>`;
}

// CREA Score (R2-28) — mismo lenguaje visual que confidenceBand/Badge, pero
// bandas propias (80/60, no 75/40: docs/ia/crea-score.md). Es una etiqueta,
// nunca un filtro — ningún tema se oculta por score bajo, solo se reordena
// con ?order=score (R2-27).
function scoreBand(s: number | null): { className: string; text: string } {
  if (s == null || Number.isNaN(s)) return { className: '', text: '—' };
  const n = Math.round(Number(s));
  if (n >= 80) return { className: 'high', text: String(n) };
  if (n >= 60) return { className: 'mid', text: String(n) };
  return { className: 'low', text: String(n) };
}

function scoreBadge(s: number | null): string {
  const b = scoreBand(s);
  if (b.text === '—') return `<span class="padmin-t-mute" title="Sin CREA Score calculado todavía">—</span>`;
  const st = statusStyle(b.className === 'high' ? 'high' : b.className === 'mid' ? 'medium' : 'low');
  return `<span title="CREA Score" style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:24px;border-radius:12px;font-size:12px;font-weight:700;background:${st.bg};color:${st.color};">${esc(b.text)}</span>`;
}

function evidenceList(topic: Topic): NonNullable<Topic['evidence']> {
  const e = topic.evidence;
  return Array.isArray(e) ? e : [];
}

const SCOPE_LABEL: Record<string, string> = {
  local: 'Local', regional: 'Regional', estatal: 'Estatal', nacional: 'Nacional', internacional: 'Internacional',
};

// Procedencia de una señal externa (RADAR 2.0, R2-10/R2-15) — null-safe: un
// tema legacy o detectado por los caminos internos (Firecrawl/Perplexity/
// Facebook) no trae `provider`, y esta sección simplemente no se renderiza.
function provenanceBlock(topic: Topic): string {
  if (!topic.provider) return '';
  const eventDate = topic.event_date
    ? new Date(topic.event_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const chips = [
    { label: 'Proveedor', value: topic.provider },
    { label: 'Fecha del hecho', value: eventDate },
    { label: 'Localidad', value: topic.locality },
    { label: 'Alcance', value: topic.territorial_scope ? SCOPE_LABEL[topic.territorial_scope] || topic.territorial_scope : null },
  ].filter((c) => c.value);
  if (!chips.length) return '';
  return `<p class="padmin-drawer-section-title">PROCEDENCIA</p>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
      ${chips.map((c) => `<span class="padmin-t-small" style="background:var(--bg-soft,#f8faf7);border-radius:12px;padding:4px 10px;">${esc(c.label)}: <b style="color:var(--text);">${esc(String(c.value))}</b></span>`).join('')}
    </div>`;
}

function riskFlagText(flag: string | { code?: string; message?: string }): string {
  if (typeof flag === 'string') return flag;
  return flag.message || flag.code || JSON.stringify(flag);
}

// Un solo state.radarPage para las 3 tablas (temas/competencia/fuentes): paginateRows
// clampea por tabla, así que cambiar de tab nunca deja una página inválida.
const radarPager = (page: number, totalPages: number, total: number, hasMore?: boolean) =>
  renderPager(page, totalPages, total, 'set-radar-page', hasMore);

const SCORE_FACTOR_LABEL: Record<string, string> = {
  relevancia_local: 'Relevancia local',
  impacto_potencial: 'Impacto potencial',
  actualidad: 'Actualidad',
  fuentes: 'Número y calidad de fuentes',
  interes_ciudadano: 'Interés ciudadano',
  implicaciones_practicas: 'Implicaciones prácticas',
  conversacion: 'Conversación detectada',
  originalidad: 'Originalidad del tratamiento',
};
const SCORE_BAND_LABEL: Record<string, string> = { high: 'alta', mid: 'media', low: 'baja', '': 'sin calcular' };

// Desglose completo del CREA Score (R2-28) — auditable por un editor sin leer
// código: cada uno de los 8 factores, su peso, y si está presente o ausente
// (nunca inventado). Ordena, nunca decide: esta ficha nunca hace desaparecer
// nada, solo explica el número.
function scoreDetailBlock(topic: Topic): string {
  const breakdown = topic.crea_score_breakdown;
  const band = scoreBand(topic.crea_score);
  const rows = breakdown
    ? Object.entries(breakdown).map(([key, f]) => {
      const label = SCORE_FACTOR_LABEL[key] || key;
      const value = f.present ? `${f.score} / 100` : 'Sin dato (ausente)';
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:0.5px solid var(--line-soft);font-size:12px;">
        <span style="color:${f.present ? 'var(--text-2)' : 'var(--text-mute)'};">${esc(label)} <span style="color:var(--text-mute);">(peso ${f.weight})</span></span>
        <b style="color:${f.present ? 'var(--text)' : 'var(--text-mute)'};">${esc(value)}</b>
      </div>`;
    }).join('')
    : '<p class="padmin-drawer-section-body">Sin CREA Score calculado todavía.</p>';

  return `<div style="margin-top:20px;padding-top:16px;border-top:0.5px solid var(--line-soft);">
    <p class="padmin-drawer-eyebrow">CREA SCORE</p>
    ${topic.crea_score != null ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">${scoreBadge(topic.crea_score)}<span style="font-size:12px;color:var(--text-mute);">Banda ${esc(SCORE_BAND_LABEL[band.className])} — ordena, nunca oculta.</span></div>` : ''}
    ${rows}
  </div>`;
}

const ANALYSIS_LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'Nivel 1 · Señal', 2: 'Nivel 2 · Contexto', 3: 'Nivel 3 · Análisis CREA' };
const ANALYSIS_LEVEL_COST: Record<1 | 2 | 3, string> = { 1: 'Costo bajo', 2: 'Costo bajo-medio', 3: 'Costo alto' };

// Ficha del Motor Editorial CREA (R2-19…R2-21) — objeto DISTINTO de la ficha
// de verificación de arriba: verificación = "es defendible", esto = "qué
// significa". Por eso va en su propio bloque, con su propio eyebrow de color
// distinto, nunca mezclado campo a campo con lo de verificación.
function analysisSection(topic: Topic): string {
  const analyses = state.radarAnalysisByTopic[topic.id];
  const latest: EditorialAnalysis | null = analyses && analyses.length ? analyses[0] : null;
  const busy = state.radarAnalysisBusy;

  const buttons = ([1, 2, 3] as const).map((level) => {
    const isBusy = busy === level;
    return `<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="analyze-topic" data-id="${topic.id}" data-level="${level}" ${busy ? 'disabled' : ''} title="${ANALYSIS_LEVEL_COST[level]}">${isBusy ? 'Generando…' : ANALYSIS_LEVEL_LABEL[level]}</button>`;
  }).join('');
  const costLegend = `<p style="font-size:11px;color:var(--text-mute);margin:6px 0 0;">Costo declarado: Nivel 1 bajo · Nivel 2 bajo-medio · Nivel 3 alto (modelo de razonamiento). Siempre un clic humano — ningún nivel se dispara solo.</p>`;

  if (!latest) {
    return `<div style="margin-top:20px;padding-top:16px;border-top:0.5px solid var(--line-soft);">
      <p class="padmin-drawer-eyebrow" style="color:var(--accent-text);">ANÁLISIS EDITORIAL · MOTOR CREA</p>
      <p class="padmin-drawer-section-body">Sin análisis editorial todavía.</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${buttons}</div>
      ${costLegend}
    </div>`;
  }

  const hechosHtml = latest.que_paso && latest.que_paso.hechos && latest.que_paso.hechos.length
    ? `<ul style="margin:0 0 12px;padding-left:18px;">${latest.que_paso.hechos.map((h) => `<li style="font-size:12px;color:var(--text-2);margin-bottom:2px;">${esc(h)}</li>`).join('')}</ul>`
    : '';
  const datosHtml = latest.datos && latest.datos.length
    ? `<p class="padmin-drawer-section-title">QUÉ DICEN LOS DATOS</p><ul style="margin:0 0 12px;padding-left:18px;">${latest.datos.map((d) => `<li style="font-size:12px;color:var(--text-2);margin-bottom:2px;"><b>${esc(d.label)}:</b> ${esc(d.value)}${d.source ? ` (${esc(d.source)})` : ''}</li>`).join('')}</ul>`
    : '';
  const implicacionesHtml = latest.implicaciones && latest.implicaciones.length
    ? `<p class="padmin-drawer-section-title">IMPLICACIONES</p><ul style="margin:0 0 12px;padding-left:18px;">${latest.implicaciones.map((i) => `<li style="font-size:12px;color:var(--text-2);margin-bottom:2px;">${esc(i)}</li>`).join('')}</ul>`
    : '';

  return `<div style="margin-top:20px;padding-top:16px;border-top:0.5px solid var(--line-soft);">
    <p class="padmin-drawer-eyebrow" style="color:var(--accent-text);">ANÁLISIS EDITORIAL · MOTOR CREA</p>
    ${latest.que_paso && latest.que_paso.resumen ? `<p class="padmin-drawer-section-title">QUÉ PASÓ</p><p class="padmin-drawer-section-body">${esc(latest.que_paso.resumen)}</p>` : ''}
    ${hechosHtml}
    ${latest.por_que_importa ? `<p class="padmin-drawer-section-title">POR QUÉ IMPORTA</p><p class="padmin-drawer-section-body">${esc(latest.por_que_importa)}</p>` : ''}
    ${latest.contexto ? `<p class="padmin-drawer-section-title">CONTEXTO</p><p class="padmin-drawer-section-body">${esc(latest.contexto)}</p>` : ''}
    ${datosHtml}
    ${implicacionesHtml}
    <p class="padmin-drawer-section-title">QUÉ SE ESTÁ DICIENDO</p><p class="padmin-drawer-section-body">${latest.conversacion ? esc(JSON.stringify(latest.conversacion)) : 'Sin datos — pendiente de la investigación de Conversación Digital (punto 13).'}</p>
    ${latest.pendientes ? `<p class="padmin-drawer-section-title">QUÉ NO SABEMOS</p><p class="padmin-drawer-section-body">${esc(latest.pendientes)}</p>` : ''}
    ${latest.para_el_ciudadano ? `<p class="padmin-drawer-section-title">QUÉ NECESITA SABER EL CIUDADANO</p><p class="padmin-drawer-section-body">${esc(latest.para_el_ciudadano)}</p>` : ''}
    ${latest.relevancia_perote ? `<p class="padmin-drawer-section-title">RELEVANCIA PARA PEROTE</p><p class="padmin-drawer-section-body">${esc(latest.relevancia_perote)}</p>` : ''}
    <p style="font-size:11px;color:var(--text-mute);margin:0 0 10px;">${esc(ANALYSIS_LEVEL_LABEL[latest.analysis_level])} · ${esc(latest.model || '—')} · ${esc(relativeTime(latest.created_at))}${analyses && analyses.length > 1 ? ` · ${analyses.length} análisis en el historial` : ''}</p>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">${buttons}</div>
    ${costLegend}
  </div>`;
}

function renderRadarDetail(): string {
  if (state.selectedRadarId == null) return '';
  const topics = state.data.topics || [];
  const topic = topics.filter((r: Topic) => r.id === state.selectedRadarId)[0];
  if (!topic) return '';

  const conf = topic.confidence != null ? `${Math.round(Number(topic.confidence))} / 100 de confianza` : 'Sin score de confianza';
  const evidence = evidenceList(topic);
  const flags = Array.isArray(topic.risk_flags) ? topic.risk_flags : [];
  const sourceCount = topic.source_count != null ? topic.source_count : evidence.length || null;

  const evidenceHtml = evidence.length
    ? evidence.map((ev) => {
      const label = esc(ev.label || 'Fuente');
      const meta = [ev.kind, ev.url].filter(Boolean).map(String).join(' · ');
      const tags = [
        ev.supports ? badge('sin_evaluar', String(ev.supports)) : '',
        ev.reliable === true ? badge('verified', 'Confiable') : '',
        ev.reliable === false ? badge('risk', 'Débil') : '',
      ].join(' ');
      const safeUrl = safeHttpUrl(ev.url);
      return `<div style="border:0.5px solid var(--line-soft);border-radius:6px;padding:10px;margin:6px 0;background:var(--bg-admin);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
          <b style="font-size:12px;color:var(--text);">${label}</b>
          ${safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--brand);text-decoration:none;display:inline-flex;align-items:center;gap:2px;">${icon('externalLink', { size: 10 })} Ver enlace</a>` : ''}
        </div>
        ${meta ? `<small style="display:block;color:var(--text-mute);margin:3px 0 6px;font-size:11px;">${esc(meta)}</small>` : ''}
        ${tags}
      </div>`;
    }).join('')
    : '<p class="padmin-drawer-section-body">Sin evidencia registrada (topics detectados antes de la ficha de verificación).</p>';

  const flagsHtml = flags.length
    ? flags.map((f) =>
      `<div style="display:flex;gap:8px;align-items:center;border-left:3px solid var(--accent);background:var(--accent-soft);padding:8px 10px;font-size:12px;color:var(--accent-text);margin:6px 0;border-radius:0 4px 4px 0;">${icon('alert', { size: 13, style: 'flex-shrink:0;' })} ${esc(riskFlagText(f))}</div>`
    ).join('')
    : (topic.verification_status
      ? '<p class="padmin-drawer-section-body" style="color:var(--brand);display:flex;align-items:center;gap:4px;">' + icon('check', { size: 13 }) + ' Sin señales de riesgo registradas.</p>'
      : '<p class="padmin-drawer-section-body">Sin evaluar.</p>');

  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-radar"></div>
    <div class="padmin-drawer" role="dialog" aria-modal="true" aria-label="Ficha de verificación: ${esc(topic.title)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
        <p class="padmin-drawer-eyebrow">FICHA DE VERIFICACIÓN · RADAR</p>
        <button type="button" class="padmin-drawer-close" data-action="close-radar">&times;</button>
      </div>
      <h2 style="font-size:16px;font-weight:600;color:var(--text);margin:0 0 12px;line-height:1.35;">${esc(topic.title)}</h2>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center;">
        ${verificationBadge(topic.verification_status)}
        <span class="padmin-t-small">${esc(conf)}</span>
        <span class="padmin-t-small">Workflow: <b style="color:var(--text);">${esc(topic.status)}</b></span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;">
        <div style="padding:10px;background:var(--bg-soft,#f8faf7);border-radius:6px;"><span style="display:block;font-size:10px;color:var(--text-mute);text-transform:uppercase;">Evidencia</span><b style="display:block;margin-top:4px;font-size:14px;">${sourceCount != null ? esc(String(sourceCount)) + ' fuente(s)' : '—'}</b></div>
        <div style="padding:10px;background:var(--bg-soft,#f8faf7);border-radius:6px;"><span style="display:block;font-size:10px;color:var(--text-mute);text-transform:uppercase;">Interés</span><b style="display:block;margin-top:4px;font-size:14px;">${topic.mentions}</b></div>
        <div style="padding:10px;background:var(--bg-soft,#f8faf7);border-radius:6px;"><span style="display:block;font-size:10px;color:var(--text-mute);text-transform:uppercase;">Fuente canal</span><b style="display:block;margin-top:4px;font-size:14px;">${esc(topic.source || '—')}</b></div>
        <div style="padding:10px;background:var(--bg-soft,#f8faf7);border-radius:6px;"><span style="display:block;font-size:10px;color:var(--text-mute);text-transform:uppercase;">Confianza</span><b style="display:block;margin-top:4px;font-size:14px;">${topic.confidence != null ? esc(String(Math.round(Number(topic.confidence)))) : '—'}</b></div>
      </div>
      ${provenanceBlock(topic)}
      ${topic.known_facts ? `<p class="padmin-drawer-section-title">QUÉ SE SABE</p><p class="padmin-drawer-section-body">${esc(topic.known_facts)}</p>` : ''}
      ${topic.unknown_facts ? `<p class="padmin-drawer-section-title">QUÉ NO SE SABE</p><p class="padmin-drawer-section-body">${esc(topic.unknown_facts)}</p>` : ''}
      <p class="padmin-drawer-section-title">EVIDENCIA Y FUENTES</p>${evidenceHtml}
      <p class="padmin-drawer-section-title">SEÑALES DE RIESGO</p>${flagsHtml}
      ${topic.editorial_decision ? `<p class="padmin-drawer-section-title">DECISIÓN EDITORIAL</p><p class="padmin-drawer-section-body">${esc(topic.editorial_decision)}</p>` : ''}
      <p class="padmin-drawer-section-title">ANTECEDENTES</p><p class="padmin-drawer-section-body">${esc(topic.antecedentes || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">ACTORES INVOLUCRADOS</p><p class="padmin-drawer-section-body">${esc(topic.actores || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">ÁNGULOS DE COBERTURA SUGERIDOS</p><p class="padmin-drawer-section-body">${esc(topic.angulos || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">POTENCIAL DE AUDIENCIA</p><p class="padmin-drawer-section-body" style="margin-bottom:0;">${esc(topic.audiencia || 'Sin datos.')}</p>
      ${scoreDetailBlock(topic)}
      ${canManageRadar() ? analysisSection(topic) : ''}
      ${canManageRadar() ?
        `<div style="margin-top:20px;padding-top:16px;border-top:0.5px solid var(--line-soft);display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${topic.verification_status === 'risk' ? '<p style="width:100%;margin:0 0 8px;font-size:12px;color:var(--danger);">Riesgo alto: generar propuesta requiere confirmación explícita (force).</p>' : ''}
          ${(topic.verification_status === 'checking' || topic.verification_status === 'signal') ? `<p style="width:100%;margin:0 0 8px;font-size:12px;color:var(--accent-text);">${topic.verification_status === 'checking' ? 'En verificación: se puede generar, pero conviene corroborar.' : 'Solo señal: la propuesta puede necesitar más research.'}</p>` : ''}
          <div class="padmin-field" style="width:100%;margin:0 0 8px;">
            <label class="padmin-t-small">Directriz editorial (opcional)</label>
            <textarea id="proposal-directive-${topic.id}" placeholder="Ej: tono crítico, incluir versión ciudadana. Vacío = default de Configuración → Perfil." style="min-height:50px;font-size:12px;width:100%;box-sizing:border-box;"></textarea>
          </div>
          <select id="proposal-format-${topic.id}" style="font-size:12px;border:0.5px solid var(--line-soft);border-radius:6px;padding:6px 8px;background:#fff;">
            ${['nota', 'post', 'guion_audio', 'guion_video'].map((f) => `<option value="${f}">${f}</option>`).join('')}
          </select>
          <button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-proposal-from-topic" data-id="${topic.id}" data-force-risk="${topic.verification_status === 'risk' ? '1' : '0'}" ${state.generatingProposal ? 'disabled' : ''}>
            ${state.generatingProposal ? 'Generando…' : (topic.verification_status === 'risk' ? `${icon('alert', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Forzar propuesta IA` : `${icon('sparkles', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Generar propuesta IA`)}
          </button>
          ${topic.status !== 'Revisado' ? `<button type="button" class="padmin-btn-sm" style="background:var(--brand-soft);color:var(--brand);" data-action="approve-topic" data-id="${topic.id}">${icon('check', { size: 12, style: 'vertical-align:-1px;margin-right:3px;' })} Aprobar</button>` : ''}
          <button type="button" class="padmin-btn-sm padmin-btn-danger" style="margin-left:auto;" data-action="delete-topic" data-id="${topic.id}">${icon('trash', { size: 12, style: 'vertical-align:-1px;margin-right:3px;' })} Eliminar</button>
        </div>` : ''}
    </div>
  </div>`;
}

// Descarte de tema(s) con motivo obligatorio (R2-07/R2-08) — reemplaza el
// confirm() nativo que no podía pedir un motivo. Mismo patrón de overlay que
// renderRadarDetail()/renderComentarioModal(): Escape y foco los maneja
// main.ts solo con la clase .padmin-overlay, sin registrar nada aparte.
function renderDiscardTopicsModal(): string {
  const ids = state.discardTopicIds;
  if (!ids || !ids.length) return '';
  const topics = state.data.topics || [];
  const titles = ids.map((id) => topics.find((t: Topic) => t.id === id)?.title).filter(Boolean) as string[];
  const label = ids.length === 1
    ? (titles[0] || 'este tema')
    : `${ids.length} temas seleccionados`;
  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-discard-topics"></div>
    <div class="padmin-modal" role="dialog" aria-modal="true" aria-label="Descartar tema de RADAR">
      <p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">Descartar ${ids.length === 1 ? 'tema' : 'temas'}</p>
      <p style="font-size:12px;color:var(--text-mute);margin:0 0 16px;">${esc(label)}. No se puede deshacer.</p>
      <label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:6px;">Motivo del descarte</label>
      <select id="discard-reason-code" style="width:100%;border:0.5px solid var(--line-soft);border-radius:6px;background:var(--bg-admin);margin-bottom:16px;padding:8px;font:inherit;font-size:12px;box-sizing:border-box;">${reasonSelectOptions()}</select>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button type="button" class="padmin-btn-outline" data-action="close-discard-topics">Cancelar</button>
        <button type="button" class="padmin-btn padmin-btn-danger" data-action="confirm-discard-topics">Confirmar descarte</button>
      </div>
    </div>
  </div>`;
}

export function renderRadar(): string {
  const tabs = '<div class="padmin-tabs" role="group" aria-label="Vistas de RADAR">' + [
    { id: 'temas', label: 'Temas', iconName: 'newspaper' as const },
    { id: 'manual', label: 'Radar manual', iconName: 'sparkles' as const },
    { id: 'competencia', label: 'Competencia', iconName: 'users' as const },
    { id: 'fuentes', label: 'Fuentes', iconName: 'externalLink' as const },
  ].map((t) =>
    `<button type="button" class="padmin-tab${state.radarTab === t.id ? ' active' : ''}"${state.radarTab === t.id ? ' aria-current="true"' : ''} data-action="set-radar-tab" data-tab="${t.id}">${icon(t.iconName, { size: 13, style: 'vertical-align:-2px;margin-right:4px;' })}${t.label}</button>`
  ).join('') + '</div>';
  const body = state.radarTab === 'manual'
    ? renderRadarManual()
    : state.radarTab === 'competencia'
      ? renderRadarCompetencia()
      : state.radarTab === 'fuentes'
        ? renderRadarFuentes()
        : renderRadarTemas();
  return `<div>
    <h1 class="padmin-h1">RADAR &middot; Social listening</h1>
    <p class="padmin-lede">Señales detectadas y evaluadas. Solo los temas verificables deberían pasar al flujo editorial.</p>
    ${tabs}
    ${body}
  </div>`;
}

function renderRadarManual(): string {
  const canManage = canManageRadar();
  const zones = [
    { id: 'Perote, Veracruz', label: 'Perote (Municipio y Cabecera)' },
    { id: 'Villa Aldama, Veracruz', label: 'Villa Aldama' },
    { id: 'Altotonga, Veracruz', label: 'Altotonga' },
    { id: 'Las Vigas de Ramírez, Veracruz', label: 'Las Vigas de Ramírez' },
    { id: 'Región Cofre de Perote, Veracruz', label: 'Región Cofre de Perote (General)' },
    { id: 'Xalapa y Estado de Veracruz', label: 'Xalapa / Nivel Estatal Veracruz' },
  ];

  const categories = [
    { id: 'general', label: 'General / Todo ámbito' },
    { id: 'seguridad', label: 'Seguridad y Protección Civil' },
    { id: 'politica', label: 'Política local y Gobierno' },
    { id: 'cultura', label: 'Cultura, Eventos y Festivales' },
    { id: 'clima', label: 'Clima y Medio Ambiente' },
    { id: 'economia', label: 'Comercio, Agricultura y Economía' },
  ];

  const timeframes = [
    { id: '24h', label: 'Últimas 24 horas' },
    { id: '3d', label: 'Últimos 3 días' },
    { id: '7d', label: 'Última semana (7 días)' },
  ];

  const result = state.radarManualResult;
  const foundTopics = result && Array.isArray(result.topics) ? result.topics : [];

  return `<div>
    <!-- Tarjeta explicativa de Rate Limit y Costo -->
    <div class="padmin-card padmin-radar-block" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;">
      <div>
        <span class="padmin-radar-calibration-label">MOTOR DE BÚSQUEDA</span>
        <p style="font-size:13px;font-weight:600;color:var(--text);margin:4px 0 2px;">Perplexity Sonar Pro</p>
        <p style="font-size:11px;color:var(--text-mute);margin:0;">Búsqueda profunda en web viva con citación de fuentes.</p>
      </div>
      <div>
        <span class="padmin-radar-calibration-label">LÍMITE DE TASA (RATE LIMIT)</span>
        <p style="font-size:13px;font-weight:600;color:var(--brand);margin:4px 0 2px;">Máx 10 consultas / 10 min</p>
        <p style="font-size:11px;color:var(--text-mute);margin:0;">Protección contra sobreuso o llamadas accidentales.</p>
      </div>
      <div>
        <span class="padmin-radar-calibration-label">COSTO ESTIMADO</span>
        <p style="font-size:13px;font-weight:600;color:var(--text);margin:4px 0 2px;">~$0.005 USD / consulta</p>
        <p style="font-size:11px;color:var(--text-mute);margin:0;">Aprox. $0.10 MXN por escaneo completo.</p>
      </div>
    </div>

    <!-- Layout de dos columnas: formulario a la izquierda y resultados inmediatos a la derecha -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:18px;align-items:start;">
      <!-- Columna Izquierda: Formulario y Presets -->
      <div>
        <div class="padmin-card" style="padding:20px;margin-bottom:16px;">
          <p class="padmin-section-title" style="margin-bottom:6px;">Parámetros de escaneo manual</p>
          <p class="padmin-t-hint" style="margin-bottom:18px;">Configura los filtros temáticos y geográficos para que el agente rastree temas específicos con scoring de verificación.</p>

          <form data-action="run-radar-manual">
            <div class="padmin-field" style="margin-bottom:14px;">
              <label style="font-weight:600;">Tema o palabra clave específica <span style="color:var(--danger);">* (Requerido)</span></label>
              <input id="rm-topic" type="text" required placeholder="Ej. corte de agua, obras en libramiento, festival de la nieve, hospital civil…" style="width:100%;box-sizing:border-box;">
              <p class="padmin-row-meta" style="margin:4px 0 0;">Ingresa el término o suceso que deseas que el agente investigue en la web.</p>
            </div>

            <div class="padmin-editor-grid2" style="gap:14px;margin-bottom:14px;">
              <div class="padmin-field" style="margin:0;">
                <label>Zona o Cobertura</label>
                <select id="rm-zone" style="width:100%;box-sizing:border-box;">
                  ${zones.map((z) => `<option value="${esc(z.id)}"${z.id === 'Perote, Veracruz' ? ' selected' : ''}>${esc(z.label)}</option>`).join('')}
                </select>
              </div>

              <div class="padmin-field" style="margin:0;">
                <label>Categoría</label>
                <select id="rm-category" style="width:100%;box-sizing:border-box;">
                  ${categories.map((c) => `<option value="${esc(c.id)}"${c.id === 'general' ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="padmin-editor-grid2" style="gap:14px;margin-bottom:18px;">
              <div class="padmin-field" style="margin:0;">
                <label>Ventana de tiempo</label>
                <select id="rm-timeframe" style="width:100%;box-sizing:border-box;">
                  ${timeframes.map((tf) => `<option value="${esc(tf.id)}"${tf.id === '24h' ? ' selected' : ''}>${esc(tf.label)}</option>`).join('')}
                </select>
              </div>

              <div class="padmin-field" style="margin:0;">
                <label>Fuentes específicas (opcional)</label>
                <input id="rm-sources" type="text" placeholder="Ej. Al Calor Político, RTV…" style="width:100%;box-sizing:border-box;">
              </div>
            </div>

            ${state.errorMsg ? `<div style="padding:10px 14px;background:var(--danger-soft);border:0.5px solid var(--danger);border-radius:6px;margin-bottom:14px;"><p style="font-size:12px;color:var(--danger);margin:0;">${esc(state.errorMsg)}</p></div>` : ''}

            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <button type="button" class="padmin-btn padmin-btn-brand" data-action="run-radar-manual" ${state.radarBusy || !canManage ? 'disabled' : ''}>
                ${state.radarBusy ? 'Escaneando con IA en vivo…' : `${icon('sparkles', { size: 14, style: 'vertical-align:-2px;margin-right:4px;' })} Ejecutar escaneo en vivo`}
              </button>
            </div>
          </form>
        </div>

        <!-- Presets de búsqueda rápida -->
        <div class="padmin-card" style="padding:16px 20px;">
          <p class="padmin-section-title" style="margin-bottom:10px;">Plantillas de búsqueda rápida</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="padmin-chip" data-action="apply-radar-preset" data-topic="servicios publicos agua luz basura" data-category="seguridad">💧 Servicios y Agua</button>
            <button type="button" class="padmin-chip" data-action="apply-radar-preset" data-topic="seguridad policia accidentes proteccion civil" data-category="seguridad">🚨 Seguridad y Vialidad</button>
            <button type="button" class="padmin-chip" data-action="apply-radar-preset" data-topic="cabildo ayuntamiento presidente municipal obras" data-category="politica">🏛 Gobierno y Obras</button>
            <button type="button" class="padmin-chip" data-action="apply-radar-preset" data-topic="turismo eventos culturales feria" data-category="cultura">🎭 Cultura y Turismo</button>
            <button type="button" class="padmin-chip" data-action="apply-radar-preset" data-topic="frio heladas frente frio cofre de perote" data-category="clima">❄️ Clima y Cofre</button>
          </div>
        </div>
      </div>

      <!-- Columna Derecha: Resultados Inmediatos del Escaneo -->
      <div>
        <div class="padmin-card" style="padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <p class="padmin-section-title" style="margin:0;">Resultados del escaneo</p>
            ${result ? `<span class="padmin-badge" style="background:var(--brand-soft);color:var(--brand);">${result.detected} nuevos detectados</span>` : ''}
          </div>

          ${state.radarBusy ? `
            <div style="padding:32px 16px;text-align:center;">
              <p style="font-size:14px;color:var(--text);font-weight:500;margin-bottom:6px;">Consultando Perplexity Sonar Pro…</p>
              <p style="font-size:12px;color:var(--text-mute);margin:0;">Rastreando publicaciones recientes, validando hechos y calculando score de confianza.</p>
            </div>
          ` : (foundTopics.length ? `
            <div style="display:flex;flex-direction:column;gap:12px;">
              ${foundTopics.map((t: Topic) => {
                const sub = t.known_facts ? esc(t.known_facts.slice(0, 110)) + (t.known_facts.length > 110 ? '…' : '') : '';
                return `<div style="border:0.5px solid var(--line-soft);border-radius:8px;padding:14px;background:var(--bg-admin);">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
                    <p style="font-size:13px;font-weight:600;color:var(--text);margin:0;line-height:1.35;">${esc(t.title)}</p>
                    ${confidenceBadge(t.confidence)}
                  </div>
                  ${sub ? `<p style="font-size:11px;color:var(--text-2);margin:0 0 8px;line-height:1.4;">${sub}</p>` : ''}
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;padding-top:8px;border-top:0.5px solid var(--line-soft);">
                    <div style="display:flex;align-items:center;gap:6px;">
                      ${verificationBadge(t.verification_status)}
                      <span style="font-size:11px;color:var(--text-mute);">${esc(t.source || 'Perplexity')}</span>
                    </div>
                    <div style="display:flex;gap:4px;">
                      <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="open-radar" data-id="${t.id}" title="Ver ficha completa de evidencias">${icon('eye', { size: 11, style: 'vertical-align:-1px;margin-right:2px;' })} Ficha</button>
                      ${canManage ? `
                        <button type="button" class="padmin-btn-sm" style="background:var(--brand-soft);color:var(--brand);" data-action="approve-topic" data-id="${t.id}" ${t.status === 'Revisado' ? 'disabled' : ''}>${icon('check', { size: 11, style: 'vertical-align:-1px;margin-right:2px;' })} Aprobar</button>
                        <button type="button" class="padmin-btn-sm padmin-btn-brand" data-action="generate-proposal-from-topic" data-id="${t.id}" data-force-risk="${t.verification_status === 'risk' ? '1' : '0'}" ${state.generatingProposal ? 'disabled' : ''}>${icon('sparkles', { size: 11, style: 'vertical-align:-1px;margin-right:2px;' })} Propuesta IA</button>
                      ` : ''}
                    </div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          ` : (result ? `
            <div style="padding:24px 16px;text-align:center;border:1px dashed var(--line-soft);border-radius:8px;">
              <p style="font-size:13px;color:var(--text);font-weight:500;margin-bottom:4px;">Sin temas nuevos detectados</p>
              <p style="font-size:11px;color:var(--text-mute);margin:0;">Los temas encontrados en la consulta ya estaban registrados previamente en la base de datos.</p>
            </div>
          ` : `
            <div style="padding:32px 16px;text-align:center;border:1px dashed var(--line-soft);border-radius:8px;">
              <p style="font-size:13px;color:var(--text-mute);margin:0 0 6px;">Aún no has ejecutado una búsqueda manual.</p>
              <p style="font-size:11px;color:var(--mute-2);margin:0;">Ingresa un tema en el formulario de la izquierda o haz clic en un preset para buscar en tiempo real.</p>
            </div>
          `))}
        </div>
      </div>
    </div>
  </div>`;
}

function trustBadge(trust: string): string {
  return badge(trust);
}

// Salud de una fuente (radar_sources.status / competitor_facebook_accounts.access_status,
// fase 09, R2-54/R2-55). Un vistazo: badge de estado + hace cuánto fue el último corte +
// el error, si lo hay, como texto de ayuda (sin inventar un vocabulario nuevo — ver
// docs/implementaciones/radar2/09-catalogo-fuentes-salud.md "Qué NO hacer").
function sourceHealthCell(status: string | null, lastAt: string | null, lastError: string | null): string {
  if (!status && !lastAt) return '<span class="padmin-t-small">Sin escanear</span>';
  return `<span style="display:flex;flex-direction:column;gap:2px;">
    ${badge(status || 'sin_evaluar')}
    <span class="padmin-t-small">${lastAt ? esc(relativeTime(lastAt)) : 'nunca'}</span>
    ${lastError ? `<span class="padmin-t-small" style="color:var(--danger);" title="${esc(lastError)}">${esc(lastError.slice(0, 40))}${lastError.length > 40 ? '…' : ''}</span>` : ''}
  </span>`;
}

function renderRadarFuentes(): string {
  const sources = state.data.radarSources;
  if (!sources) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const canManage = canManageRadar();
  const activeCount = sources.filter((s) => s.active).length;
  const highTrustCount = sources.filter((s) => s.trust === 'high').length;
  const { pageItems, page, totalPages } = paginateRows(sources, state.radarPage);
  return `<div>
    <!-- Barra de resumen métrico de fuentes -->
    <div class="padmin-pipeline-metrics-bar" style="margin-bottom:16px;">
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">TOTAL FUENTES</span>
        <span class="padmin-pipeline-metric-value">${sources.length}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">ACTIVAS / MONITOREADAS</span>
        <span class="padmin-pipeline-metric-value" style="color:var(--brand);">${activeCount}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">ALTA CONFIANZA</span>
        <span class="padmin-pipeline-metric-value" style="color:var(--text);">${highTrustCount}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">CRITERIO EDITORIAL</span>
        <span class="padmin-pipeline-metric-value" style="font-size:12px;font-weight:400;color:var(--text-mute);">Evidence con host alta sube confianza; baja penaliza.</span>
      </div>
    </div>

    <div class="padmin-card">
      <div class="padmin-table-head padmin-cols-fuentes">
        <span>DOMINIO</span><span>ETIQUETA</span><span>TRUST</span><span>ESTADO</span><span>SALUD</span><span>NOTAS</span><span>ACCIONES</span>
      </div>
      ${sources.length ? pageItems.map((s: RadarSource) => `
        <div class="padmin-table-row padmin-radar-row padmin-cols-fuentes">
          <span style="font-size:13px;font-weight:600;color:var(--text);">${esc(s.domain)}</span>
          <span style="font-size:12px;color:var(--text);">${esc(s.label)}</span>
          <span>${trustBadge(s.trust)}</span>
          ${badge(s.active ? 'activo' : 'inactivo', s.active ? 'Activa' : 'Off')}
          <span>${sourceHealthCell(s.status, s.last_crawl_at, s.last_error)}</span>
          <span class="padmin-t-small">${esc(s.notes || '—')}</span>
          <span>${canManage
            ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-radar-source" data-id="${s.id}" data-active="${s.active ? 'true' : 'false'}">${s.active ? 'Desactivar' : 'Activar'}</button>`
            : '—'}</span>
        </div>`).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin fuentes. Corré la migración 035 o agregá dominios vía API.</p></div>'}
    </div>
    ${radarPager(page, totalPages, sources.length)}
  </div>`;
}

function renderRadarCompetencia(): string {
  const posts = state.data.competitors;
  if (!posts) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const canManage = state.user!.role === 'director' || state.user!.role === 'produccion';
  const sortMode = state.radarCompetitorSort || 'fecha';

  const sortedPosts = posts.slice().sort((a: CompetitorPost, b: CompetitorPost) => {
    if (sortMode === 'engagement') {
      const interA = (a.reactions || 0) + (a.comments || 0) + (a.shares || 0);
      const interB = (b.reactions || 0) + (b.comments || 0) + (b.shares || 0);
      return interB - interA;
    }
    const timeA = a.post_date ? new Date(a.post_date).getTime() : (a.scraped_at ? new Date(a.scraped_at).getTime() : 0);
    const timeB = b.post_date ? new Date(b.post_date).getTime() : (b.scraped_at ? new Date(b.scraped_at).getTime() : 0);
    return timeB - timeA;
  });

  const { pageItems, page, totalPages } = paginateRows(sortedPosts, state.radarPage);

  return `<div>
    <div class="padmin-card padmin-pipeline-action-bar" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:11px;font-weight:600;color:var(--text-mute);">ORDENAR POR:</span>
        <button type="button" class="padmin-chip${sortMode === 'fecha' ? ' active' : ''}" data-action="set-radar-competitor-sort" data-value="fecha">Más recientes</button>
        <button type="button" class="padmin-chip${sortMode === 'engagement' ? ' active' : ''}" data-action="set-radar-competitor-sort" data-value="engagement">Mayor interacción</button>
      </div>
      ${canManage ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="padmin-btn padmin-btn-sm padmin-btn-outline" data-action="detect-competitors-fb" ${state.competitorsBusy ? 'disabled' : ''}>${state.competitorsBusy ? 'Escaneando…' : `${icon('facebook', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Escanear Facebook`}</button>
        <button type="button" class="padmin-btn padmin-btn-sm padmin-btn-outline" data-action="detect-competitors" ${state.competitorsBusy ? 'disabled' : ''}>${state.competitorsBusy ? 'Explorando…' : `${icon('search', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Explorar Perplexity`}</button>
        ${posts.length ? `<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-danger" data-action="clear-competitors">${icon('trash', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Limpiar todo</button>` : ''}
      </div>` : ''}
    </div>

    <div class="padmin-card">
      <div class="padmin-table-head padmin-cols-competencia"><span>CUENTA</span><span>PUBLICACIÓN</span><span>FECHA</span><span>INTERACCIONES</span><span>ESTADO</span><span>ACCIONES</span></div>
      ${sortedPosts.length ? pageItems.map((p: CompetitorPost) => {
        const inter = (p.reactions || 0) + (p.comments || 0) + (p.shares || 0);
        const text = String(p.post_text || '—');
        const safeUrl = safeHttpUrl(p.post_url);
        return `<div class="padmin-table-row padmin-radar-row padmin-cols-competencia">
          <div style="min-width:0;"><p class="padmin-row-title">${esc(p.source_account || '—')}</p><p class="padmin-row-meta" style="text-transform:uppercase;">${esc(p.source_platform || '')}</p></div>
          <div style="min-width:0;"><span class="padmin-radar-post-text" title="${esc(text)}">${esc(text.slice(0, 160))}${text.length > 160 ? '…' : ''}</span>
            ${safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--brand);text-decoration:none;margin-top:2px;">${icon('externalLink', { size: 10 })} Ver post original</a>` : ''}</div>
          <span class="padmin-t-small">${p.post_date ? new Date(p.post_date).toLocaleDateString('es-MX') : '—'}</span>
          <span style="font-size:12px;font-weight:600;color:var(--text);">${inter}</span>
          <span>${badge(p.analyzed ? 'analizado' : 'nuevo')}</span>
          <span style="display:flex;gap:4px;flex-wrap:wrap;">
            ${canManage ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" title="Crear idea en la bandeja a partir de esta publicación" data-action="competitor-to-idea" data-id="${p.id}">${icon('arrowRight', { size: 10, style: 'vertical-align:-1px;' })} Idea</button>` : ''}
            ${canManage && !p.analyzed ? `<button type="button" class="padmin-icon-btn" title="Marcar analizado" aria-label="Marcar publicación como analizada" data-action="analyze-competitor" data-id="${p.id}">${icon('check', { size: 12 })}</button>` : ''}
            ${canManage ? `<button type="button" class="padmin-icon-btn" title="Eliminar" aria-label="Eliminar publicación de competencia" data-action="delete-competitor" data-id="${p.id}">${icon('trash', { size: 12 })}</button>` : ''}
          </span>
        </div>`;
      }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin publicaciones de competencia. Usa "Explorar" o "Escanear Facebook" para comenzar.</p></div>'}
    </div>
    ${radarPager(page, totalPages, sortedPosts.length)}
  </div>`;
}

// Síntesis operativa del día (R2-29) — una línea con números reales, no
// simulados. Explícitamente no reemplaza las tarjetas de renderSummary(): es
// un resumen editorial del corte del día, ellas son el estado actual de la
// agenda completa.
function renderTodaySynthesis(): string {
  const t = state.data.topicSummary && state.data.topicSummary.today;
  if (!t) return '';
  const parts = [
    `${t.since_last_cutoff} señal(es) desde el último corte`,
    `${t.discarded} descartada(s) hoy`,
    `${t.signals} señal(es)`,
    `${t.to_contextualize} por contextualizar`,
    `${t.crea_analyses} análisis CREA hoy`,
  ];
  return `<p style="font-size:12px;color:var(--text-mute);margin:0 0 12px;">${esc(parts.join(' · '))}</p>`;
}

function renderSummary(): string {
  const summary = state.data.topicSummary;
  const n = (key: string): number | string => (summary ? (summary.by_verification[key] || 0) : '—');
  const card = (label: string, count: number | string, hint: string, tone: string) =>
    `<div style="background:var(--surface);border:0.5px solid var(--line-soft);border-radius:7px;padding:12px 14px;">
      <span style="font-size:10px;color:var(--text-mute);text-transform:uppercase;letter-spacing:0.04em;">${esc(label)}</span>
      <b style="display:block;font-size:22px;margin-top:4px;color:${tone};">${count}</b>
      <p style="margin:4px 0 0;font-size:11px;color:var(--text-mute);">${esc(hint)}</p>
    </div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:0 0 16px;">
    ${card('Verificados', n('verified'), 'Listos para propuesta', 'var(--brand)')}
    ${card('En verificación', n('checking'), 'Requieren evidencia', 'var(--accent-text)')}
    ${card('Riesgo alto', n('risk'), 'Rumor o fuente débil', 'var(--danger)')}
    ${card('Sin evaluar', n('none'), 'Legacy o pre-scoring', 'var(--text)')}
  </div>`;
}

function renderCalibration(stats: RadarStats | null): string {
  if (!stats) {
    if (state.radarStatsError) {
      return `<div class="padmin-radar-block" style="color:var(--danger);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span>Calibración: ${esc(state.radarStatsError)}</span>
        <button type="button" class="padmin-chip" data-action="retry-radar-stats">Reintentar</button>
      </div>`;
    }
    return `<div class="padmin-radar-block" style="color:var(--text-mute);">Calibración: cargando stats…</div>`;
  }
  const days = state.radarStatsDays || stats.days;
  const bs = stats.topics.by_status || {};
  const pill = (key: string, label: string, tone: string) => {
    const row = bs[key];
    const st = statusStyle(tone);
    const count = row ? row.count : 0;
    const detail = row ? `${row.pct}%${row.avg_confidence != null ? ` · conf ${row.avg_confidence}` : ''}` : '';
    return `<span class="padmin-radar-pill" style="background:${st.bg};color:${st.color};">${esc(label)} ${count}${detail ? `<span>(${esc(detail)})</span>` : ''}</span>`;
  };
  const dayChip = (d: number) =>
    `<button type="button" class="padmin-chip${days === d ? ' active' : ''}" aria-pressed="${days === d}" aria-label="Ventana de ${d} días" data-action="set-radar-stats-days" data-value="${d}">${d}d</button>`;
  const hints = (stats.hints || []).map((h) =>
    `<li style="margin:4px 0;font-size:12px;color:var(--text-2);">${esc(h)}</li>`
  ).join('');
  return `<div class="padmin-radar-block">
    <div class="padmin-radar-calibration-head">
      <span class="padmin-radar-calibration-label">Calibración</span>
      ${dayChip(7)}${dayChip(30)}
      <span style="font-size:11px;color:var(--text-mute);margin-left:auto;">ventana ${stats.days}d · ${stats.topics.total} topics</span>
    </div>
    <div class="padmin-radar-calibration-pills">
      ${pill('verified', 'Verified', 'verified')}${pill('checking', 'Checking', 'checking')}${pill('signal', 'Signal', 'signal')}${pill('risk', 'Risk', 'risk')}
      ${bs.unevaluated ? pill('unevaluated', 'Sin evaluar', 'sin_evaluar') : ''}
    </div>
    <p class="padmin-radar-calibration-meta">
      Propuestas: ${stats.proposals.generated} ok · gate risk bloqueó ${stats.proposals.blocked_risk} · forced risk ${stats.proposals.forced_from_risk}
      · Detect: ${stats.detection.runs} corridas, +${stats.detection.inserted} insert / ${stats.detection.upgraded} upgrade / ${stats.detection.skipped_similar} skip similar
      · Fuentes activas: ${stats.sources.active}
    </p>
    ${hints ? `<ul style="margin:8px 0 0;padding-left:18px;">${hints}</ul>` : ''}
  </div>`;
}

function classifySourceGroup(src: string): 'redes' | 'medios' | 'institucional' | 'otros' {
  const s = src.toLowerCase();
  if (s.includes('facebook') || s.includes('twitter') || s.includes('tiktok') || s.includes('instagram') || s.includes('x.com')) return 'redes';
  if (s.includes('diario') || s.includes('noticias') || s.includes('periodico') || s.includes('calor') || s.includes('rtv') || s.includes('jornada') || s.includes('universal') || s.includes('milenio') || s.includes('dictamen') || s.includes('avc')) return 'medios';
  if (s.includes('gob') || s.includes('ayuntamiento') || s.includes('proteccion') || s.includes('policia') || s.includes('salud') || s.includes('dif')) return 'institucional';
  return 'otros';
}

function renderRadarTemas(): string {
  const topics = state.data.topics;
  if (!topics) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();

  const search = (state.radarSearch || '').trim().toLowerCase();
  const confFilter = state.radarConfidenceFilter || 'todos';
  const selectedIds = state.radarSelectedTopicIds || [];
  const canManage = canManageRadar();

  // Filtrado en cliente sobre los tópicos cargados
  const filteredTopics = topics.filter((t: Topic) => {
    if (search) {
      const matchTitle = (t.title || '').toLowerCase().includes(search);
      const matchFacts = (t.known_facts || '').toLowerCase().includes(search);
      const matchSource = (t.source || '').toLowerCase().includes(search);
      if (!matchTitle && !matchFacts && !matchSource) return false;
    }
    if (confFilter !== 'todos') {
      const score = t.confidence != null ? Number(t.confidence) : null;
      if (confFilter === 'alta' && (score == null || score < 75)) return false;
      if (confFilter === 'media' && (score == null || score < 40 || score >= 75)) return false;
      if (confFilter === 'baja' && (score == null || score >= 40)) return false;
    }
    return true;
  });

  // Sources dinámicos del summary
  const known = state.data.topicSummary
    ? state.data.topicSummary.sources.slice()
    : [...new Set(topics.map((t) => t.source).filter(Boolean))] as string[];
  if (state.radarSource !== 'Todas' && !known.includes(state.radarSource)) known.push(state.radarSource);

  const sourcesByGroup: Record<string, string[]> = {
    'Todas': ['Todas'],
    'Redes sociales': [],
    'Medios de noticias': [],
    'Institucional': [],
    'Otras fuentes': [],
  };

  known.forEach((src) => {
    const group = classifySourceGroup(src);
    if (group === 'redes') sourcesByGroup['Redes sociales'].push(src);
    else if (group === 'medios') sourcesByGroup['Medios de noticias'].push(src);
    else if (group === 'institucional') sourcesByGroup['Institucional'].push(src);
    else sourcesByGroup['Otras fuentes'].push(src);
  });

  const workflowStatuses = [
    { id: 'Todos', label: 'Todos' },
    { id: 'Nuevo', label: 'Nuevos' },
    { id: 'Revisado', label: 'Revisados' },
  ];
  const verifications: { id: string; label: string }[] = [
    { id: 'Todos', label: 'Todas' },
    { id: 'verified', label: 'Verificados' },
    { id: 'checking', label: 'En verificación' },
    { id: 'signal', label: 'Señales' },
    { id: 'risk', label: 'Con riesgo' },
    { id: 'none', label: 'Sin evaluar' },
  ];
  const confidences = [
    { id: 'todos', label: 'Cualquier confianza' },
    { id: 'alta', label: 'Alta (≥75)' },
    { id: 'media', label: 'Media (40-74)' },
    { id: 'baja', label: 'Baja (<40)' },
  ];

  const chip = (active: boolean, action: string, value: string, label: string) =>
    `<button type="button" class="padmin-chip${active ? ' active' : ''}" aria-pressed="${active}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`;

  const workflowChips = workflowStatuses.map((st) => chip(state.radarStatus === st.id, 'set-radar-status', st.id, st.label)).join('');
  const verifyChips = verifications.map((v) => chip(state.radarVerification === v.id, 'set-radar-verification', v.id, v.label)).join('');
  const confidenceChips = confidences.map((c) => chip(confFilter === c.id, 'set-radar-confidence', c.id, c.label)).join('');

  const { pageItems, page, totalPages } = paginateRows(filteredTopics, state.radarPage);
  const allPageSelected = pageItems.length > 0 && pageItems.every((t) => selectedIds.includes(t.id));

  return `${renderTodaySynthesis()}
    ${renderSummary()}
    ${renderCalibration(state.data.radarStats)}

    <!-- Barra de búsqueda y acciones principales -->
    <div class="padmin-card padmin-pipeline-action-bar" style="margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:6px;flex:1;max-width:380px;min-width:220px;">
        <input id="radar-search-input" type="search" placeholder="Buscar por tema o hechos conocidos…" value="${esc(state.radarSearch || '')}" style="width:100%;font-size:12px;padding:6px 10px;border-radius:6px;border:0.5px solid var(--line-soft);background:var(--bg-admin);color:var(--text);">
        ${state.radarSearch ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="clear-radar-search" style="padding:4px 8px;">&times;</button>` : ''}
      </div>

      <!-- Selector agrupado de fuentes -->
      <div style="display:flex;align-items:center;gap:6px;">
        <label for="radar-source-select" style="font-size:11px;font-weight:600;color:var(--text-mute);">FUENTE:</label>
        <select id="radar-source-select" data-action="set-radar-source" style="font-size:12px;padding:5px 8px;border-radius:6px;border:0.5px solid var(--line-soft);background:var(--bg-admin);color:var(--text);max-width:200px;">
          ${Object.entries(sourcesByGroup).map(([groupName, groupSources]) => {
            if (!groupSources.length) return '';
            if (groupName === 'Todas') return `<option value="Todas"${state.radarSource === 'Todas' ? ' selected' : ''}>Todas las fuentes</option>`;
            return `<optgroup label="${esc(groupName)}">${groupSources.map((s) => `<option value="${esc(s)}"${state.radarSource === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</optgroup>`;
          }).join('')}
        </select>
      </div>

      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="padmin-btn padmin-btn-sm padmin-btn-outline" title="Recargar temas y calibración" data-action="refresh-radar">${icon('refresh', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Actualizar</button>
        ${canManage ? `
          <button type="button" class="padmin-btn padmin-btn-sm padmin-btn-brand" data-action="detect-radar" ${state.radarBusy ? 'disabled' : ''}>${state.radarBusy ? 'Buscando…' : `${icon('sparkles', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Buscar tendencias`}</button>
          ${topics.length ? `<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-danger" data-action="clear-topics">${icon('trash', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Limpiar todo</button>` : ''}
        ` : ''}
      </div>
    </div>

    <!-- Barra de filtros secundarios -->
    <div class="padmin-card padmin-radar-filters" style="padding:10px 14px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div class="padmin-radar-filter-group" style="margin:0;"><span class="padmin-radar-filter-label">VERIFICACIÓN:</span>${verifyChips}</div>
        <div class="padmin-radar-filter-group" style="margin:0;"><span class="padmin-radar-filter-label">WORKFLOW:</span>${workflowChips}</div>
        <div class="padmin-radar-filter-group" style="margin:0;"><span class="padmin-radar-filter-label">SCORE:</span>${confidenceChips}</div>
      </div>
    </div>

    <!-- Barra de acciones en lote si hay seleccionados -->
    ${canManage && selectedIds.length ? `
      <div class="padmin-card" style="padding:10px 16px;margin-bottom:12px;background:var(--brand-soft);border:0.5px solid var(--brand);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span style="font-size:12px;font-weight:600;color:var(--brand);">
          ${selectedIds.length} tema${selectedIds.length === 1 ? '' : 's'} seleccionado${selectedIds.length === 1 ? '' : 's'}
        </span>
        <div style="display:flex;gap:6px;">
          <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="batch-approve-topics">${icon('check', { size: 12, style: 'vertical-align:-1px;margin-right:3px;' })} Aprobar seleccionados</button>
          <button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="batch-delete-topics">${icon('trash', { size: 12, style: 'vertical-align:-1px;margin-right:3px;' })} Eliminar seleccionados</button>
        </div>
      </div>
    ` : ''}

    <div class="padmin-card">
      <div class="padmin-table-head padmin-cols-radar" style="grid-template-columns: 36px minmax(160px, 1.6fr) 100px 70px 92px 80px 132px 120px;">
        <span><input type="checkbox" aria-label="Seleccionar todos en esta página" data-action="toggle-radar-select-all"${allPageSelected ? ' checked' : ''}></span>
        <span>TEMA</span>
        <span>FUENTE</span>
        <span>INTERÉS</span>
        <span>CONFIANZA</span>
        <span title="CREA Score — ordena, nunca oculta. Distinto del filtro 'SCORE' de confianza de la barra de arriba.">CREA SCORE</span>
        <span>VERIFICACIÓN</span>
        <span style="text-align:right;">ACCIONES</span>
      </div>
      ${filteredTopics.length ? pageItems.map((r: Topic) => {
        const isSelected = selectedIds.includes(r.id);
        const sub = r.known_facts
          ? esc(r.known_facts.slice(0, 90)) + (r.known_facts.length > 90 ? '…' : '')
          : (r.source_count != null ? `${r.source_count} fuente(s)` : '');

        return `<div class="padmin-table-row clickable padmin-radar-row padmin-cols-radar" style="grid-template-columns: 36px minmax(160px, 1.6fr) 100px 70px 92px 80px 132px 120px;align-items:center;background:${isSelected ? 'var(--brand-soft,#f0fdf4)' : 'transparent'};">
          <div style="display:flex;align-items:center;">
            <input type="checkbox" data-action="toggle-radar-topic-select" data-id="${r.id}" aria-label="Seleccionar tema ${esc(r.title)}"${isSelected ? ' checked' : ''}>
          </div>
          <div style="min-width:0;" data-action="open-radar" data-id="${r.id}"><span style="font-size:13px;color:var(--text);display:block;font-weight:500;">${esc(r.title)}</span>${sub ? `<span style="font-size:11px;color:var(--text-mute);display:block;margin-top:2px;">${sub}</span>` : ''}</div>
          <span class="padmin-t-mute">${esc(r.source || '—')}</span>
          <span style="font-size:12px;color:var(--text);font-weight:600;">${r.mentions}</span>
          <span>${confidenceBadge(r.confidence)}</span>
          <span>${scoreBadge(r.crea_score)}</span>
          ${verificationBadge(r.verification_status)}
          <span style="display:flex;gap:4px;justify-content:flex-end;">
            <button type="button" title="Ver ficha" aria-label="Ver ficha de verificación" data-action="open-radar" data-id="${r.id}" class="padmin-icon-btn">${icon('eye', { size: 12 })}</button>
            ${canManage ? `<button type="button" title="Aprobar" aria-label="Aprobar tema" data-action="approve-topic" data-id="${r.id}" class="padmin-icon-btn" ${r.status === 'Revisado' ? 'disabled' : ''}>${icon('check', { size: 12 })}</button>` : ''}
            ${canManage ? `<button type="button" title="Eliminar" aria-label="Eliminar tema" data-action="delete-topic" data-id="${r.id}" class="padmin-icon-btn">${icon('trash', { size: 12 })}</button>` : ''}
          </span>
        </div>`;
      }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">No hay temas que coincidan con estos filtros o búsqueda.</p></div>'}
    </div>
    ${radarPager(page, totalPages, filteredTopics.length, state.radarTopicsHasMore)}
    ${renderRadarDetail()}
    ${renderDiscardTopicsModal()}`;
}
