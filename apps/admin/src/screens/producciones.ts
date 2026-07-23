// CREA Panel Admin — pantallas Producciones (social embeds) y Publicadas.
import { state, type SocialPost, type Proposal } from '../store';
import { esc, loadingCard, errorCard, relativeTime } from '../util';

export function renderProducciones(): string {
  const posts = state.data.socialPosts;
  if (!posts) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const errorHtml = state.socialFormError ? `<p class="padmin-lede" style="color:var(--danger);">${esc(state.socialFormError)}</p>` : '';
  const formHtml = state.socialFormOpen ? (
    `<div class="padmin-card" style="padding:18px;margin-bottom:18px;max-width:760px;">
      ${errorHtml}
      <form data-action="submit-social">
        <div class="padmin-field" style="margin:0 0 12px;"><label>URL del video (TikTok, YouTube, Facebook o Instagram)</label><input id="social-url" type="text" required placeholder="https://www.tiktok.com/@cuenta/video/... — o el código &lt;iframe&gt; que da Facebook al presionar &quot;Insertar&quot;"><p class="padmin-row-meta" style="margin:4px 0 0;">Para Facebook también puedes pegar directo el código &lt;iframe&gt; del botón "Insertar" del video: sacamos la URL nosotros.</p></div>
        <div class="padmin-field" style="margin:0 0 12px;"><label>Posición (menor = primero)</label><input id="social-position" type="number" min="0" value="0" style="max-width:140px;"></div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="submit" class="padmin-btn padmin-btn-sm" ${state.socialBusy ? 'disabled' : ''}>${state.socialBusy ? 'Resolviendo…' : 'Agregar'}</button>
          <button type="button" class="padmin-btn-outline" data-action="close-social-form" ${state.socialBusy ? 'disabled' : ''}>Cancelar</button>
          <span style="font-size:11px;color:var(--text-mute);margin-left:6px;">Al agregar resolvemos el embed y dejamos el post listo para publicar.</span>
        </div>
      </form>
    </div>`
  ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-social-form">+ Agregar URL</button>';

  return `<div>
    <h1 class="padmin-h1">Producciones CREA</h1>
    <p class="padmin-lede">Videos y clips de redes sociales que se muestran en la sección pública <code>/producciones</code>. TikTok, YouTube, Facebook e Instagram soportados.</p>
    ${formHtml}
    <div class="padmin-card">
      <div class="padmin-table-head padmin-cols-social"><span></span><span>RED</span><span>TÍTULO / URL</span><span>POSICIÓN</span><span>ESTADO</span><span></span></div>
      ${posts.length ? posts.map((p: SocialPost) => {
        const pub = p.is_published ? { label: 'Publicado', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Borrador', bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
        const titleLine = p.title ? `<p class="padmin-row-title" style="margin:0 0 2px;">${esc(p.title)}</p>` : '<p class="padmin-row-title" style="margin:0 0 2px;color:var(--mute-2);">(sin título)</p>';
        return `<div class="padmin-table-row padmin-cols-social">
          ${p.thumbnail_url ? `<img src="${esc(p.thumbnail_url)}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:4px;background:var(--line-soft);">` : '<div style="width:42px;height:42px;background:var(--line-soft);border-radius:4px;"></div>'}
          <span style="font-size:12px;font-weight:600;color:var(--brand);text-transform:uppercase;">${esc(p.network)}</span>
          <div style="min-width:0;">${titleLine}<p class="padmin-row-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px;">${esc(p.external_url)}</p></div>
          <span style="font-size:12px;color:var(--text);">${p.position}</span>
          <span class="padmin-badge" style="background:${pub.bg};color:${pub.color};width:fit-content;">${pub.label}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-social" data-id="${p.id}" data-pub="${!p.is_published}">${p.is_published ? 'Despublicar' : 'Publicar'}</button>
            <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="refetch-social" data-id="${p.id}">Refetch</button>
            ${state.user!.role === 'director' ? `<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-social" data-id="${p.id}">Borrar</button>` : ''}
          </div>
        </div>`;
      }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Aún no hay producciones. Agrega una URL de TikTok, YouTube, Facebook o Instagram para empezar.</p></div>'}
    </div>
  </div>`;
}

export function renderPublicadas(): string {
  const published = state.data.proposalsByKey.published;
  if (!published) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();
  const rows = published.map((p: Proposal) =>
    `<div class="padmin-row" style="flex-wrap:wrap;gap:8px;">
      <div style="min-width:0;">
        <p class="padmin-row-title">${esc(p.title)}</p>
        <p class="padmin-row-meta">${esc(p.section || '')}${p.published_at ? ' · publicada ' + esc(relativeTime(p.published_at)) : ''}${p.author_name ? ' · ' + esc(p.author_name) : ''}${p.view_count != null ? ' · ' + p.view_count + ' vistas' : ''}</p>
      </div>
      <span style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="reopen-published" data-id="${p.id}">Editar</button>
        ${state.user!.role === 'director' ? `<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-published" data-id="${p.id}" data-title="${esc(p.title)}">Eliminar</button>` : ''}
      </span>
    </div>`
  ).join('');
  return `<div>
    <h1 class="padmin-h1">Publicadas</h1>
    <p class="padmin-lede">Notas visibles en el sitio. "Editar" la regresa a borrador y sale del sitio hasta que se vuelva a publicar tras pasar por revisión.</p>
    <div class="padmin-card">${rows || '<div class="padmin-row"><p class="padmin-row-meta">Todavía no hay notas publicadas.</p></div>'}</div>
  </div>`;
}
