// CREA Contenidos — shared vanilla JS (mobile menu + data-driven section/profile pages)

function initMobileMenu() {
  var toggle = document.querySelector('[data-menu-toggle]');
  var menu = document.querySelector('.mobile-menu');
  if (!toggle || !menu) return;
  var open = function () { menu.classList.add('open'); };
  var close = function () { menu.classList.remove('open'); };
  toggle.addEventListener('click', open);
  menu.querySelectorAll('[data-menu-close]').forEach(function (el) {
    el.addEventListener('click', close);
  });
}

function initChips(selector, onSelect) {
  var chips = document.querySelectorAll(selector);
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      if (onSelect) onSelect(chip.dataset.value, chip);
    });
  });
}

// Placeholder-article data, shared by the section listing page.
// Same content as the Claude Design prototype's articlesBySection.
var CREA_ARTICLES = {
  'Local': [
    { title: 'El mercado de Perote se prepara para la temporada alta de la papa', author: 'Carlos Mendoza', time: 'hace 2 horas', photo: 'foto: mercado municipal', dek: 'Productores reportan cosecha estable y el ayuntamiento amplía los puestos de fin de semana.', link: 'nota.html' },
    { title: 'Cierre parcial de la carretera Perote–Xalapa por niebla', author: 'Ana Torres', time: 'hace 5 horas', photo: 'foto: carretera federal', dek: 'Protección Civil recomienda manejar con precaución en el tramo La Joya–Las Vigas.' },
    { title: 'Vecinos del centro piden más alumbrado en la calle Hidalgo', author: 'Carlos Mendoza', time: 'ayer', photo: 'foto: calle Hidalgo', dek: 'Habitantes reportan al menos seis luminarias apagadas desde hace un mes.' },
    { title: 'Ayuntamiento abre consulta pública sobre el nuevo mercado municipal', author: 'Luisa Pérez', time: 'hace 2 días', photo: 'foto: cabildo municipal', dek: 'El cabildo recibirá propuestas vecinales hasta el próximo viernes.' },
  ],
  'Cultura': [
    { title: 'Fuerte de San Carlos abre nueva ruta nocturna para visitantes', author: 'Ana Torres', time: 'hace 3 horas', photo: 'foto: Fuerte de San Carlos', dek: 'El recorrido incluye la muralla original y un mirador hacia el Cofre de Perote.' },
    { title: 'Feria del libro llega a la plaza central este fin de semana', author: 'Luisa Pérez', time: 'hace 1 día', photo: 'foto: plaza central', dek: 'Participan quince editoriales independientes del corredor Xalapa–Puebla.' },
    { title: 'Taller de fotografía documental abre inscripciones en la casa de cultura', author: 'Carlos Mendoza', time: 'hace 2 días', photo: 'foto: casa de cultura', dek: 'El curso de seis semanas está dirigido a jóvenes de Perote y comunidades cercanas.' },
    { title: 'Mural colectivo rendirá homenaje a los productores de papa', author: 'Ana Torres', time: 'hace 4 días', photo: 'foto: mural en proceso', dek: 'Artistas locales pintarán la fachada del mercado municipal este verano.' },
  ],
  'Economía': [
    { title: 'Así cerró el primer semestre el comercio del centro', author: 'Luisa Pérez', time: 'hace 6 horas', photo: 'foto: comercios del centro', dek: 'Locatarios reportan ventas estables pese a la baja afluencia turística.' },
    { title: 'Productores de papa reportan cosecha estable pese al frío adelantado', author: 'Carlos Mendoza', time: 'hace 1 día', photo: 'foto: cosecha de papa', dek: 'El volumen esperado para julio no se vio afectado por las heladas tempranas.' },
    { title: 'Tianguis de los domingos crece 20% en número de puestos', author: 'Ana Torres', time: 'hace 3 días', photo: 'foto: tianguis dominical', dek: 'Comerciantes de Las Vigas y Tenextepec se suman a la oferta dominical.' },
    { title: 'Banco rural anuncia créditos para pequeños productores de papa', author: 'Luisa Pérez', time: 'hace 4 días', photo: 'foto: banco rural', dek: 'La línea de crédito busca apoyar la siembra de la próxima temporada.' },
  ],
  'Entretenimiento': [
    { title: 'Cinco lugares para comer algo caliente en temporada de frío', author: 'Luisa Pérez', time: 'hace 1 día', photo: 'foto: puesto de comida', dek: 'Una ruta por las cocinas económicas favoritas del centro de Perote.' },
    { title: 'Cine de barrio: este mes proyectan clásicos del cine mexicano', author: 'Carlos Mendoza', time: 'hace 3 días', photo: 'foto: cine de barrio', dek: 'La función es gratuita y se realiza cada jueves en la plaza cívica.' },
    { title: 'Nueva cafetería de especialidad abre sus puertas cerca del Fuerte', author: 'Ana Torres', time: 'hace 4 días', photo: 'foto: cafetería de especialidad', dek: 'El local apuesta por café cultivado en la zona alta de Veracruz.' },
    { title: 'Grupo de teatro comunitario estrena obra inspirada en el Cofre de Perote', author: 'Luisa Pérez', time: 'hace 6 días', photo: 'foto: obra de teatro comunitario', dek: 'La puesta en escena se presenta los próximos tres fines de semana.' },
  ],
  'Deportes': [
    { title: 'Equipo local de basquetbol clasifica a la final regional', author: 'Ana Torres', time: 'hace 4 horas', photo: 'foto: cancha municipal', dek: 'El equipo enfrentará a Xalapa el próximo sábado en casa.' },
    { title: 'Tercer Tiempo: así viene la jornada de este fin de semana', author: 'Carlos Mendoza', time: 'hace 1 día', photo: 'foto: transmisión Tercer Tiempo', dek: 'Repasamos los partidos clave del corredor antes de la transmisión en vivo.' },
    { title: 'Liga municipal de fútbol arranca su temporada de invierno', author: 'Carlos Mendoza', time: 'hace 2 días', photo: 'foto: liga municipal de fútbol', dek: 'Doce equipos de Perote y comunidades vecinas se inscribieron este año.' },
    { title: 'Corredora local clasifica a la final estatal de atletismo', author: 'Ana Torres', time: 'hace 3 días', photo: 'foto: pista de atletismo', dek: 'Competirá en la prueba de 5 mil metros el próximo mes.' },
  ],
  'Opinión': [
    { title: 'Lo que significa el crecimiento de Perote para sus vecinos', author: 'Luisa Pérez', time: 'hace 2 días', photo: 'foto: vista de Perote', dek: 'Una reflexión sobre el cambio del centro histórico en los últimos años.' },
    { title: 'Carta abierta: necesitamos más espacios públicos en el centro', author: 'Lector invitado', time: 'hace 5 días', photo: 'foto: parque central', dek: 'Un lector propone recuperar el parque junto al mercado municipal.' },
    { title: 'Columna: el frío que nos define', author: 'Luisa Pérez', time: 'hace 3 días', photo: 'foto: centro de Perote', dek: 'Sobre el clima de Perote como parte de su identidad.' },
    { title: '¿Quién cuida el Cofre de Perote?', author: 'Lector invitado', time: 'hace 6 días', photo: 'foto: Cofre de Perote', dek: 'Una mirada a los retos de conservación de la montaña que nos representa.' },
  ],
};

