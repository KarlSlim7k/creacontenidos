// CREA Contenidos — shared vanilla JS (mobile menu + API-driven portal pages)

// ---------- API helper ----------

var CREA_API_BASE = (function () {
  var meta = document.querySelector('meta[name="crea-api-base"]');
  var base = (meta && meta.content) || 'http://localhost:3000';
  // Meta quedó en localhost (default dev) pero la página se sirve desde otro host:
  // usar mismo origen (el API sirve web y /api juntos en prod).
  if (base.indexOf('localhost') !== -1 && location.hostname !== 'localhost') return '';
  return base;
})();

function creaApi(path) {
  return fetch(CREA_API_BASE + path).then(function (res) {
    if (!res.ok) {
      var err = new Error('API respondió ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  });
}

var CREA_SECTIONS = ['Local', 'Cultura', 'Economía', 'Entretenimiento', 'Deportes', 'Opinión'];

// ---------- small helpers ----------

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// "hace 2 horas" / "ayer" / "hace 3 días" — es-MX via Intl.RelativeTimeFormat
function timeAgo(iso) {
  var seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (!isFinite(seconds)) return '';
  if (Math.abs(seconds) < 60) return 'hace un momento';
  var rtf = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
  var units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (var i = 0; i < units.length; i++) {
    if (Math.abs(seconds) >= units[i][1]) return rtf.format(Math.round(seconds / units[i][1]), units[i][0]);
  }
}

function setMetaContent(selector, value) {
  var el = document.querySelector(selector);
  if (el) el.setAttribute('content', value);
}

function notaHref(a) {
  return 'nota.html?slug=' + encodeURIComponent(a.slug);
}

function perfilHref(name) {
  return 'perfil.html?autor=' + encodeURIComponent(name);
}

function initials(name) {
  return String(name || '').split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
}

// Cover image if the article has one; otherwise the design's photo placeholder ("foto: …").
// `alt` solo cuando la imagen va sola (nota); en tarjetas el título ya está en el mismo
// link, así que alt="" evita que el lector de pantalla lo lea dos veces.
function coverHtml(a, cls, style, alt) {
  var inner = a.cover_image_url
    ? '<img src="' + esc(a.cover_image_url) + '" alt="' + esc(alt || '') + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
    : '<span class="cap">foto: ' + esc((a.section || 'CREA').toLowerCase()) + '</span>';
  return '<div class="img-ph' + (cls ? ' ' + cls : '') + '"' + (style ? ' style="' + style + '"' : '') + '>' + inner + '</div>';
}

// Dignified empty/error state with brand tone; never a broken page.
function renderEmptyState(mount, title, body, cta) {
  mount.innerHTML =
    '<div class="panel" style="grid-column:1/-1;text-align:center;padding:36px 20px;">' +
      '<div class="eyebrow" style="margin-bottom:8px;">CREA CONTENIDOS</div>' +
      '<p class="card-title" style="font-size:16px;margin:0 0 6px;">' + esc(title) + '</p>' +
      // color:var(--text): --text-mute sobre el fondo --bg-2 del panel queda en ~3.9:1, bajo AA.
      '<p class="card-dek" style="margin:0 auto;max-width:420px;color:var(--text);">' + esc(body) + '</p>' +
      (cta ? '<a href="' + esc(cta.href) + '" class="eyebrow" style="display:inline-block;margin-top:14px;">' + esc(cta.label) + ' &rarr;</a>' : '') +
    '</div>';
}

var CREA_OFFLINE = {
  title: 'La redacción está teniendo un detalle técnico',
  body: 'No pudimos cargar las notas en este momento. Vuelve a intentarlo en unos minutos; seguimos trabajando desde Perote.'
};

// ---------- shared UI ----------

function initMobileMenu() {
  var toggle = document.querySelector('[data-menu-toggle]');
  var menu = document.querySelector('.mobile-menu');
  if (!toggle || !menu) return;
  toggle.setAttribute('aria-expanded', 'false');
  var open = function () { menu.classList.add('open'); toggle.setAttribute('aria-expanded', 'true'); };
  var close = function () { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', open);
  menu.querySelectorAll('[data-menu-close]').forEach(function (el) {
    el.addEventListener('click', close);
  });
}

// Los chips son <button> tipo toggle: aria-pressed refleja la clase .active.
function setChipActive(chip, on) {
  chip.classList.toggle('active', on);
  chip.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function initChips(selector, onSelect) {
  var chips = document.querySelectorAll(selector);
  chips.forEach(function (chip) {
    chip.setAttribute('aria-pressed', chip.classList.contains('active') ? 'true' : 'false');
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { setChipActive(c, false); });
      setChipActive(chip, true);
      if (onSelect) onSelect(chip.dataset.value, chip);
    });
  });
}

// ---------- portada ----------

function renderHomePage() {
  var hero = document.querySelector('[data-home-hero]');
  if (!hero) return;
  var sectionGrids = document.querySelectorAll('[data-home-section]');
  var hideSections = function () {
    sectionGrids.forEach(function (grid) { grid.closest('.section-block').hidden = true; });
  };

  // ponytail: one request for the whole seed catalog (24 notas); if the archive grows
  // past ~15 per section, switch to one request per section block.
  creaApi('/api/public/articles?limit=100').then(function (articles) {
    hero.innerHTML = articles.slice(0, 4).map(function (a, i) {
      return '<article>' +
        '<a href="' + notaHref(a) + '">' +
          coverHtml(a, 'ratio-4-3' + (i === 0 ? ' featured' : ''), 'margin-bottom:10px;') +
          '<div class="eyebrow" style="margin-bottom:6px;">' + esc(a.section.toUpperCase()) + '</div>' +
          '<h2 class="card-title" style="font-size:17px;line-height:1.3;margin-bottom:6px;">' + esc(a.title) + '</h2>' +
        '</a>' +
        '<p class="card-dek" style="margin-bottom:8px;">' + esc(a.dek) + '</p>' +
        '<div class="card-byline">Por ' + esc(a.author_name) + ' &middot; ' + timeAgo(a.published_at) + '</div>' +
      '</article>';
    }).join('');

    sectionGrids.forEach(function (grid) {
      var section = grid.dataset.homeSection;
      var list = articles.filter(function (a) { return a.section === section; }).slice(0, 4);
      if (!list.length) { grid.closest('.section-block').hidden = true; return; }
      grid.innerHTML = list.map(function (a) {
        return '<article>' +
          '<a href="' + notaHref(a) + '">' + coverHtml(a, 'ratio-4-3', 'margin-bottom:8px;') + '</a>' +
          '<div class="eyebrow" style="margin-bottom:5px;">' + esc(section.toUpperCase()) + '</div>' +
          '<h3 class="card-title" style="font-size:13px;margin-bottom:5px;font-weight:500;"><a href="' + notaHref(a) + '">' + esc(a.title) + '</a></h3>' +
          '<p class="card-dek">' + esc(a.dek) + '</p>' +
        '</article>';
      }).join('');
    });
  }).catch(function () {
    renderEmptyState(hero, CREA_OFFLINE.title, CREA_OFFLINE.body);
    hideSections();
  });
}

// ---------- sección ----------

function renderSectionPage() {
  var mount = document.querySelector('[data-section-page]');
  if (!mount) return;
  var name = qs('s');
  if (CREA_SECTIONS.indexOf(name) === -1) name = 'Local';

  document.title = name + ' · CREA Contenidos';
  document.querySelectorAll('[data-section-name]').forEach(function (el) { el.textContent = name; });
  document.querySelectorAll('.ed-nav a').forEach(function (a) {
    a.classList.toggle('active', a.dataset.section === name);
  });

  var list = mount.querySelector('[data-article-list]');
  creaApi('/api/public/articles?section=' + encodeURIComponent(name)).then(function (articles) {
    if (!articles.length) {
      renderEmptyState(list, 'Aún no hay notas en ' + name, 'La redacción está preparando la cobertura de esta sección. Vuelve pronto.', { href: 'index.html', label: 'Volver a portada' });
      return;
    }
    list.innerHTML = articles.map(function (a) {
      return '<div style="display:flex;gap:16px;padding:16px 0;border-bottom:0.5px solid var(--line);">' +
        coverHtml(a, '', 'width:140px;height:96px;flex-shrink:0;') +
        '<div><h2 class="card-title" style="font-size:15px;margin-bottom:8px;line-height:1.35;font-weight:500;"><a href="' + notaHref(a) + '">' + esc(a.title) + '</a></h2>' +
        '<div class="card-byline"><a href="' + perfilHref(a.author_name) + '">' + esc(a.author_name) + '</a> &middot; ' + timeAgo(a.published_at) + '</div></div></div>';
    }).join('');
  }).catch(function () {
    renderEmptyState(list, CREA_OFFLINE.title, CREA_OFFLINE.body);
  });

  var mostRead = mount.querySelector('[data-most-read]');
  if (mostRead) {
    creaApi('/api/public/articles?sort=views&limit=3').then(function (articles) {
      mostRead.innerHTML = articles.map(function (a, i) {
        var last = i === articles.length - 1;
        return '<div class="most-read-item"' + (last ? ' style="border-bottom:none;margin-bottom:0;"' : '') + '>' +
          '<div class="rank">' + String(i + 1).padStart(2, '0') + '</div>' +
          '<p><a href="' + notaHref(a) + '" style="color:inherit;">' + esc(a.title) + '</a></p></div>';
      }).join('');
    }).catch(function () { mostRead.hidden = true; });
  }
}

// ---------- nota ----------

function renderNotaPage() {
  var mount = document.querySelector('[data-nota-page]');
  if (!mount) return;
  var relatedBlock = document.querySelector('[data-related-block]');
  var slug = qs('slug');
  var fail = function (title, body) {
    renderEmptyState(mount, title, body, { href: 'index.html', label: 'Volver a portada' });
    if (relatedBlock) relatedBlock.hidden = true;
  };
  if (!slug) return fail('No encontramos esta nota', 'El enlace parece incompleto. Te esperamos en la portada con lo más reciente de Perote.');

  // Fire-and-forget: cuenta la vista para "lo más leído". Si falla, no afecta la lectura.
  fetch(CREA_API_BASE + '/api/public/articles/' + encodeURIComponent(slug) + '/view', { method: 'POST' }).catch(function () {});

  creaApi('/api/public/articles/' + encodeURIComponent(slug)).then(function (a) {
    document.title = a.title + ' · CREA Contenidos';
    // SEO/OG: actualiza los meta genéricos de nota.html con la nota real. Limitación
    // conocida (documentada en el <head>): crawlers sin JS no ven estos valores.
    setMetaContent('meta[name="description"]', a.dek || '');
    setMetaContent('meta[property="og:title"]', a.title + ' · CREA Contenidos');
    setMetaContent('meta[property="og:description"]', a.dek || '');
    setMetaContent('meta[property="og:url"]', window.location.href);
    if (a.cover_image_url) setMetaContent('meta[property="og:image"]', a.cover_image_url);
    var body = String(a.body || '');
    var minutes = Math.max(1, Math.round(body.split(/\s+/).length / 200));
    var fecha = new Date(a.published_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    var paras = body.split(/\n\s*\n/).filter(Boolean).map(function (p) {
      return '<p style="font-size:16px;line-height:1.75;margin:0 0 18px;">' + esc(p) + '</p>';
    });
    // Banner de aliados solo en notas no patrocinadas (una nota patrocinada ya
    // lleva su propio crédito más abajo, vía renderRelated → sponsor_name real).
    if (!a.is_sponsored) {
      var sponsorCta =
        '<div style="background:var(--bg-3);border-radius:8px;padding:18px 20px;margin-bottom:24px;">' +
          '<div class="eyebrow" style="margin-bottom:8px;">ALIADOS DE CREA</div>' +
          '<p style="font-size:13px;margin:0;line-height:1.55;">Esta cobertura es posible gracias a los negocios que patrocinan a CREA. <a href="patrocinado.html" style="color:var(--accent-text);text-decoration:underline;">Conoce el contenido patrocinado</a> &middot; <a href="estudio/servicios.html" style="color:var(--accent-text);text-decoration:underline;">Conoce cómo patrocinar</a></p>' +
        '</div>';
      paras.splice(Math.min(2, paras.length), 0, sponsorCta);
    } else {
      paras.push(
        '<div style="background:var(--bg-3);border-radius:8px;padding:14px 18px;font-size:12px;color:var(--text-mute);">' +
          'Contenido patrocinado por <strong style="color:var(--text);">' + esc(a.sponsor_name || 'un aliado de CREA') + '</strong>.' +
        '</div>'
      );
    }

    mount.innerHTML =
      '<a href="seccion.html?s=' + encodeURIComponent(a.section) + '" class="eyebrow" style="display:block;margin-bottom:10px;">' + esc(a.section.toUpperCase()) + (a.is_sponsored ? ' &middot; CONTENIDO PATROCINADO' : '') + '</a>' +
      '<h1 style="font-size:34px;line-height:1.2;margin:0 0 16px;">' + esc(a.title) + '</h1>' +
      '<div style="display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:0.5px solid var(--line);margin-bottom:24px;">' +
        '<a href="' + perfilHref(a.author_name) + '" class="avatar" style="width:36px;height:36px;"><span style="font-size:13px;">' + esc(initials(a.author_name)) + '</span></a>' +
        '<div style="font-size:12px;color:var(--text-mute);">' +
          '<a href="' + perfilHref(a.author_name) + '" style="color:var(--text);font-weight:500;">' + esc(a.author_name) + '</a> &middot; ' + esc(fecha) + ' &middot; ' + minutes + ' min de lectura' +
        '</div>' +
      '</div>' +
      coverHtml(a, 'featured ratio-16-9', 'margin-bottom:24px;', a.title) +
      paras.join('') +
      '<a href="' + perfilHref(a.author_name) + '" style="display:flex;gap:14px;align-items:center;background:var(--bg-2);border:0.5px solid var(--line);border-radius:8px;padding:16px 18px;margin:28px 0;">' +
        '<div class="avatar" style="width:44px;height:44px;"><span style="font-size:15px;">' + esc(initials(a.author_name)) + '</span></div>' +
        '<div>' +
          '<p style="font-size:13px;font-weight:600;margin:0 0 2px;">' + esc(a.author_name) + '</p>' +
          '<p style="font-size:12px;color:var(--text-mute);margin:0;">Colabora en CREA Contenidos &middot; Ver perfil</p>' +
        '</div>' +
      '</a>';

    renderRelated(a);
  }).catch(function (err) {
    if (err.status === 404) {
      fail('No encontramos esta nota', 'Puede que ya no esté disponible o que el enlace esté incompleto. Te esperamos en la portada.');
    } else {
      fail(CREA_OFFLINE.title, CREA_OFFLINE.body);
    }
  });
}

function renderRelated(article) {
  var relatedBlock = document.querySelector('[data-related-block]');
  if (!relatedBlock) return;
  var grid = relatedBlock.querySelector('[data-related]');
  creaApi('/api/public/articles?section=' + encodeURIComponent(article.section) + '&limit=4').then(function (articles) {
    var others = articles.filter(function (a) { return a.slug !== article.slug; }).slice(0, 3);
    if (!others.length) { relatedBlock.hidden = true; return; }
    grid.innerHTML = others.map(function (a) {
      return '<a href="' + notaHref(a) + '">' + coverHtml(a, 'ratio-4-3', 'margin-bottom:8px;') +
        '<h3 class="card-title" style="font-size:13px;line-height:1.4;font-weight:500;">' + esc(a.title) + '</h3></a>';
    }).join('');
    relatedBlock.hidden = false;
  }).catch(function () {
    relatedBlock.hidden = true;
  });
}

// ---------- patrocinado ----------

function sponsorCardHtml(a) {
  var inner = a.cover_image_url
    ? '<img src="' + esc(a.cover_image_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
    : '<span class="cap">foto: ' + esc((a.sponsor_name || 'CREA').toLowerCase()) + '</span>';
  return '<article><a href="' + notaHref(a) + '">' +
      '<div class="img-ph ratio-4-3" style="margin-bottom:8px;">' + inner + '<span class="sponsored-tag">CONTENIDO PATROCINADO</span></div></a>' +
    '<p class="card-title" style="font-size:13px;margin-bottom:5px;"><a href="' + notaHref(a) + '">' + esc(a.title) + '</a></p>' +
    '<p class="card-dek" style="margin-bottom:6px;">' + esc(a.dek) + '</p>' +
    '<div style="font-size:11px;color:var(--accent-text);font-weight:500;">Patrocinado por: ' + esc(a.sponsor_name || 'CREA Contenidos') + '</div></article>';
}

function renderSponsorStrip() {
  var mount = document.querySelector('[data-sponsor-strip]');
  var banner = document.querySelector('[data-sponsor-banner]');
  if (!mount && !banner) return;
  creaApi('/api/public/articles?sponsored=true&limit=3').then(function (articles) {
    if (mount) {
      if (!articles.length) mount.closest('.section-block').hidden = true;
      else mount.innerHTML = articles.map(sponsorCardHtml).join('');
    }
    if (banner) {
      if (articles.length) {
        banner.querySelector('[data-sponsor-banner-text]').textContent =
          (articles[0].section || 'Cobertura local') + ' presentada por ' + (articles[0].sponsor_name || 'un aliado de CREA');
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
    }
  }).catch(function () {
    if (mount) mount.closest('.section-block').hidden = true;
    if (banner) banner.hidden = true;
  });
}

function renderPatrocinadoPage() {
  var mount = document.querySelector('[data-patrocinado-page]');
  if (!mount) return;
  creaApi('/api/public/articles?sponsored=true&limit=50').then(function (articles) {
    if (!articles.length) {
      renderEmptyState(mount, 'Aún no hay contenido patrocinado', 'Cuando publiquemos una colaboración con alguna marca la vas a encontrar aquí.', { href: 'estudio/servicios.html', label: 'Conoce cómo patrocinar' });
      return;
    }
    mount.innerHTML = articles.map(sponsorCardHtml).join('');
  }).catch(function () {
    renderEmptyState(mount, CREA_OFFLINE.title, CREA_OFFLINE.body);
  });
}

// ---------- estudio: marcas patrocinadoras ----------

// Deriva la lista de marcas reales a partir de las notas patrocinadas publicadas
// (no hay tabla de "clientes destacados" separada: la fuente de verdad es la
// misma nota patrocinada). Usado en estudio/index.html, media-kit.html y
// tercer-tiempo.html — todas comparten el stat-card "marcas activas".
function renderEstudioSponsors() {
  var countEls = document.querySelectorAll('[data-active-brands]');
  var logosMount = document.querySelector('[data-sponsor-logos]');
  var highlightsMount = document.querySelector('[data-sponsor-highlights]');
  if (!countEls.length && !logosMount && !highlightsMount) return;

  creaApi('/api/public/articles?sponsored=true&limit=50').then(function (articles) {
    var bySponsor = {};
    articles.forEach(function (a) {
      var name = a.sponsor_name || 'CREA Contenidos';
      if (!bySponsor[name]) bySponsor[name] = a;
    });
    var sponsors = Object.keys(bySponsor).map(function (name) { return bySponsor[name]; });

    countEls.forEach(function (el) { el.textContent = sponsors.length; });

    if (logosMount) {
      if (!sponsors.length) { logosMount.hidden = true; }
      else {
        logosMount.innerHTML = sponsors.slice(0, 4).map(function (a) {
          return '<div class="panel" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 10px;">' +
            '<div style="width:26px;height:26px;border-radius:6px;background:var(--bg-3);"></div>' +
            '<span style="font-size:10px;color:var(--text-mute);text-align:center;">' + esc(a.sponsor_name) + '</span></div>';
        }).join('');
      }
    }

    if (highlightsMount) {
      if (!sponsors.length) { highlightsMount.hidden = true; }
      else {
        // Sin cotas inventadas: solo el hecho verificable (qué patrocinan y su nota),
        // no una cita de cliente que nadie dijo.
        highlightsMount.innerHTML = sponsors.slice(0, 2).map(function (a) {
          return '<a class="testimonial-card" href="../nota.html?slug=' + encodeURIComponent(a.slug) + '" style="display:block;">' +
            '<p class="quote">' + esc(a.title) + '</p>' +
            '<p class="who">' + esc(a.sponsor_name) + ' &middot; Contenido patrocinado en ' + esc(a.section) + '</p>' +
          '</a>';
        }).join('');
      }
    }
  }).catch(function () {
    countEls.forEach(function (el) { el.textContent = '—'; });
    if (logosMount) logosMount.hidden = true;
    if (highlightsMount) highlightsMount.hidden = true;
  });
}

// ---------- estudio: métricas de audiencia ----------

// Antes copiadas a mano en estudio/index.html, media-kit.html y tercer-tiempo.html.
// Ahora una sola fila en site_metrics (editable en el panel admin → Configuración).
function renderSiteMetrics() {
  var els = document.querySelectorAll('[data-metric-reach],[data-metric-municipios],[data-metric-listeners],[data-metric-age-18-24],[data-metric-age-25-44],[data-metric-age-45-plus],[data-metric-updated]');
  if (!els.length) return;

  creaApi('/api/public/site-metrics').then(function (m) {
    document.querySelectorAll('[data-metric-reach]').forEach(function (el) { el.textContent = m.monthly_reach_label; });
    document.querySelectorAll('[data-metric-municipios]').forEach(function (el) { el.textContent = m.municipalities_count; });
    document.querySelectorAll('[data-metric-listeners]').forEach(function (el) { el.textContent = m.tercer_tiempo_listeners_label; });
    setAgeBar('18-24', m.audience_age_18_24_pct);
    setAgeBar('25-44', m.audience_age_25_44_pct);
    setAgeBar('45-plus', m.audience_age_45_plus_pct);
    document.querySelectorAll('[data-metric-updated]').forEach(function (el) {
      el.textContent = 'Actualizado ' + new Date(m.updated_at).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    });
  }).catch(function () {
    els.forEach(function (el) { if (el.tagName !== 'DIV') el.textContent = '—'; });
  });
}

function setAgeBar(key, pct) {
  document.querySelectorAll('[data-metric-age-' + key + ']').forEach(function (el) { el.textContent = pct + '%'; });
  document.querySelectorAll('[data-metric-age-bar-' + key + ']').forEach(function (el) { el.style.width = pct + '%'; });
}

// ---------- comunidad: colaboradores activos ----------

// Antes 5 nombres fijos en comunidad.html. Se deriva de content_proposals (mismo
// espíritu que renderEstudioSponsors): autores reales con notas ya publicadas.
function renderColaboradores() {
  var mount = document.querySelector('[data-colaboradores]');
  if (!mount) return;

  creaApi('/api/public/authors').then(function (authors) {
    if (!authors.length) { mount.hidden = true; return; }
    mount.innerHTML = authors.map(function (a) {
      var initials = a.author_name.split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
      var sections = (a.sections || []).slice(0, 2).join(' y ');
      return '<a href="perfil.html?autor=' + encodeURIComponent(a.author_name) + '" style="display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:0.5px solid var(--line);">' +
        '<div class="avatar" style="width:38px;height:38px;"><span style="font-size:12px;">' + esc(initials) + '</span></div>' +
        '<div><p style="font-size:13px;font-weight:500;margin:0 0 2px;">' + esc(a.author_name) + '</p>' +
        '<p style="font-size:11px;color:var(--text-mute);margin:0;">' + esc(sections) + '</p></div></a>';
    }).join('');
  }).catch(function () {
    mount.hidden = true;
  });
}

// ---------- estudio: servicios.html ----------

function renderServiciosPage() {
  var mount = document.querySelector('[data-servicios-page]');
  if (!mount) return;
  creaApi('/api/public/services').then(function (services) {
    if (!services.length) {
      renderEmptyState(mount, 'Catálogo en actualización', 'Escríbenos y te compartimos los paquetes disponibles directamente.', { href: 'contacto.html', label: 'Hablar con ventas' });
      return;
    }
    mount.innerHTML = services.map(function (s) {
      var features = (s.features || []).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
      return '<div class="service-card">' +
        '<p style="font-size:15px;font-weight:500;margin:0 0 6px;">' + esc(s.name) + '</p>' +
        '<p class="price">' + esc(s.price_label) + '</p>' +
        '<p style="font-size:12px;color:var(--text-mute);line-height:1.5;margin:0 0 14px;">' + esc(s.description) + '</p>' +
        '<ul>' + features + '</ul>' +
        '<a href="contacto.html?interes=' + encodeURIComponent(s.cta_interest || 'Otro') + '" class="btn btn-accent" style="align-self:flex-start;">Cotizar este paquete</a>' +
      '</div>';
    }).join('');
  }).catch(function () {
    renderEmptyState(mount, CREA_OFFLINE.title, CREA_OFFLINE.body);
  });
}

// ---------- tercer tiempo ----------

// ponytail: no columna "program" en social_posts — filtramos por network=facebook,
// que hoy solo lleva Tercer Tiempo. Si se suman más programas a Facebook, agregar
// filtro por título/tag en el backend en vez de aquí.
function renderTercerTiempoEpisodes() {
  var mounts = document.querySelectorAll('[data-tt-episodes]');
  if (!mounts.length) return;
  creaApi('/api/public/social?network=facebook&limit=3').then(function (posts) {
    if (!posts.length) {
      mounts.forEach(function (mount) {
        renderEmptyState(mount, 'Aún no hay programas cargados', 'Síguenos en Facebook para ver las transmisiones en vivo.');
      });
      return;
    }
    var html = posts.map(function (p) {
      return '<article>' +
        '<div class="img-ph ratio-4-3" data-tt-embed="' + p.id + '" style="margin-bottom:8px;">' +
          (p.thumbnail_url ? '<img src="' + esc(p.thumbnail_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">' : '<span class="cap">video: Tercer Tiempo</span>') +
        '</div>' +
        '<p class="card-title" style="font-size:13px;margin-bottom:5px;"><a href="' + esc(p.external_url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.title || 'Tercer Tiempo') + '</a></p>' +
        '<div style="font-size:11px;color:var(--text-mute);">' + timeAgo(p.created_at) + '</div>' +
      '</article>';
    }).join('');
    mounts.forEach(function (mount) { mount.innerHTML = html; });

    // El iframe se resuelve aparte (mismo patrón que producciones.html): si Facebook
    // no expone embed para ese post, el thumbnail + link ya montado sirve de fallback.
    posts.forEach(function (p) {
      creaApi('/api/public/social/' + p.id + '/embed').then(function (data) {
        if (!data.embed_html) return;
        document.querySelectorAll('[data-tt-embed="' + p.id + '"]').forEach(function (el) {
          el.innerHTML = data.embed_html;
        });
      }).catch(function () {});
    });
  }).catch(function () {
    mounts.forEach(function (mount) { mount.closest('.section-block') ? mount.closest('.section-block').hidden = true : renderEmptyState(mount, CREA_OFFLINE.title, CREA_OFFLINE.body); });
  });
}

// ---------- perfil ----------

function renderProfilePage() {
  var mount = document.querySelector('[data-profile-page]');
  if (!mount) return;
  var piecesList = document.querySelector('[data-pieces-list]');
  var name = qs('autor');
  var fail = function (title, body) {
    piecesList.innerHTML = '';
    renderEmptyState(mount, title, body, { href: 'index.html', label: 'Volver a portada' });
  };
  if (!name) return fail('No encontramos este perfil', 'El enlace parece incompleto. Conoce a quienes hacen CREA desde la portada.');

  document.title = name + ' · CREA Contenidos';
  mount.querySelector('[data-avatar]').textContent = initials(name);
  mount.querySelector('[data-name]').textContent = name;

  creaApi('/api/public/authors/' + encodeURIComponent(name) + '/articles').then(function (articles) {
    if (!articles.length) {
      mount.querySelector('[data-role]').textContent = 'Colaboración · CREA Contenidos';
      mount.querySelector('[data-meta]').textContent = 'Aún no tiene piezas publicadas';
      renderEmptyState(piecesList, 'Aún no hay piezas de ' + name, 'Cuando publique su primera nota la vas a encontrar aquí.', { href: 'index.html', label: 'Volver a portada' });
      return;
    }
    var canonical = articles[0].author_name;
    var sections = [];
    articles.forEach(function (a) {
      if (sections.indexOf(a.section) === -1) sections.push(a.section);
    });
    var sectionsText = sections.length > 1
      ? sections.slice(0, -1).join(', ') + ' y ' + sections[sections.length - 1]
      : sections[0];

    document.title = canonical + ' · CREA Contenidos';
    mount.querySelector('[data-avatar]').textContent = initials(canonical);
    mount.querySelector('[data-name]').textContent = canonical;
    mount.querySelector('[data-role]').textContent = 'Colaboración · ' + sectionsText;
    mount.querySelector('[data-meta]').textContent = articles.length + ' piezas publicadas · última ' + timeAgo(articles[0].published_at);

    piecesList.innerHTML = articles.map(function (a) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 0;border-bottom:0.5px solid var(--line);">' +
        '<h2 style="font-size:14px;font-weight:500;color:var(--text);line-height:1.4;margin:0;"><a href="' + notaHref(a) + '" style="font-family:var(--font-body);">' + esc(a.title) + '</a></h2>' +
        '<div style="font-size:11px;color:var(--text-mute);white-space:nowrap;">' + esc(a.section) + ' &middot; ' + timeAgo(a.published_at) + '</div></div>';
    }).join('');
  }).catch(function () {
    fail(CREA_OFFLINE.title, CREA_OFFLINE.body);
  });
}

// ---------- topbar: fecha y clima ----------

// Perote, Veracruz.
var PEROTE_LAT = 19.5567;
var PEROTE_LON = -97.2506;

// https://open-meteo.com/en/docs — API pública, sin key, CORS abierto.
var WEATHER_CODES = {
  0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'niebla', 48: 'niebla', 51: 'llovizna', 53: 'llovizna', 55: 'llovizna',
  61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia fuerte', 71: 'nieve ligera', 73: 'nieve',
  75: 'nieve fuerte', 80: 'chubascos', 81: 'chubascos', 82: 'chubascos fuertes',
  95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta con granizo',
};

function initDateAndWeather() {
  var dateEl = document.querySelector('[data-today]');
  if (dateEl) {
    var fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    dateEl.textContent = 'PEROTE, VER. · ' + fecha.toUpperCase();
  }

  var weatherEl = document.querySelector('[data-weather]');
  if (!weatherEl) return;
  fetch('https://api.open-meteo.com/v1/forecast?latitude=' + PEROTE_LAT + '&longitude=' + PEROTE_LON + '&current=temperature_2m,weather_code')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var current = data && data.current;
      if (!current) return;
      var desc = WEATHER_CODES[current.weather_code] || 'clima variable';
      weatherEl.textContent = Math.round(current.temperature_2m) + '°C, ' + desc.toUpperCase();
      weatherEl.hidden = false;
    })
    .catch(function () {}); // sin clima no rompe la página: el bloque queda oculto
}

// ---------- boot ----------

document.addEventListener('DOMContentLoaded', function () {
  initMobileMenu();
  initDateAndWeather();
  renderHomePage();
  renderSectionPage();
  renderNotaPage();
  renderProfilePage();
  renderSponsorStrip();
  renderPatrocinadoPage();
  renderEstudioSponsors();
  renderServiciosPage();
  renderTercerTiempoEpisodes();
  renderSiteMetrics();
  renderColaboradores();

  initChips('[data-date-filter]');

  var interestChips = document.querySelectorAll('[data-interest]');
  if (interestChips.length) {
    var preset = qs('interes');
    initChips('[data-interest]');
    if (preset) {
      interestChips.forEach(function (c) {
        setChipActive(c, c.dataset.value === preset);
      });
    }
  }

  initIdeaForm();
  initNewsletterForm();
});

// ---------- formularios ----------

function submitForm(form, url, buildPayload, onSuccess) {
  var note = form.querySelector('[data-form-note]');
  var submitBtn = form.querySelector('button[type="submit"]');
  var setNote = function (text, kind) {
    if (!note) return;
    note.textContent = text;
    note.style.color = kind === 'error' ? 'var(--accent)' : 'var(--brand)';
    note.focus();
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitBtn.disabled = true;
    setNote('Enviando…', 'ok');

    fetch(CREA_API_BASE + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    })
      .then(function (res) {
        if (res.status === 201 || res.status === 200) {
          onSuccess(setNote);
          return;
        }
        if (res.status === 429) {
          setNote('Has enviado demasiadas solicitudes en poco tiempo. Espera unos minutos e inténtalo de nuevo.', 'error');
          return;
        }
        return res.json().then(function (body) {
          var fields = body && body.fields ? Object.keys(body.fields).join(', ') : '';
          setNote('No pudimos enviar el formulario. Revisa los campos' + (fields ? ' (' + fields + ')' : '') + ' e inténtalo de nuevo.', 'error');
        });
      })
      .catch(function () {
        setNote('No pudimos conectar con el servidor. Inténtalo de nuevo más tarde.', 'error');
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
}

function initIdeaForm() {
  var form = document.querySelector('form[data-idea-form]');
  if (!form) return;
  submitForm(form, '/api/public/leads', function () {
    var activeChip = form.querySelector('[data-interest].active');
    return {
      name: form.elements.nombre.value.trim(),
      email: form.elements.correo.value.trim(),
      service_interest: activeChip ? activeChip.dataset.value : '',
      message: form.elements.idea.value.trim(),
      source_page: 'comunidad',
      website: form.elements.website.value,
    };
  }, function (setNote) {
    form.reset();
    form.querySelectorAll('[data-interest].active').forEach(function (c) { setChipActive(c, false); });
    setNote('¡Gracias! Recibimos tu idea. El equipo editorial la va a revisar.', 'ok');
  });
}

function initNewsletterForm() {
  // Puede haber varios en la misma página (topbar desktop, menú móvil, pie de nota).
  document.querySelectorAll('form[data-newsletter-form]').forEach(function (form) {
    var details = form.closest('details');
    submitForm(form, '/api/public/newsletter/subscribe', function () {
      return { email: form.elements.email.value.trim(), website: form.elements.website.value };
    }, function (setNote) {
      form.reset();
      setNote('Te enviamos un correo para confirmar tu suscripción. Revisa tu bandeja.', 'ok');
      if (details) setTimeout(function () { details.open = false; }, 3500);
    });
  });
}
