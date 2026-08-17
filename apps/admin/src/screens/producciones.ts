// CREA Panel Admin — pantallas Producciones (social embeds) y Publicadas.
import { state, type SocialPost, type Proposal } from '../store';
import { esc, loadingCard, errorCard, relativeTime, badge, paginateRows, renderPager, safeHttpUrl } from '../util';
import { icon, type IconName } from '../icons';

const NETWORK_COLORS: Record<string, { color: string; iconName: IconName }> = {
  tiktok: { color: '#EE1D52', iconName: 'tiktok' },
  youtube: { color: '#FF0000', iconName: 'youtube' },
  facebook: { color: '#1877F2', iconName: 'facebook' },
  instagram: { color: '#E4405F', iconName: 'instagram' },
};

export function renderProducciones(): string {
  const posts = state.data.socialPosts;
  if (!posts) return state.dataError ? errorCard({ message: state.dataError }) : loadingCard();

  const netFilter = state.produccionesNetwork || 'todas';
  const statusFilter = state.produccionesStatus || 'todos';
  const search = (state.produccionesSearch || '').trim().toLowerCase();

  const filtered = posts.filter((p: SocialPost) => {
    if (netFilter !== 'todas' && p.network !== netFilter) return false;
    if (statusFilter === 'publicados' && !p.is_published) return false;
    if (statusFilter === 'borradores' && p.is_published) return false;
    if (search) {
      const matchTitle = (p.title || '').toLowerCase().includes(search);
      const matchAuthor = (p.author_name || '').toLowerCase().includes(search);
      const matchUrl = (p.external_url || '').toLowerCase().includes(search);
      if (!matchTitle && !matchAuthor && !matchUrl) return false;
    }
    return true;
  });

  const { pageItems, page, totalPages } = paginateRows(filtered, state.produccionesPage);
  const totalPublished = posts.filter((p: SocialPost) => p.is_published).length;
  const totalDrafts = posts.length - totalPublished;

  const networks = [
    { id: 'todas', label: 'Todas las redes' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'instagram', label: 'Instagram' },
  ];

  const statuses = [
    { id: 'todos', label: 'Todos' },
    { id: 'publicados', label: `Publicados (${totalPublished})` },
    { id: 'borradores', label: `Borradores (${totalDrafts})` },
  ];

  const errorHtml = state.formError ? `<p class="padmin-lede" style="color:var(--danger);">${esc(state.formError)}</p>` : '';
  const formHtml = state.form?.kind === 'social' ? (
    `<div class="padmin-card" style="padding:18px;margin-bottom:18px;max-width:760px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <p class="padmin-section-title" style="margin:0;">Agregar nueva producción social</p>
        <span id="social-detected-network" class="padmin-badge" style="display:none;background:var(--brand-soft);color:var(--brand);font-size:11px;"></span>
      </div>
      ${errorHtml}
      <form data-action="submit-social">
        <div class="padmin-field" style="margin:0 0 12px;">
          <label>URL del video o post (TikTok, YouTube, Facebook o Instagram)</label>
          <input id="social-url" type="text" required placeholder="Pega el enlace directo o código iframe de Facebook...">
          <p class="padmin-row-meta" style="margin:4px 0 0;">Soporta enlaces de videos normales, shorts, reels o código embed.</p>
        </div>
        <div class="padmin-grid2" style="gap:12px;margin-bottom:14px;">
          <div class="padmin-field" style="margin:0;">
            <label>Posición en la web (0 = primero)</label>
            <input id="social-position" type="number" min="0" value="0">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button type="submit" class="padmin-btn padmin-btn-brand padmin-btn-sm" ${state.socialBusy ? 'disabled' : ''}>
            ${state.socialBusy ? 'Resolviendo embed…' : `${icon('sparkles', { size: 13, style: 'vertical-align:-2px;margin-right:4px;' })} Guardar y resolver`}
          </button>
          <button type="button" class="padmin-btn-outline" data-action="close-social-form" ${state.socialBusy ? 'disabled' : ''}>Cancelar</button>
        </div>
      </form>
    </div>`
  ) : '';

  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
      <div>
        <h1 class="padmin-h1" style="margin-bottom:4px;">Producciones CREA</h1>
        <p class="padmin-lede" style="margin:0;">Videos, emisiones de Tercer Tiempo y clips de redes visibles en <code>/producciones</code>.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="sync-facebook-social" ${state.socialSyncBusy ? 'disabled' : ''} title="Escanear Facebook de CREA Contenidos para importar los últimos videos y directos">
          ${state.socialSyncBusy ? 'Sincronizando Facebook…' : `${icon('refresh', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Sincronizar Facebook CREA`}
        </button>
        ${state.form?.kind !== 'social' ? `<button type="button" class="padmin-btn padmin-btn-brand padmin-btn-sm" data-action="open-social-form">${icon('plus', { size: 12, style: 'vertical-align:-1px;margin-right:4px;' })} Agregar video o URL</button>` : ''}
      </div>
    </div>

    <!-- Barra de resumen métrico -->
    <div class="padmin-pipeline-metrics-bar">
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">TOTAL VIDEOS</span>
        <span class="padmin-pipeline-metric-value">${posts.length}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">PUBLICADOS EN SITIO</span>
        <span class="padmin-pipeline-metric-value" style="color:var(--brand);">${totalPublished}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">BORRADORES</span>
        <span class="padmin-pipeline-metric-value" style="color:var(--text-mute);">${totalDrafts}</span>
      </div>
      <div class="padmin-pipeline-metric-item">
        <span class="padmin-pipeline-metric-label">REDES ACTIVAS</span>
        <span class="padmin-pipeline-metric-value" style="font-size:13px;font-weight:500;">
          TikTok (${posts.filter((p: SocialPost) => p.network === 'tiktok').length}) · YT (${posts.filter((p: SocialPost) => p.network === 'youtube').length}) · FB (${posts.filter((p: SocialPost) => p.network === 'facebook').length}) · IG (${posts.filter((p: SocialPost) => p.network === 'instagram').length})
        </span>
      </div>
    </div>

    ${formHtml}

    <!-- Barra de filtros y búsqueda -->
    <div class="padmin-card padmin-pipeline-action-bar" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:11px;font-weight:600;color:var(--text-mute);margin-right:4px;">RED:</span>
        ${networks.map((n) => {
          const active = netFilter === n.id;
          return `<button type="button" class="padmin-chip${active ? ' active' : ''}" data-action="set-producciones-network" data-value="${n.id}">${esc(n.label)}</button>`;
        }).join('')}
      </div>

      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:11px;font-weight:600;color:var(--text-mute);margin-right:4px;">ESTADO:</span>
        ${statuses.map((s) => {
          const active = statusFilter === s.id;
          return `<button type="button" class="padmin-chip${active ? ' active' : ''}" data-action="set-producciones-status" data-value="${s.id}">${esc(s.label)}</button>`;
        }).join('')}
      </div>

      <div style="display:flex;align-items:center;gap:6px;flex:1;max-width:320px;min-width:200px;">
        <input id="producciones-search-input" type="search" placeholder="Buscar por título, autor o URL…" value="${esc(state.produccionesSearch || '')}" style="width:100%;font-size:12px;padding:6px 10px;border-radius:6px;border:0.5px solid var(--line-soft);background:var(--bg-admin);color:var(--text);">
        ${state.produccionesSearch ? `<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="clear-producciones-search" style="padding:4px 8px;">&times;</button>` : ''}
      </div>
    </div>

    <!-- Listado de producciones -->
    <div class="padmin-card">
      <div class="padmin-table-head padmin-cols-social" style="grid-template-columns: 50px 100px 1fr 100px 110px 180px;">
        <span>MINI</span>
        <span>RED</span>
        <span>TÍTULO / AUTOR</span>
        <span style="text-align:center;">ORDEN</span>
        <span>ESTADO</span>
        <span style="text-align:right;">ACCIONES</span>
      </div>

      ${filtered.length ? pageItems.map((p: SocialPost) => {
        const netConf = NETWORK_COLORS[p.network] || { color: 'var(--brand)', iconName: 'film' as IconName };
        const safeExt = safeHttpUrl(p.external_url);

        return `<div class="padmin-table-row padmin-cols-social" style="grid-template-columns: 50px 110px 1fr 100px 110px 180px;align-items:center;">
          <div style="position:relative;cursor:pointer;" data-action="open-preview-social" data-id="${p.id}" title="Clic para previsualizar">
            ${safeHttpUrl(p.thumbnail_url)
              ? `<img src="${esc(safeHttpUrl(p.thumbnail_url))}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;background:var(--line-soft);border:0.5px solid var(--line-soft);" data-image-error="hide">`
              : `<div style="width:44px;height:44px;background:var(--line-soft);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text-mute);">${icon(netConf.iconName, { size: 18 })}</div>`}
          </div>

          <div>
            <span class="padmin-badge" style="background:var(--bg-soft);color:${netConf.color};font-weight:600;font-size:11px;display:inline-flex;align-items:center;gap:4px;">
              ${icon(netConf.iconName, { size: 12 })} ${esc(p.network.toUpperCase())}
            </span>
          </div>

          <div style="min-width:0;">
            <p class="padmin-row-title" style="margin:0 0 2px;font-size:13px;line-height:1.3;">${p.title ? esc(p.title) : '<span style="color:var(--mute-2);font-style:italic;">(Sin título resuelto)</span>'}</p>
            <div style="display:flex;gap:8px;align-items:center;font-size:11px;color:var(--text-mute);">
              ${p.author_name ? `<span>${esc(p.author_name)}</span> · ` : ''}
              ${safeExt ? `<a href="${esc(safeExt)}" target="_blank" rel="noopener noreferrer" style="color:var(--brand);text-decoration:none;display:inline-flex;align-items:center;gap:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;">${icon('externalLink', { size: 11 })} Ver original</a>` : ''}
            </div>
          </div>

          <!-- Posición con flechas -->
          <div style="display:flex;align-items:center;justify-content:center;gap:4px;">
            <button type="button" class="padmin-btn-sm padmin-btn-outline" style="padding:3px 6px;" data-action="move-produccion-pos" data-id="${p.id}" data-dir="up" title="Subir prioridad">${icon('chevronUp', { size: 12 })}</button>
            <span style="font-size:12px;font-weight:600;min-width:18px;text-align:center;">${p.position}</span>
            <button type="button" class="padmin-btn-sm padmin-btn-outline" style="padding:3px 6px;" data-action="move-produccion-pos" data-id="${p.id}" data-dir="down" title="Bajar prioridad">${icon('chevronDown', { size: 12 })}</button>
          </div>

          <div>
            ${badge(p.is_published ? 'publicado' : 'no_publicado')}
          </div>

          <div style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap;">
            <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="open-preview-social" data-id="${p.id}" title="Ver reproductor">${icon('eye', { size: 12, style: 'vertical-align:-1px;' })} Ver</button>
            <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-social" data-id="${p.id}" data-pub="${!p.is_published}">
              ${p.is_published ? 'Despublicar' : 'Publicar'}
            </button>
            <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="refetch-social" data-id="${p.id}" title="Reconsultar metadata">${icon('refresh', { size: 11 })}</button>
            ${state.user!.role === 'director' ? `<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-social" data-id="${p.id}" title="Eliminar">${icon('trash', { size: 11 })}</button>` : ''}
          </div>
        </div>`;
      }).join('') : `<div class="padmin-row"><p class="padmin-row-meta">${posts.length ? 'No hay producciones que coincidan con los filtros seleccionados.' : 'Aún no hay producciones. Agrega una URL de TikTok, YouTube, Facebook o Instagram para empezar.'}</p></div>`}

      ${renderPager(page, totalPages, filtered.length, 'set-producciones-page')}
    </div>

    ${renderPreviewSocialModal()}
  </div>`;
}

function renderPreviewSocialModal(): string {
  if (state.previewSocialId == null) return '';
  const posts = state.data.socialPosts || [];
  const post = posts.find((p: SocialPost) => p.id === state.previewSocialId);
  if (!post) return '';

  const safeExt = safeHttpUrl(post.external_url);

  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-preview-social"></div>
    <div class="padmin-modal" style="max-width:560px;" role="dialog" aria-modal="true" aria-label="Previsualización de video">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:8px;">
        <div>
          <p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">${esc(post.title || 'Previsualización de video')}</p>
          <p style="font-size:11px;color:var(--text-mute);margin:0;">Red: <strong>${esc(post.network.toUpperCase())}</strong> ${post.author_name ? `· Autor: ${esc(post.author_name)}` : ''}</p>
        </div>
        <button type="button" class="padmin-drawer-close" data-action="close-preview-social">&times;</button>
      </div>

      <div style="background:#000;border-radius:8px;overflow:hidden;min-height:300px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;">
        ${state.previewSocialLoading
          ? '<p style="color:#fff;font-size:13px;">Cargando reproductor…</p>'
          : (state.previewSocialEmbedHtml
              ? `<div style="width:100%;max-height:480px;overflow:auto;display:flex;justify-content:center;">${state.previewSocialEmbedHtml}</div>`
              : (safeHttpUrl(post.thumbnail_url)
                  ? `<div style="text-align:center;padding:20px;"><img src="${esc(safeHttpUrl(post.thumbnail_url))}" style="max-width:100%;max-height:280px;border-radius:4px;margin-bottom:8px;"><p style="color:#aaa;font-size:12px;">Vista previa no disponible directamente en iframe. Usa el enlace oficial.</p></div>`
                  : '<p style="color:#aaa;font-size:13px;">Sin vista previa disponible.</p>'))}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        ${safeExt ? `<a href="${esc(safeExt)}" target="_blank" rel="noopener noreferrer" class="padmin-btn-sm padmin-btn-outline" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;">${icon('externalLink', { size: 12 })} Abrir en ${esc(post.network)}</a>` : '<div></div>'}
        <div style="display:flex;gap:8px;">
          <button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-social" data-id="${post.id}" data-pub="${!post.is_published}">
            ${post.is_published ? 'Despublicar' : 'Publicar'}
          </button>
          <button type="button" class="padmin-btn-sm padmin-btn-brand" data-action="close-preview-social">Cerrar</button>
        </div>
      </div>
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
        ${state.user!.role === 'director' ? `<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="open-delete-published" data-id="${p.id}">Eliminar</button>` : ''}
      </span>
    </div>`
  ).join('');
  return `<div>
    <h1 class="padmin-h1">Publicadas</h1>
    <p class="padmin-lede">Notas visibles en el sitio. "Editar" la regresa a borrador y sale del sitio hasta que se vuelva a publicar tras pasar por revisión.</p>
    <div class="padmin-card">${rows || '<div class="padmin-row"><p class="padmin-row-meta">Todavía no hay notas publicadas.</p></div>'}</div>
    ${renderDeletePublishedModal()}
  </div>`;
}

function renderDeletePublishedModal(): string {
  if (state.deletePublishedId == null) return '';
  const published = state.data.proposalsByKey.published || [];
  const piece = published.filter((p: Proposal) => p.id === state.deletePublishedId)[0];
  if (!piece) return '';
  const errorHtml = state.deletePublishedError ? `<p style="font-size:12px;color:var(--danger);margin:0 0 10px;">${esc(state.deletePublishedError)}</p>` : '';
  return `<div class="padmin-overlay">
    <div class="padmin-overlay-bg" data-action="close-delete-published"></div>
    <div class="padmin-modal" role="dialog" aria-modal="true" aria-label="Eliminar nota publicada">
      <p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">Eliminar nota publicada</p>
      <p style="font-size:12px;color:var(--text-mute);margin:0 0 16px;">Esta nota está VIVA en el sitio. Para eliminarla, escribe (o copia y pega) su título exacto:</p>
      <div style="display:flex;align-items:center;gap:8px;background:var(--bg-admin);border:0.5px solid var(--line-soft);border-radius:6px;padding:8px 10px;margin-bottom:12px;">
        <p style="font-size:13px;color:var(--text);margin:0;flex:1;min-width:0;overflow-wrap:anywhere;">${esc(piece.title)}</p>
        <button type="button" class="padmin-btn-sm padmin-btn-outline" style="flex-shrink:0;" data-action="copy-delete-title" data-text="${esc(piece.title)}">Copiar</button>
      </div>
      <input id="delete-published-input" type="text" class="padmin-sponsor-input" style="font-size:13px;padding:9px 10px;margin-bottom:4px;" placeholder="Pega o escribe el título aquí" autocomplete="off">
      ${errorHtml}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button type="button" class="padmin-btn-outline" data-action="close-delete-published">Cancelar</button>
        <button type="button" class="padmin-btn padmin-btn-danger" data-action="confirm-delete-published" data-id="${piece.id}">Eliminar nota</button>
      </div>
    </div>
  </div>`;
}

