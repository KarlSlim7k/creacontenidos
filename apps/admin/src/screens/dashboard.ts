// CREA Panel Admin — pantalla Dashboard (Inicio).
import { state, type Idea, type Proposal } from '../store';
import { esc, badge, loadingCard, errorCard, greeting } from '../util';

// screen: convierte la tarjeta en un atajo real. Los números del inicio son el punto
// de partida del día del director; obligarle a buscar el módulo en el menú era un
// paso de más sobre la métrica que acaba de leer.
function statCard(label: string, value: number | string, color?: string, screen?: string): string {
  const body = `<p class="padmin-stat-label">${esc(label)}</p><p class="padmin-stat-value"${color ? ` style="color:${color};"` : ''}>${value}</p>`;
  if (!screen) return `<div class="padmin-stat-card">${body}</div>`;
  return `<button type="button" class="padmin-stat-card padmin-stat-card-link" data-action="goto" data-id="${screen}">${body}</button>`;
}

function renderDashboardDirector(): string {
  const ideas = state.data.ideas;
  const piecesInReview = state.data.proposalsByKey.en_revision;
  if (!ideas || !piecesInReview) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const ideasNueva = ideas.filter((i: Idea) => i.column_status === 'nueva');
  // Best-effort: estos cuatro se cargan aparte y no deben bloquear el inicio. Mientras
  // no llegan se muestra "—", que es honesto; un 0 se leería como "no hay pendientes".
  const leads = state.data.leads;
  const propuestas = state.data.proposalsByKey.propuesta;
  const published = state.data.proposalsByKey.published;
  const activity = state.data.activity;
  const leadsNuevos = leads ? leads.filter((l) => l.status === 'nuevo').length : '—';

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const publishedWeek = published
    ? published.filter((p: Proposal) => p.published_at && new Date(p.published_at).getTime() >= weekAgo).length
    : null;

  const fallos = (activity || []).filter((a) => a.status !== 'exito');
  const alertaHtml = fallos.length
    ? `<div class="padmin-alert" role="status">
        <span class="padmin-alert-dot"></span>
        <span>${fallos.length} tarea${fallos.length === 1 ? '' : 's'} del agente ${fallos.length === 1 ? 'falló' : 'fallaron'} — última: ${esc(fallos[0].detail || fallos[0].action)}</span>
        <button type="button" class="padmin-logout" data-action="goto" data-id="hermes">Ver estado &rarr;</button>
      </div>`
    : '';

  return `<div>
    <p style="font-size:13px;color:var(--text-mute);margin:0 0 4px;">${greeting()}</p>
    <h1 class="padmin-h1" style="margin-bottom:6px;">${esc(state.user!.name)}</h1>
    <p class="padmin-lede">${publishedWeek == null ? 'Cargando resumen de la semana…' : `${publishedWeek} nota${publishedWeek === 1 ? '' : 's'} publicada${publishedWeek === 1 ? '' : 's'} en los últimos 7 días.`}</p>
    ${alertaHtml}
    <div class="padmin-grid4" style="margin-bottom:28px;">
      ${statCard('IDEAS PENDIENTES', ideasNueva.length, undefined, 'ideas')}
      ${statCard('PIEZAS EN REVISIÓN', piecesInReview.length, piecesInReview.length ? 'var(--accent-text)' : undefined, 'aprobacion')}
      ${statCard('PROPUESTAS IA', propuestas ? propuestas.length : '—', undefined, 'propuestas')}
      ${statCard('LEADS SIN ATENDER', leadsNuevos, leadsNuevos ? 'var(--brand)' : undefined, 'leads')}
    </div>
    <div class="padmin-grid2" style="gap:20px;">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;"><p class="padmin-section-title" style="margin:0;">Ideas pendientes de decisión</p><button type="button" class="padmin-logout" data-action="goto" data-id="ideas">Ver bandeja &rarr;</button></div>
        <div class="padmin-card">${ideasNueva.length ? ideasNueva.map((i: Idea) =>
          `<div class="padmin-row clickable" data-action="goto" data-id="ideas" role="button" tabindex="0"><div><p class="padmin-row-title">${esc(i.title)}</p><p class="padmin-row-meta">${esc(i.category || '')}</p></div><span class="padmin-idea-score">${i.score != null ? 'Score ' + i.score : ''}</span></div>`
        ).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin ideas pendientes.</p></div>'}</div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;"><p class="padmin-section-title" style="margin:0;">Piezas en revisión</p><button type="button" class="padmin-logout" data-action="goto" data-id="aprobacion">Ir a aprobación &rarr;</button></div>
        <div class="padmin-card">${piecesInReview.length ? piecesInReview.map((p: Proposal) =>
          `<div class="padmin-row clickable" data-action="goto" data-id="aprobacion" role="button" tabindex="0"><div><p class="padmin-row-title">${esc(p.title)}</p><p class="padmin-row-meta">${esc(p.section || '')}</p></div>${badge(p.status)}</div>`
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
  return `<p class="padmin-section-title">Checklist de publicación &middot; ${esc(current.title || 'pieza en curso')}</p>
    <div class="padmin-card" style="padding:8px 16px;">${items.map((c) => {
      const color = c.done ? 'var(--brand)' : 'var(--line-soft)';
      const bg = c.done ? 'var(--brand)' : 'transparent';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--line-soft);"><div style="width:16px;height:16px;border-radius:4px;border:1.5px solid ${color};background:${bg};flex-shrink:0;"></div><span class="padmin-t-body">${esc(c.label)}</span></div>`;
    }).join('')}</div>`;
}

function renderDashboardProduccion(): string {
  const myPieces = state.data.proposalsByKey.mine;
  if (!myPieces) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const myDraftCount = myPieces.filter((p: Proposal) => p.status === 'borrador').length;
  const myReviewCount = myPieces.filter((p: Proposal) => p.status === 'en_revision').length;
  const myPublishedCount = myPieces.filter((p: Proposal) => p.status === 'published').length;

  return `<div>
    <p style="font-size:13px;color:var(--text-mute);margin:0 0 4px;">${greeting()} &middot; tus tareas</p>
    <h1 class="padmin-h1" style="margin-bottom:22px;">${esc(state.user!.name)}</h1>
    <div class="padmin-grid4" style="margin-bottom:28px;">
      ${statCard('PIEZAS ASIGNADAS', myPieces.length)}
      ${statCard('EN BORRADOR', myDraftCount)}
      ${statCard('EN REVISIÓN', myReviewCount, 'var(--accent-text)')}
      ${statCard('PUBLICADAS', myPublishedCount, 'var(--brand)')}
    </div>
    <p class="padmin-section-title">Piezas en proceso</p>
    <div class="padmin-card" style="margin-bottom:28px;">${myPieces.length ? myPieces.map((p: Proposal) =>
      `<div class="padmin-row clickable" data-action="goto" data-id="editor" data-pid="${p.id}" role="button" tabindex="0"><div><p class="padmin-row-title">${esc(p.title)}</p><p class="padmin-row-meta">${esc(p.section || '')}</p></div>${badge(p.status)}</div>`
    ).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin piezas asignadas todavía.</p></div>'}</div>
    ${renderChecklistPieza(myPieces)}
  </div>`;
}

export function renderDashboard(): string {
  if (state.user!.role === 'director') return renderDashboardDirector();
  if (state.user!.role === 'produccion') return renderDashboardProduccion();
  return '<p class="padmin-lede">Sin panel de inicio para tu rol.</p>';
}
