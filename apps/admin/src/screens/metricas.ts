// CREA Panel Admin — pantalla Métricas.
import { state } from '../store';
import { esc, loadingCard, errorCard } from '../util';

export function renderMetricas(): string {
  const m = state.data.metrics;
  if (!m) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const weeklyPct = m.weeklyGoal ? Math.round((m.piecesPublished / m.weeklyGoal) * 100) + '%' : '0%';
  let chartHtml: string;
  if (m.weeklyPieces && m.weeklyPieces.length) {
    const maxWeekly = Math.max(...m.weeklyPieces.map((w) => w.count));
    const chartW = 420, chartH = 110, chartPad = 10;
    const stepX = m.weeklyPieces.length > 1 ? (chartW - chartPad * 2) / (m.weeklyPieces.length - 1) : 0;
    const points = m.weeklyPieces.map((w, idx: number) => {
      const x = chartPad + idx * stepX;
      const y = chartH - chartPad - (maxWeekly ? (w.count / maxWeekly) * (chartH - chartPad * 2) : 0);
      return { x, y, week: w.week.slice(5) };
    });
    const polyline = points.map((p) => p.x + ',' + p.y).join(' ');
    chartHtml = `<svg viewBox="0 0 ${chartW} ${chartH}" width="100%" height="110" style="display:block;overflow:visible;color:var(--brand);">
        <polyline points="${polyline}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
        ${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="currentColor"></circle>`).join('')}
      </svg><div class="padmin-chart-labels">${points.map((p) => `<span>${esc(p.week)}</span>`).join('')}</div>`;
  } else {
    chartHtml = '<p class="padmin-lede" style="margin:0;">Sin piezas publicadas en las últimas semanas.</p>';
  }

  const topSections = m.topSections || [];
  const maxSectionCount = topSections.length ? Math.max(...topSections.map((s) => s.count)) : 0;
  const authors = m.authors || [];

  return `<div style="max-width:820px;">
    <h1 class="padmin-h1" style="margin-bottom:22px;">Panel de métricas</h1>
    <div class="padmin-grid2" style="gap:16px;margin-bottom:24px;">
      <div class="padmin-card" style="padding:20px;"><p class="padmin-stat-label">PIEZAS PUBLICADAS ESTA SEMANA VS. OBJETIVO</p><p style="font-weight:700;font-size:24px;color:var(--text);margin:0 0 10px;">${m.piecesPublished} / ${m.weeklyGoal}</p><div style="width:100%;height:8px;background:var(--bg-soft);border-radius:4px;overflow:hidden;"><div style="height:100%;background:var(--brand);width:${weeklyPct};"></div></div></div>
      <div class="padmin-card" style="padding:20px;"><p class="padmin-stat-label">ALCANCE TOTAL</p>
        <div style="display:flex;gap:18px;margin-top:10px;">
          <div><p style="font-size:20px;font-weight:700;color:var(--text);margin:0;">${m.totalPieces != null ? m.totalPieces : '—'}</p><p style="font-size:10px;color:var(--text-mute);margin:2px 0 0;">PIEZAS PUBLICADAS</p></div>
          <div><p style="font-size:20px;font-weight:700;color:var(--text);margin:0;">${m.approvalRate != null ? m.approvalRate + '%' : '—'}</p><p style="font-size:10px;color:var(--text-mute);margin:2px 0 0;">TASA DE APROBACIÓN</p></div>
          <div><p style="font-size:20px;font-weight:700;color:var(--text);margin:0;">${m.avgDraftDays != null ? m.avgDraftDays : '—'}</p><p style="font-size:10px;color:var(--text-mute);margin:2px 0 0;">DÍAS PROM. DE PRODUCCIÓN</p></div>
        </div>
      </div>
    </div>
    <p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Piezas publicadas por semana</p>
    <div class="padmin-card" style="padding:20px;margin-bottom:24px;">${chartHtml}</div>
    <p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Crecimiento por canal</p>
    <div class="padmin-card" style="padding:20px;">
      ${topSections.length ? (
        '<p style="font-size:11px;font-weight:600;color:var(--text-mute);margin:0 0 10px;">TOP SECCIONES</p>' +
        topSections.map((s) => {
          const pct = maxSectionCount ? Math.round((s.count / maxSectionCount) * 100) : 0;
          return `<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text);margin-bottom:4px;"><span>${esc(s.section)}</span><span>${s.count}</span></div><div style="width:100%;height:6px;background:var(--bg-soft);border-radius:3px;overflow:hidden;"><div style="height:100%;background:var(--accent);width:${pct}%;"></div></div></div>`;
        }).join('') +
        (authors.length ? '<p style="font-size:11px;font-weight:600;color:var(--text-mute);margin:18px 0 10px;">RANKING DE AUTORES</p>' +
          authors.map((a) =>
            `<div class="padmin-row" style="padding:6px 0;"><span style="font-size:12px;color:var(--text);">${esc(a.name)}</span><span style="font-size:12px;font-weight:600;color:var(--text-mute);">${a.published} publicadas</span></div>`
          ).join('') : '')
      ) : '<p class="padmin-lede" style="margin:0;">Sin piezas publicadas todavía.</p>'}
    </div>
  </div>`;
}
