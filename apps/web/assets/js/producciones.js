// Producciones: feed de TikTok con embed on-demand por tarjeta.
// Externo (no inline) para cumplir la CSP sin abrir 'unsafe-inline'.
(function () {
  var grid = document.getElementById('prod-grid');
  if (!grid) return;

  function renderError(title, body) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;">' +
      '<p class="card-title" style="font-size:16px;margin:0 0 6px;">' + esc(title) + '</p>' +
      '<p class="card-dek" style="margin:0 auto;max-width:420px;color:var(--text);">' + esc(body) + '</p></div>';
  }

  function renderEmpty() {
    renderError('Aún no hay producciones', 'La redacción está preparando los videos. Vuelve pronto o escríbenos a comunidad@crea-contenidos.com.');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var apiBase = window.CREA_API_BASE;

  fetch(apiBase + '/api/public/social?network=tiktok&limit=24')
    .then(function (res) { if (!res.ok) throw new Error('API ' + res.status); return res.json(); })
    .then(function (posts) {
      if (!posts.length) { renderEmpty(); return; }
      grid.innerHTML = posts.map(function (p) {
        return '<article class="prod-card" data-post-id="' + p.id + '">' +
          '<div class="prod-embed" data-embed-mount>' +
            (p.thumbnail_url ? '<img class="prod-thumb" src="' + esc(p.thumbnail_url) + '" alt="">' : '') +
          '</div>' +
          '<div class="prod-meta">' +
            '<p class="prod-author">' + esc(p.author_name || '@' + p.network) + '</p>' +
            '<p class="prod-title">' + esc(p.title || p.external_url) + '</p>' +
            '<a class="prod-cta" href="' + esc(p.external_url) + '" target="_blank" rel="noopener noreferrer">Ver en ' + esc(p.network) + ' &rarr;</a>' +
          '</div>' +
        '</article>';
      }).join('');

      // Resolver el iframe on-demand por tarjeta. Si falla, dejamos el thumbnail + link
      // (el feed nunca queda roto aunque TikTok esté caído).
      posts.forEach(function (p) {
        fetch(apiBase + '/api/public/social/' + p.id + '/embed')
          .then(function (res) { return res.json(); })
          .then(function (data) {
            var mount = grid.querySelector('[data-post-id="' + p.id + '"] [data-embed-mount]');
            if (!mount) return;
            if (data.embed_html) {
              mount.innerHTML = data.embed_html;
            } else {
              mount.innerHTML = '<div class="prod-fallback"><p>No pudimos cargar el reproductor ahora mismo.</p><a href="' + esc(p.external_url) + '" target="_blank" rel="noopener noreferrer">Abrir en ' + esc(p.network) + ' &rarr;</a></div>';
            }
          })
          .catch(function () {
            var mount = grid.querySelector('[data-post-id="' + p.id + '"] [data-embed-mount]');
            if (!mount) return;
            mount.innerHTML = '<div class="prod-fallback"><p>No pudimos cargar el reproductor ahora mismo.</p><a href="' + esc(p.external_url) + '" target="_blank" rel="noopener noreferrer">Abrir en ' + esc(p.network) + ' &rarr;</a></div>';
          });
      });
    })
    .catch(function () {
      renderError('La redacción está teniendo un detalle técnico', 'No pudimos cargar las producciones en este momento. Vuelve a intentarlo en unos minutos.');
    });
})();