var CREA_COLLABORATORS = {
  'carlos-mendoza': { name: 'Carlos Mendoza', role: 'Reportero · Local y Economía', pieces: 86, since: 2022, level: 3, levelPoints: 1180, levelGoal: 1500,
    bio: 'Cubre la fuente de Local y Economía para CREA Contenidos desde 2022. Originario de Perote, antes colaboró con medios regionales del corredor Xalapa–Puebla.',
    piecesList: [
      { title: 'El mercado de Perote se prepara para la temporada alta de la papa', section: 'Local', time: 'hace 2 horas' },
      { title: 'Vecinos del centro piden más alumbrado en la calle Hidalgo', section: 'Local', time: 'ayer' },
      { title: 'Productores de papa reportan cosecha estable pese al frío adelantado', section: 'Economía', time: 'hace 1 día' },
      { title: 'Cierre parcial de la carretera Perote–Xalapa por niebla', section: 'Local', time: 'hace 5 horas' },
    ] },
  'ana-torres': { name: 'Ana Torres', role: 'Reportera · Cultura y Deportes', pieces: 54, since: 2023, level: 2, levelPoints: 640, levelGoal: 1000,
    bio: 'Reportera de Cultura y Deportes, con especial interés en la vida del Fuerte de San Carlos y las ligas locales.',
    piecesList: [
      { title: 'Fuerte de San Carlos abre nueva ruta nocturna para visitantes', section: 'Cultura', time: 'hace 3 horas' },
      { title: 'Equipo local de basquetbol clasifica a la final regional', section: 'Deportes', time: 'hace 4 horas' },
      { title: 'Mural colectivo rendirá homenaje a los productores de papa', section: 'Cultura', time: 'hace 4 días' },
    ] },
  'luisa-perez': { name: 'Luisa Pérez', role: 'Editora de Opinión', pieces: 39, since: 2021, level: 4, levelPoints: 2100, levelGoal: 2500,
    bio: 'Edita la sección de Opinión y coordina la mesa editorial de CREA desde 2021.',
    piecesList: [
      { title: 'Lo que significa el crecimiento de Perote para sus vecinos', section: 'Opinión', time: 'hace 2 días' },
      { title: 'Feria del libro llega a la plaza central este fin de semana', section: 'Cultura', time: 'hace 1 día' },
      { title: 'Columna: el frío que nos define', section: 'Opinión', time: 'hace 3 días' },
    ] },
  'tomas-ibarra': { name: 'Tomás Ibarra', role: 'Colaborador comunitario · Economía', pieces: 6, since: 2025, level: 1, levelPoints: 120, levelGoal: 500,
    bio: 'Productor agrícola del corredor, colabora con notas sobre el campo y el mercado local.',
    piecesList: [
      { title: 'Banco rural anuncia créditos para pequeños productores de papa', section: 'Economía', time: 'hace 4 días' },
    ] },
  'marisol-hidalgo': { name: 'Marisol Hidalgo', role: 'Colaboradora comunitaria · Opinión', pieces: 4, since: 2025, level: 1, levelPoints: 80, levelGoal: 500,
    bio: 'Vecina del centro de Perote, escribe columnas de opinión sobre la vida del municipio.',
    piecesList: [
      { title: 'Carta abierta: necesitamos más espacios públicos en el centro', section: 'Opinión', time: 'hace 5 días' },
    ] },
};

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function renderSectionPage() {
  var mount = document.querySelector('[data-section-page]');
  if (!mount) return;
  var name = qs('s') || 'Local';
  var articles = CREA_ARTICLES[name] || CREA_ARTICLES['Local'];
  if (!CREA_ARTICLES[name]) name = 'Local';

  document.title = name + ' · CREA Contenidos';
  document.querySelectorAll('[data-section-name]').forEach(function (el) { el.textContent = name; });
  document.querySelectorAll('.ed-nav a').forEach(function (a) {
    a.classList.toggle('active', a.dataset.section === name);
  });

  var list = mount.querySelector('[data-article-list]');
  list.innerHTML = articles.map(function (a) {
    return '<div style="display:flex;gap:16px;padding:16px 0;border-bottom:0.5px solid var(--line);">' +
      '<div class="img-ph" style="width:140px;height:96px;flex-shrink:0;"><span class="cap">' + a.photo + '</span></div>' +
      '<div><p class="card-title" style="font-size:15px;margin-bottom:8px;line-height:1.35;">' + (a.link ? '<a href="' + a.link + '">' + a.title + '</a>' : a.title) + '</p>' +
      '<div class="card-byline">' + a.author + ' · ' + a.time + '</div></div></div>';
  }).join('');
}

