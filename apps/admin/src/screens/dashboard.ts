// CREA Panel Admin — pantalla Dashboard (Inicio).
import { state, type Idea, type Proposal } from '../store';
import { esc, badge, loadingCard, errorCard } from '../util';

function statCard(label: string, value: number | string, color?: string): string {
  return `<div class="padmin-stat-card"><p class="padmin-stat-label">${esc(label)}</p><p class="padmin-stat-value"${color ? ` style="color:${color};"` : ''}>${value}</p></div>`;
}

function renderDashboardDirector(): string {
  const ideas = state.data.ideas;
  const piecesInReview = state.data.proposalsByKey.en_revision;
  if (!ideas || !piecesInReview) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const ideasNueva = ideas.filter((i: Idea) => i.column_status === 'nueva');

  return `<div>
    <p style="font-size:13px;color:var(--text-mute);margin:0 0 4px;">Buenos días</p>
    <h1 class="padmin-h1" style="margin-bottom:22px;">${esc(state.user!.name)}</h1>
    <div class="padmin-grid2" style="margin-bottom:28px;">
      ${statCard('IDEAS PENDIENTES', ideasNueva.length)}
      ${statCard('PIEZAS EN REVISIÓN', piecesInReview.length)}
    </div>
    <div class="padmin-grid2" style="gap:20px;">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;"><p style="font-size:12px;font-weight:600;color:var(--text);margin:0;">Ideas pendientes de decisión</p><button type="button" class="padmin-logout" data-action="goto" data-id="ideas">Ver bandeja &rarr;</button></div>
        <div class="padmin-card">${ideasNueva.length ? ideasNueva.map((i: Idea) =>
          `<div class="padmin-row clickable" data-action="goto" data-id="ideas"><div><p class="padmin-row-title">${esc(i.title)}</p><p class="padmin-row-meta">${esc(i.category || '')}</p></div><span class="padmin-idea-score">${i.score != null ? 'Score ' + i.score : ''}</span></div>`
        ).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin ideas pendientes.</p></div>'}</div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;"><p style="font-size:12px;font-weight:600;color:var(--text);margin:0;">Piezas en revisión</p><button type="button" class="padmin-logout" data-action="goto" data-id="aprobacion">Ir a aprobación &rarr;</button></div>
        <div class="padmin-card">${piecesInReview.length ? piecesInReview.map((p: Proposal) =>
          `<div class="padmin-row clickable" data-action="goto" data-id="aprobacion"><div><p class="padmin-row-title">${esc(p.title)}</p><p class="padmin-row-meta">${esc(p.section || '')}</p></div>${badge(p.status)}</div>`
        ).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Nada en revisión.</p></div>'}</div>
      </div>
    </div>
  </div>`;
}

function renderChecklistPieza(myPieces: Proposal[]): string {
  const current = myPieces.filter((p) => p.status !== 'published')[0];
  if (!current) return '';
  const items = [
    { label: 'Título final', done: Boolean(current.title) },
    { label: 'Imagen principal', done: Boolean(current.cover_image_url) },
    { label: 'SEO completo (dek, slug, sección)', done: Boolean(current.dek && current.slug && current.section) },
    { label: 'Revisión editorial', done: current.status === 'en_revision' },
  ];
  return `<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Checklist de publicación &middot; ${esc(current.title || 'pieza en curso')}</p>
    <div class="padmin-card" style="padding:8px 16px;">${items.map((c) => {
      const color = c.done ? 'var(--brand)' : 'var(--line-soft)';
      const bg = c.done ? 'var(--brand)' : 'transparent';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--line-soft);"><div style="width:16px;height:16px;border-radius:4px;border:1.5px solid ${color};background:${bg};flex-shrink:0;"></div><span style="font-size:13px;color:var(--text);">${esc(c.label)}</span></div>`;
    }).join('')}</div>`;
}

function renderDashboardProduccion(): string {
  const myPieces = state.data.proposalsByKey.mine;
  if (!myPieces) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const myDraftCount = myPieces.filter((p: Proposal) => p.status === 'borrador').length;
  const myReviewCount = myPieces.filter((p: Proposal) => p.status === 'en_revision').length;
  const myPublishedCount = myPieces.filter((p: Proposal) => p.status === 'published').length;

  return `<div>
    <p style="font-size:13px;color:var(--text-mute);margin:0 0 4px;">Tus tareas</p>
    <h1 class="padmin-h1" style="margin-bottom:22px;">${esc(state.user!.name)}</h1>
    <div class="padmin-grid4" style="margin-bottom:28px;">
      ${statCard('PIEZAS ASIGNADAS', myPieces.length)}
      ${statCard('EN BORRADOR', myDraftCount)}
      ${statCard('EN REVISIÓN', myReviewCount, 'var(--accent-text)')}
      ${statCard('PUBLICADAS', myPublishedCount, 'var(--brand)')}
    </div>
    <p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Piezas en proceso</p>
    <div class="padmin-card" style="margin-bottom:28px;">${myPieces.length ? myPieces.map((p: Proposal) =>
      `<div class="padmin-row clickable" data-action="goto" data-id="editor" data-pid="${p.id}"><div><p class="padmin-row-title">${esc(p.title)}</p><p class="padmin-row-meta">${esc(p.section || '')}</p></div>${badge(p.status)}</div>`
    ).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin piezas asignadas todavía.</p></div>'}</div>
    ${renderChecklistPieza(myPieces)}
  </div>`;
}

export function renderDashboard(): string {
  if (state.user!.role === 'director') return renderDashboardDirector();
  if (state.user!.role === 'produccion') return renderDashboardProduccion();
  return '<p class="padmin-lede">Sin panel de inicio para tu rol.</p>';
}
