// CREA Panel Admin — pantalla RADAR (social listening + verificación editorial).
import { state, type Topic, type CompetitorPost, type VerificationStatus, type RadarSource, type RadarStats } from '../store';
import { esc, loadingCard, errorCard } from '../util';

const VERIFY_LABELS: Record<VerificationStatus, string> = {
  verified: 'Verificado',
  checking: 'En verificación',
  signal: 'Señal',
  risk: 'Riesgo alto',
};

function verificationStyle(v: VerificationStatus | null): { bg: string; color: string; label: string } {
  if (v === 'verified') return { bg: 'var(--brand-soft)', color: 'var(--brand)', label: VERIFY_LABELS.verified };
  if (v === 'checking') return { bg: 'var(--accent-soft)', color: 'var(--accent-text)', label: VERIFY_LABELS.checking };
  if (v === 'signal') return { bg: 'var(--surface)', color: 'var(--text-mute)', label: VERIFY_LABELS.signal };
  if (v === 'risk') return { bg: 'var(--danger-soft, #fae5e0)', color: 'var(--danger)', label: VERIFY_LABELS.risk };
  return { bg: 'var(--bg-soft, #f3f4f2)', color: 'var(--text-mute)', label: 'Sin evaluar' };
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
  if (b.text === '—') return `<span style="font-size:12px;color:var(--text-mute);">—</span>`;
  const bg = b.className === 'high' ? 'var(--brand-soft)' : b.className === 'mid' ? 'var(--accent-soft)' : 'var(--danger-soft, #fae5e0)';
  const color = b.className === 'high' ? 'var(--brand)' : b.className === 'mid' ? 'var(--accent-text)' : 'var(--danger)';
  return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:24px;border-radius:12px;font-size:12px;font-weight:700;background:${bg};color:${color};">${esc(b.text)}</span>`;
}

function evidenceList(topic: Topic): NonNullable<Topic['evidence']> {
  const e = topic.evidence;
  return Array.isArray(e) ? e : [];
}

function riskFlagText(flag: string | { code?: string; message?: string }): string {
  if (typeof flag === 'string') return flag;
  return flag.message || flag.code || JSON.stringify(flag);
}