function renderProfilePage() {
  var mount = document.querySelector('[data-profile-page]');
  if (!mount) return;
  var id = qs('id') || 'carlos-mendoza';
  var p = CREA_COLLABORATORS[id] || CREA_COLLABORATORS['carlos-mendoza'];
  var initials = p.name.split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  var pct = Math.round((p.levelPoints / p.levelGoal) * 100);

  document.title = p.name + ' · CREA Contenidos';
  mount.querySelector('[data-avatar]').textContent = initials;
  mount.querySelector('[data-name]').textContent = p.name;
  mount.querySelector('[data-role]').textContent = p.role;
  mount.querySelector('[data-meta]').textContent = p.pieces + ' piezas publicadas · colabora desde ' + p.since;
  mount.querySelector('[data-bio]').textContent = p.bio;
  mount.querySelector('[data-level]').textContent = 'Nv.' + p.level;
  mount.querySelector('[data-level-label]').textContent = 'Colaborador Nivel ' + p.level;
  mount.querySelector('[data-level-points]').textContent = p.levelPoints + ' / ' + p.levelGoal + ' pts';
  mount.querySelector('[data-level-bar]').style.width = pct + '%';

  document.querySelector('[data-pieces-list]').innerHTML = p.piecesList.map(function (piece) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 0;border-bottom:0.5px solid var(--line);">' +
      '<p style="font-size:14px;font-weight:500;color:var(--text);margin:0;line-height:1.4;">' + piece.title + '</p>' +
      '<div style="font-size:11px;color:var(--text-mute);white-space:nowrap;">' + piece.section + ' · ' + piece.time + '</div></div>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', function () {
  initMobileMenu();
  renderSectionPage();
  renderProfilePage();

  initChips('[data-date-filter]');

  var interestChips = document.querySelectorAll('[data-interest]');
  if (interestChips.length) {
    var preset = qs('interes');
    initChips('[data-interest]');
    if (preset) {
      interestChips.forEach(function (c) {
        c.classList.toggle('active', c.dataset.value === preset);
      });
    }
  }

  document.querySelectorAll('form[data-demo-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = form.querySelector('[data-form-note]');
      if (note) note.textContent = '¡Gracias! Esto es un prototipo — el envío todavía no está conectado a un backend.';
    });
  });
});
