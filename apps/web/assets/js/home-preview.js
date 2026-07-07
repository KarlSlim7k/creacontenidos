// Portada: tira de miniaturas de las últimas producciones de TikTok.
// Externo (no inline) para cumplir la CSP sin abrir 'unsafe-inline'.
(function () {
  var preview = document.getElementById('prod-preview');
  if (!preview) return;
  fetch(window.CREA_API_BASE + '/api/public/social?network=tiktok&limit=3')
    .then(function (r) { return r.json(); })
    .then(function (posts) {
      if (!posts.length) { preview.style.display = 'none'; return; }
      preview.innerHTML = posts.map(function (p) {
        return '<a href="producciones.html" style="display:block;width:100px;height:140px;border-radius:8px;overflow:hidden;flex-shrink:0;background:#000;">' +
          (p.thumbnail_url ? '<img src="' + esc(p.thumbnail_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;">' : '<div style="width:100%;height:100%;background:#2F5233;"></div>') +
        '</a>';
      }).join('');
    })
    .catch(function () { preview.style.display = 'none'; });
})();