function renderRadarDetail(): string {
  if (state.selectedRadarId == null) return '';
  const topics = state.data.topics || [];
  const topic = topics.filter((r: Topic) => r.id === state.selectedRadarId)[0];
  if (!topic) return '';

  const vStyle = verificationStyle(topic.verification_status);
  const conf = topic.confidence != null ? `${Math.round(Number(topic.confidence))} / 100 de confianza` : 'Sin score de confianza';
  const evidence = evidenceList(topic);
  const flags = Array.isArray(topic.risk_flags) ? topic.risk_flags : [];
  const sourceCount = topic.source_count != null ? topic.source_count : evidence.length || null;

  const evidenceHtml = evidence.length
    ? evidence.map((ev) => {
      const label = esc(ev.label || 'Fuente');
      const meta = [ev.kind, ev.url].filter(Boolean).map(String).join(' · ');
      const tags = [
        ev.supports ? `<span class="padmin-badge" style="background:var(--bg-soft);color:var(--text-mute);font-size:10px;">${esc(String(ev.supports))}</span>` : '',
        ev.reliable === true ? `<span class="padmin-badge" style="background:var(--brand-soft);color:var(--brand);font-size:10px;">Confiable</span>` : '',
        ev.reliable === false ? `<span class="padmin-badge" style="background:var(--danger-soft, #fae5e0);color:var(--danger);font-size:10px;">Débil</span>` : '',
      ].join(' ');
      return `<div style="border:0.5px solid var(--line-soft);border-radius:6px;padding:10px;margin:6px 0;">
        <b style="display:block;font-size:12px;color:var(--text);">${label}</b>
        ${meta ? `<small style="display:block;color:var(--text-mute);margin:3px 0 6px;font-size:11px;">${esc(meta)}</small>` : ''}
        ${tags}
      </div>`;
    }).join('')
    : '<p class="padmin-drawer-section-body">Sin evidencia registrada (topics detectados antes de la ficha de verificación).</p>';

  const flagsHtml = flags.length
    ? flags.map((f) =>
      `<div style="display:flex;gap:8px;align-items:center;border-left:3px solid var(--accent);background:var(--accent-soft);padding:8px 10px;font-size:12px;color:var(--accent-text);margin:6px 0;">${esc(riskFlagText(f))}</div>`
    ).join('')
    : (topic.verification_status
      ? '<p class="padmin-drawer-section-body" style="color:var(--brand);">Sin señales de riesgo registradas.</p>'
      : '<p class="padmin-drawer-section-body">Sin evaluar.</p>');

  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-radar"></div>
    <div class="padmin-drawer">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;"><p class="padmin-drawer-eyebrow">FICHA DE VERIFICACIÓN · RADAR</p><span class="padmin-drawer-close" data-action="close-radar">Cerrar &times;</span></div>
      <h2 style="font-size:16px;font-weight:600;color:var(--text);margin:0 0 12px;line-height:1.35;">${esc(topic.title)}</h2>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center;">
        <span class="padmin-badge" style="background:${vStyle.bg};color:${vStyle.color};">${esc(vStyle.label)}</span>
        <span style="font-size:11px;color:var(--text-mute);">${esc(conf)}</span>
        <span style="font-size:11px;color:var(--text-mute);">Workflow: <b style="color:var(--text);">${esc(topic.status)}</b></span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;">
        <div style="padding:10px;background:var(--bg-soft,#f8faf7);border-radius:6px;"><span style="display:block;font-size:10px;color:var(--text-mute);text-transform:uppercase;">Evidencia</span><b style="display:block;margin-top:4px;font-size:14px;">${sourceCount != null ? esc(String(sourceCount)) + ' fuente(s)' : '—'}</b></div>
        <div style="padding:10px;background:var(--bg-soft,#f8faf7);border-radius:6px;"><span style="display:block;font-size:10px;color:var(--text-mute);text-transform:uppercase;">Interés</span><b style="display:block;margin-top:4px;font-size:14px;">${topic.mentions}</b></div>
        <div style="padding:10px;background:var(--bg-soft,#f8faf7);border-radius:6px;"><span style="display:block;font-size:10px;color:var(--text-mute);text-transform:uppercase;">Fuente canal</span><b style="display:block;margin-top:4px;font-size:14px;">${esc(topic.source || '—')}</b></div>
        <div style="padding:10px;background:var(--bg-soft,#f8faf7);border-radius:6px;"><span style="display:block;font-size:10px;color:var(--text-mute);text-transform:uppercase;">Confianza</span><b style="display:block;margin-top:4px;font-size:14px;">${topic.confidence != null ? esc(String(Math.round(Number(topic.confidence)))) : '—'}</b></div>
      </div>
      ${topic.known_facts ? `<p class="padmin-drawer-section-title">QUÉ SE SABE</p><p class="padmin-drawer-section-body">${esc(topic.known_facts)}</p>` : ''}
      ${topic.unknown_facts ? `<p class="padmin-drawer-section-title">QUÉ NO SE SABE</p><p class="padmin-drawer-section-body">${esc(topic.unknown_facts)}</p>` : ''}
      <p class="padmin-drawer-section-title">EVIDENCIA Y FUENTES</p>${evidenceHtml}
      <p class="padmin-drawer-section-title">SEÑALES DE RIESGO</p>${flagsHtml}
      ${topic.editorial_decision ? `<p class="padmin-drawer-section-title">DECISIÓN EDITORIAL</p><p class="padmin-drawer-section-body">${esc(topic.editorial_decision)}</p>` : ''}
      <p class="padmin-drawer-section-title">ANTECEDENTES</p><p class="padmin-drawer-section-body">${esc(topic.antecedentes || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">ACTORES INVOLUCRADOS</p><p class="padmin-drawer-section-body">${esc(topic.actores || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">ÁNGULOS DE COBERTURA SUGERIDOS</p><p class="padmin-drawer-section-body">${esc(topic.angulos || 'Sin datos.')}</p>
      <p class="padmin-drawer-section-title">POTENCIAL DE AUDIENCIA</p><p class="padmin-drawer-section-body" style="margin-bottom:0;">${esc(topic.audiencia || 'Sin datos.')}</p>
      ${state.user!.role === 'director' || state.user!.role === 'produccion' ?
        `<div style="margin-top:20px;padding-top:16px;border-top:0.5px solid var(--line-soft);display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          ${topic.verification_status === 'risk' ? '<p style="width:100%;margin:0 0 8px;font-size:12px;color:var(--danger);">Riesgo alto: generar propuesta requiere confirmación explícita (force).</p>' : ''}
          ${(topic.verification_status === 'checking' || topic.verification_status === 'signal') ? `<p style="width:100%;margin:0 0 8px;font-size:12px;color:var(--accent-text);">${topic.verification_status === 'checking' ? 'En verificación: se puede generar, pero conviene corroborar.' : 'Solo señal: la propuesta puede necesitar más research.'}</p>` : ''}
          <select id="proposal-format-${topic.id}" style="font-size:12px;border:0.5px solid var(--line-soft);border-radius:6px;padding:6px 8px;background:#fff;">
            ${['nota', 'post', 'guion_audio', 'guion_video'].map((f) => `<option value="${f}">${f}</option>`).join('')}
          </select>
          <button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-proposal-from-topic" data-id="${topic.id}" data-force-risk="${topic.verification_status === 'risk' ? '1' : '0'}" ${state.generatingProposal ? 'disabled' : ''}>${state.generatingProposal ? 'Generando…' : (topic.verification_status === 'risk' ? '⚠ Forzar propuesta IA' : 'Generar propuesta IA')}</button>
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
    { id: 'fuentes', label: 'Fuentes' },
  ].map((t) =>
    `<button type="button" class="padmin-tab${state.radarTab === t.id ? ' active' : ''}" data-action="set-radar-tab" data-tab="${t.id}">${t.label}</button>`
  ).join('') + '</div>';
  const body = state.radarTab === 'competencia'
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

function trustBadge(trust: string): string {
  if (trust === 'high') return '<span class="padmin-badge" style="background:var(--brand-soft);color:var(--brand);">Alta</span>';
  if (trust === 'low') return '<span class="padmin-badge" style="background:var(--danger-soft,#fae5e0);color:var(--danger);">Baja</span>';
  return '<span class="padmin-badge" style="background:var(--accent-soft);color:var(--accent-text);">Media</span>';
}

function renderRadarFuentes(): string {
  const sources = state.data.radarSources;
  if (!sources) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const canManage = state.user!.role === 'director' || state.user!.role === 'produccion';
  const activeCount = sources.filter((s) => s.active).length;
  return `<div>
    <p class="padmin-lede" style="margin-top:0;">Lista editorial de dominios. En la detección, evidence con host <b>alta</b> sube confianza; <b>baja</b> la penaliza. Activas: ${activeCount}.</p>
    <div class="padmin-card">
      <div class="padmin-table-head" style="grid-template-columns:1.2fr 1.4fr 90px 90px 1fr 100px;min-width:640px;">
        <span>DOMINIO</span><span>ETIQUETA</span><span>TRUST</span><span>ESTADO</span><span>NOTAS</span><span>ACCIONES</span>
      </div>
      ${sources.length ? sources.map((s: RadarSource) => `
        <div class="padmin-table-row" style="grid-template-columns:1.2fr 1.4fr 90px 90px 1fr 100px;min-width:640px;">
          <span style="font-size:13px;font-weight:600;color:var(--text);">${esc(s.domain)}</span>
          <span style="font-size:12px;color:var(--text);">${esc(s.label)}</span>
          <span>${trustBadge(s.trust)}</span>
          <span class="padmin-badge" style="background:${s.active ? 'var(--brand-soft)' : 'var(--bg-soft)'};color:${s.active ? 'var(--brand)' : 'var(--text-mute)'};">${s.active ? 'Activa' : 'Off'}</span>
          <span style="font-size:11px;color:var(--text-mute);">${esc(s.notes || '—')}</span>
          <span>${canManage
            ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-radar-source" data-id="${s.id}" data-active="${s.active ? 'true' : 'false'}">${s.active ? 'Desactivar' : 'Activar'}</button>`
            : '—'}</span>
        </div>`).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin fuentes. Corré la migración 035 o agregá dominios vía API.</p></div>'}
    </div>
  </div>`;
}

function renderRadarCompetencia(): string {
  const posts = state.data.competitors;
  if (!posts) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
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
      ${posts.length ? posts.map((p: CompetitorPost) => {
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
      return `<div style="margin:0 0 16px;padding:12px 14px;background:var(--surface);border:0.5px solid var(--line-soft);border-radius:7px;font-size:12px;color:var(--danger);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span>Calibración: ${esc(state.radarStatsError)}</span>
        <span class="padmin-chip" data-action="retry-radar-stats" style="cursor:pointer;">Reintentar</span>
      </div>`;
    }
    return `<div style="margin:0 0 16px;padding:12px 14px;background:var(--surface);border:0.5px solid var(--line-soft);border-radius:7px;font-size:12px;color:var(--text-mute);">Calibración: cargando stats…</div>`;
  }
  const days = state.radarStatsDays || stats.days;
  const bs = stats.topics.by_status || {};
  const line = (key: string, label: string) => {
    const row = bs[key];
    if (!row) return `${label}: 0`;
    const avg = row.avg_confidence != null ? ` · conf ${row.avg_confidence}` : '';
    return `${label}: ${row.count} (${row.pct}%${avg})`;
  };
  const dayChip = (d: number) =>
    `<span class="padmin-chip" data-action="set-radar-stats-days" data-value="${d}" style="background:${days === d ? 'var(--brand)' : 'var(--surface)'};color:${days === d ? '#fff' : 'var(--text)'};border-color:${days === d ? 'var(--brand)' : 'var(--line-soft)'};cursor:pointer;">${d}d</span>`;
  const hints = (stats.hints || []).map((h) =>
    `<li style="margin:4px 0;font-size:12px;color:var(--text-2);">${esc(h)}</li>`
  ).join('');
  return `<div style="margin:0 0 16px;padding:14px 16px;background:var(--surface);border:0.5px solid var(--line-soft);border-radius:7px;">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;color:var(--text-mute);text-transform:uppercase;">Calibración</span>
      ${dayChip(7)}${dayChip(30)}
      <span style="font-size:11px;color:var(--text-mute);margin-left:auto;">ventana ${stats.days}d · ${stats.topics.total} topics</span>
    </div>
    <p style="margin:0 0 8px;font-size:12px;color:var(--text);line-height:1.45;">
      ${esc(line('verified', 'Verified'))} · ${esc(line('checking', 'Checking'))} · ${esc(line('signal', 'Signal'))} · ${esc(line('risk', 'Risk'))}
      ${bs.unevaluated ? ' · ' + esc(line('unevaluated', 'Sin evaluar')) : ''}
    </p>
    <p style="margin:0 0 8px;font-size:12px;color:var(--text-mute);">
      Propuestas: ${stats.proposals.generated} ok · gate risk bloqueó ${stats.proposals.blocked_risk} · forced risk ${stats.proposals.forced_from_risk}
      · Detect: ${stats.detection.runs} corridas, +${stats.detection.inserted} insert / ${stats.detection.upgraded} upgrade / ${stats.detection.skipped_similar} skip similar
      · Fuentes activas: ${stats.sources.active}
    </p>
    <ul style="margin:0;padding-left:18px;">${hints}</ul>
  </div>`;
}

function renderRadarTemas(): string {
  const topics = state.data.topics;
  if (!topics) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  // Sources dinámicos: del summary del API (o de lo cargado si el summary falló).
  const known = state.data.topicSummary
    ? state.data.topicSummary.sources.slice()
    : [...new Set(topics.map((t) => t.source).filter(Boolean))] as string[];
  if (state.radarSource !== 'Todas' && !known.includes(state.radarSource)) known.push(state.radarSource);
  const sources = ['Todas', ...known];
  const workflowStatuses = ['Todos', 'Nuevo', 'Revisado'];
  const verifications: { id: string; label: string }[] = [
    { id: 'Todos', label: 'Todos' },
    { id: 'verified', label: 'Verificados' },
    { id: 'checking', label: 'En verificación' },
    { id: 'signal', label: 'Señales' },
    { id: 'risk', label: 'Con riesgo' },
    { id: 'none', label: 'Sin evaluar' },
  ];
  const chip = (active: boolean, action: string, value: string, label: string, activeBg: string) =>
    `<span class="padmin-chip" data-action="${action}" data-value="${esc(value)}" style="background:${active ? activeBg : 'var(--surface)'};color:${active ? '#fff' : 'var(--text)'};border-color:${active ? activeBg : 'var(--line-soft)'};">${esc(label)}</span>`;

  const sourceChips = sources.map((src) => chip(state.radarSource === src, 'set-radar-source', src, src, 'var(--brand)')).join('');
  const workflowChips = workflowStatuses.map((st) => chip(state.radarStatus === st, 'set-radar-status', st, st, 'var(--accent)')).join('');
  const verifyChips = verifications.map((v) => chip(state.radarVerification === v.id, 'set-radar-verification', v.id, v.label, 'var(--brand)')).join('');

  return `${renderSummary()}
    ${renderCalibration(state.data.radarStats)}
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;">${sourceChips}
      <span style="margin-left:auto;display:flex;gap:8px;">
        <button type="button" class="padmin-btn padmin-btn-sm padmin-btn-outline" title="Recargar temas, resumen y calibración" data-action="refresh-radar">↻ Actualizar</button>
        ${state.user!.role === 'director' || state.user!.role === 'produccion' ?
          `${topics.length ? '<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-danger" data-action="clear-topics">🗑 Limpiar todo</button>' : ''}
          <button type="button" class="padmin-btn padmin-btn-sm" data-action="detect-radar" ${state.radarBusy ? 'disabled' : ''}>${state.radarBusy ? 'Buscando…' : '🔍 Buscar tendencias'}</button>` : ''}
      </span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">${verifyChips}</div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap;"><span style="font-size:10px;color:var(--text-mute);text-transform:uppercase;margin-right:4px;">Workflow</span>${workflowChips}</div>
    <div class="padmin-card">
      <div class="padmin-table-head padmin-cols-radar"><span>TEMA</span><span>FUENTE</span><span>INTERÉS</span><span>CONFIANZA</span><span>VERIFICACIÓN</span><span>ACCIONES</span></div>
      ${topics.length ? topics.map((r: Topic) => {
        const vStyle = verificationStyle(r.verification_status);
        const canManage = state.user!.role === 'director' || state.user!.role === 'produccion';
        const sub = r.known_facts
          ? esc(r.known_facts.slice(0, 90)) + (r.known_facts.length > 90 ? '…' : '')
          : (r.source_count != null ? `${r.source_count} fuente(s)` : '');
        return `<div class="padmin-table-row clickable padmin-cols-radar" data-action="open-radar" data-id="${r.id}">
          <div style="min-width:0;"><span style="font-size:13px;color:var(--text);display:block;">${esc(r.title)}</span>${sub ? `<span style="font-size:11px;color:var(--text-mute);display:block;margin-top:2px;">${sub}</span>` : ''}</div>
          <span style="font-size:12px;color:var(--text-mute);">${esc(r.source || '—')}</span>
          <span style="font-size:12px;color:var(--text);font-weight:600;">${r.mentions}</span>
          <span>${confidenceBadge(r.confidence)}</span>
          <span class="padmin-badge" style="background:${vStyle.bg};color:${vStyle.color};width:fit-content;">${esc(vStyle.label)}</span>
          <span style="display:flex;gap:4px;">
            <button type="button" title="Ver" data-action="open-radar" data-id="${r.id}" class="padmin-icon-btn">👁</button>
            ${canManage ? `<button type="button" title="Aprobar" data-action="approve-topic" data-id="${r.id}" class="padmin-icon-btn" ${r.status === 'Revisado' ? 'disabled' : ''}>✓</button>` : ''}
            ${canManage ? `<button type="button" title="Eliminar" data-action="delete-topic" data-id="${r.id}" class="padmin-icon-btn">🗑</button>` : ''}
          </span>
        </div>`;
      }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">No hay temas con estos filtros.</p></div>'}
    </div>
    ${state.radarTopicsHasMore ? `<div style="display:flex;justify-content:center;margin-top:12px;"><button type="button" class="padmin-btn padmin-btn-sm padmin-btn-outline" data-action="load-more-topics">Cargar más temas</button></div>` : ''}
    ${renderRadarDetail()}`;
}
