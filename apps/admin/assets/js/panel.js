// CREA Panel Admin — internal newsroom tool.
// Ported from the Claude Design prototype "CREA Panel Admin.dc.html": same roles, screens,
// data and interaction logic. No backend exists yet (static site) — role login is a demo
// switcher and any "submit" just shows a prototype note, same convention as main.js.

(function () {
  'use strict';

  // ---------- static copy / data (ported verbatim from the design prototype) ----------

  var roleLabels = { director: 'Director Editorial', produccion: 'Producción / Reportero', comercial: 'Comercial / Ventas', colaborador: 'Colaborador externo' };
  var roleNames = { director: 'Mariana Cobos', produccion: 'Carlos Mendoza', comercial: 'Equipo comercial', colaborador: 'Tomás Ibarra' };
  var roleModules = {
    director: ['dashboard', 'ideas', 'editor', 'aprobacion', 'comercial', 'metricas', 'radar', 'propuestas', 'hermes', 'pipeline', 'configuracion'],
    produccion: ['dashboard', 'ideas', 'editor', 'radar', 'propuestas', 'metricas'],
    comercial: ['comercial'],
    colaborador: ['ideas']
  };
  var navItemsAll = [
    { id: 'dashboard', label: 'Inicio' },
    { id: 'radar', label: 'RADAR' },
    { id: 'propuestas', label: 'Propuestas IA' },
    { id: 'ideas', label: 'Bandeja de ideas' },
    { id: 'editor', label: 'Editor de nota' },
    { id: 'aprobacion', label: 'Aprobación' },
    { id: 'comercial', label: 'Pipeline comercial' },
    { id: 'metricas', label: 'Métricas' },
    { id: 'hermes', label: 'Estado del agente' },
    { id: 'pipeline', label: 'Buenos días, Perote' },
    { id: 'configuracion', label: 'Configuración' }
  ];

  var ideasData = [
    { id: 1, title: 'Vecinos proponen mercado nocturno de invierno', category: 'Local', score: 8.2, collaborator: 'Tomás Ibarra', column: 'Nueva' },
    { id: 2, title: 'Historia oral de los fundadores del Fuerte de San Carlos', category: 'Cultura', score: 7.5, collaborator: 'Ana Torres', column: 'Nueva' },
    { id: 3, title: 'Tres ideas de negocio que nacieron en el mercado municipal', category: 'Economía', score: 6.8, collaborator: 'Marisol Hidalgo', column: 'Nueva' },
    { id: 4, title: 'Reportaje sobre el precio de la papa en la región', category: 'Economía', score: 9.1, collaborator: 'Carlos Mendoza', column: 'En análisis' },
    { id: 5, title: 'Perfil de la nueva generación de productores agrícolas', category: 'Economía', score: 8.6, collaborator: 'Marisol Hidalgo', column: 'En análisis' },
    { id: 6, title: 'Cobertura de la final regional de basquetbol', category: 'Deportes', score: 8.9, collaborator: 'Ana Torres', column: 'Aprobada' },
    { id: 7, title: 'Especial de aniversario del Fuerte de San Carlos', category: 'Cultura', score: 7.8, collaborator: 'Luisa Pérez', column: 'Aprobada' },
    { id: 8, title: 'Cobertura de feria comercial fuera de la zona de cobertura', category: 'Economía', score: 4.2, collaborator: 'Tomás Ibarra', column: 'Descartada' }
  ];

  var piecesData = [
    { id: 1, title: 'El mercado de Perote se prepara para la temporada alta de la papa', section: 'Local', author: 'Carlos Mendoza', status: 'Publicada' },
    { id: 2, title: 'Fuerte de San Carlos abre nueva ruta nocturna para visitantes', section: 'Cultura', author: 'Ana Torres', status: 'En revisión' },
    { id: 3, title: 'Cinco años de Ferretería Reyes en el corazón de Perote', section: 'Economía', author: 'Carlos Mendoza', status: 'Aprobada' },
    { id: 4, title: 'Equipo local de basquetbol clasifica a la final regional', section: 'Deportes', author: 'Ana Torres', status: 'Borrador' },
    { id: 5, title: 'Hotel San Carlos abre nueva ala con vista al Cofre de Perote', section: 'Economía', author: 'Luisa Pérez', status: 'En revisión' },
    { id: 6, title: 'Vecinos del centro piden más alumbrado en la calle Hidalgo', section: 'Local', author: 'Carlos Mendoza', status: 'Borrador' }
  ];

  var commercialData = [
    { id: 1, business: 'Auto Refacciones Cofre', interest: 'Publicidad display mensual', value: '$1,200 MXN/mes', column: 'Identificado', lastContact: '24 jun 2026' },
    { id: 2, business: 'Panadería La Espiga', interest: 'Branded content básico', value: '$2,000 MXN', column: 'Identificado', lastContact: '20 jun 2026' },
    { id: 3, business: 'Restaurante Mirador', interest: 'Cobertura de evento', value: '$4,500 MXN', column: 'Contactado', lastContact: '27 jun 2026' },
    { id: 4, business: 'Gasolinera Perote', interest: 'Patrocinio de sección mensual', value: '$2,800 MXN/mes', column: 'Contactado', lastContact: '18 jun 2026' },
    { id: 5, business: 'Constructora Altotonga', interest: 'Patrocinio de sección mensual', value: '$3,500 MXN/mes', column: 'Propuesta enviada', lastContact: '29 jun 2026' },
    { id: 6, business: 'Farmacia del Centro', interest: 'Publicidad display mensual', value: '$1,000 MXN/mes', column: 'Propuesta enviada', lastContact: '15 jun 2026' },
    { id: 7, business: 'Ferretería Reyes', interest: 'Patrocinio de sección mensual', value: '$3,000 MXN/mes', column: 'Cerrado', lastContact: '10 jun 2026' }
  ];

  var usersData = [
    { name: 'Mariana Cobos', role: 'Director Editorial', active: true },
    { name: 'Carlos Mendoza', role: 'Producción / Reportero', active: true },
    { name: 'Ana Torres', role: 'Producción / Reportero', active: true },
    { name: 'Luisa Pérez', role: 'Producción / Reportero', active: false },
    { name: 'Equipo comercial', role: 'Comercial / Ventas', active: true },
    { name: 'Marisol Hidalgo', role: 'Colaborador externo', active: true },
    { name: 'Tomás Ibarra', role: 'Colaborador externo', active: true }
  ];

  var permisosMatrix = [
    { modulo: 'Inicio', director: true, produccion: true, comercial: true, colaborador: false },
    { modulo: 'RADAR', director: true, produccion: true, comercial: false, colaborador: false },
    { modulo: 'Propuestas IA', director: true, produccion: true, comercial: false, colaborador: false },
    { modulo: 'Bandeja / Mis ideas', director: true, produccion: true, comercial: false, colaborador: true },
    { modulo: 'Editor de nota', director: true, produccion: true, comercial: false, colaborador: false },
    { modulo: 'Aprobación', director: true, produccion: false, comercial: false, colaborador: false },
    { modulo: 'Pipeline comercial', director: true, produccion: false, comercial: true, colaborador: false },
    { modulo: 'Métricas', director: true, produccion: true, comercial: false, colaborador: false },
    { modulo: 'Estado del agente', director: true, produccion: false, comercial: false, colaborador: false },
    { modulo: 'Buenos días, Perote', director: true, produccion: false, comercial: false, colaborador: false },
    { modulo: 'Configuración', director: true, produccion: false, comercial: false, colaborador: false }
  ];

  var integracionesData = [
    { name: 'Notion', desc: 'Base de datos editorial', connected: true },
    { name: 'Hermes Agent', desc: 'Automatización de social listening', connected: true },
    { name: 'WordPress', desc: 'Publicación del sitio', connected: true },
    { name: 'Buffer', desc: 'Programación en redes sociales', connected: false }
  ];

  var notificationsData = {
    director: [
      { text: 'Brief matutino de Hermes listo para revisar', time: '07:15' },
      { text: 'Constructora Altotonga sin seguimiento hace 6 días', time: 'ayer' },
      { text: '2 piezas esperan aprobación', time: 'hoy' }
    ],
    produccion: [
      { text: 'Brief matutino de Hermes listo para revisar', time: '07:15' },
      { text: 'Tu nota fue devuelta con comentarios', time: 'ayer' }
    ],
    comercial: [
      { text: 'Constructora Altotonga sin seguimiento hace 6 días', time: 'ayer' },
      { text: 'Farmacia del Centro sin seguimiento hace 5 días', time: 'hace 2 días' }
    ],
    colaborador: [
      { text: 'Tu idea "Historia oral de los fundadores" fue aprobada', time: 'ayer' }
    ]
  };

  var weeklyPiecesData = [
    { week: 'Sem 1', count: 7 },
    { week: 'Sem 2', count: 8 },
    { week: 'Sem 3', count: 6 },
    { week: 'Sem 4', count: 9 },
    { week: 'Sem 5', count: 8 },
    { week: 'Sem 6', count: 9 }
  ];
  var reachVsLastWeekPct = 12;

  var socialChannelsData = [
    { name: 'Facebook', growth: '+12%' },
    { name: 'Instagram', growth: '+5%' },
    { name: 'YouTube', growth: '+8%' },
    { name: 'WhatsApp Newsletter', growth: '+2%' }
  ];

  var checklistData = [
    { label: 'Título final', done: true },
    { label: 'Imagen principal', done: true },
    { label: 'SEO completo', done: false },
    { label: 'Revisión editorial', done: false }
  ];

  var radarData = [
    { id: 1, title: 'Aumento de robos a comercios en el centro', source: 'Facebook', mentions: 34, sentiment: 'negativo', status: 'Nuevo',
      antecedentes: 'Tercer reporte de robos a locales del centro en dos semanas. La página de la policía municipal no ha emitido comunicado oficial.',
      actores: 'Policía municipal, Cámara de Comercio de Perote, comerciantes afectados',
      angulos: 'Cronología de los tres casos; entrevista a comerciantes; postura de la policía municipal',
      audiencia: 'Alto — tema de seguridad genera alta interacción local' },
    { id: 2, title: 'Nueva ciclovía en la avenida Reforma', source: 'Perplexity', mentions: 12, sentiment: 'positivo', status: 'Nuevo',
      antecedentes: 'El ayuntamiento publicó el trazo preliminar de una ciclovía piloto de 2km sobre avenida Reforma.',
      actores: 'Ayuntamiento de Perote, colectivo ciclista local, comerciantes de la avenida',
      angulos: 'Mapa del trazo; reacciones de comerciantes; comparación con otras ciudades de la región',
      audiencia: 'Medio — interés de nicho pero buen potencial de compartidos' },
    { id: 3, title: 'Quejas por corte de agua en la colonia Centro', source: 'TikTok', mentions: 58, sentiment: 'negativo', status: 'Revisado',
      antecedentes: 'Corte de agua de 4 días sin aviso previo. Videos de vecinos acumulan miles de vistas.',
      actores: 'Comisión municipal de agua, vecinos de la colonia Centro',
      angulos: 'Cronología del corte; postura oficial; impacto en negocios locales',
      audiencia: 'Alto — queja ciudadana con alto engagement en redes' },
    { id: 4, title: 'Feria del café atrae turismo regional', source: 'Facebook', mentions: 21, sentiment: 'positivo', status: 'Nuevo',
      antecedentes: 'La feria anual reportó mayor afluencia que el año pasado según organizadores.',
      actores: 'Organizadores de la feria, productores locales, secretaría de turismo',
      angulos: 'Datos de afluencia; derrama económica; perfiles de productores',
      audiencia: 'Medio-alto — contenido positivo con buen alcance orgánico' },
    { id: 5, title: 'Debate por el nuevo horario del mercado municipal', source: 'Perplexity', mentions: 9, sentiment: 'neutral', status: 'Revisado',
      antecedentes: 'Locatarios divididos sobre la propuesta de cambiar el horario de apertura del mercado.',
      actores: 'Locatarios, administración del mercado municipal',
      angulos: 'Encuesta a locatarios; postura de la administración',
      audiencia: 'Bajo — tema de nicho para locatarios' },
    { id: 6, title: 'Video viral sobre bache en la carretera a Xalapa', source: 'TikTok', mentions: 76, sentiment: 'negativo', status: 'Nuevo',
      antecedentes: 'Video de un vehículo dañado por un bache acumula más de 70 menciones en 24 horas.',
      actores: 'Obras públicas municipales, automovilistas afectados',
      angulos: 'Verificación en sitio; respuesta de obras públicas; reincidencia del problema',
      audiencia: 'Alto — formato viral con alto potencial de alcance' },
    { id: 7, title: 'Vecinos organizan torneo comunitario de fútbol', source: 'Facebook', mentions: 15, sentiment: 'positivo', status: 'Revisado',
      antecedentes: 'Torneo vecinal en su tercera edición, organizado sin apoyo municipal.',
      actores: 'Comité vecinal organizador, equipos participantes',
      angulos: 'Historia del torneo; perfiles de equipos; cobertura de la final',
      audiencia: 'Medio — buen alcance en comunidad local' },
    { id: 8, title: 'Aumento en el precio del gas en la región', source: 'Perplexity', mentions: 27, sentiment: 'neutral', status: 'Nuevo',
      antecedentes: 'Precio del gas LP subió 8% en las últimas tres semanas en la región.',
      actores: 'Distribuidoras de gas, CRE, consumidores',
      angulos: 'Comparativo de precios semanal; explicación del alza; impacto en hogares',
      audiencia: 'Medio — tema económico de interés amplio' }
  ];

  var propuestasData = [
    { id: 1, tema: 'Aumento de robos a comercios en el centro', formato: 'Nota', angulo: 'Reconstrucción de los últimos tres casos con cifras de la policía municipal', sensibilidad: 'rojo' },
    { id: 2, tema: 'Nueva ciclovía en la avenida Reforma', formato: 'Post', angulo: 'Anuncio con mapa del trazo y reacciones de comerciantes', sensibilidad: 'verde' },
    { id: 3, tema: 'Feria del café atrae turismo regional', formato: 'Infografía', angulo: 'Datos de afluencia y derrama económica del fin de semana', sensibilidad: 'verde' },
    { id: 4, tema: 'Video viral sobre bache en la carretera a Xalapa', formato: 'Guion video', angulo: 'Verificación en sitio y respuesta de obras públicas', sensibilidad: 'amarillo' },
    { id: 5, tema: 'Quejas por corte de agua en la colonia Centro', formato: 'Nota', angulo: 'Cronología del corte y postura oficial de la comisión de agua', sensibilidad: 'amarillo' },
    { id: 6, tema: 'Aumento en el precio del gas en la región', formato: 'Meme', angulo: 'Formato ligero comparando precios de la semana', sensibilidad: 'rojo' }
  ];

  var hermesLogData = [
    { task: 'Revisión de menciones en Facebook y TikTok', time: '07:02', result: 'exito' },
    { task: 'Generación de borrador: Feria del café atrae turismo regional', time: '07:14', result: 'exito' },
    { task: 'Consulta de clima para Perote', time: '07:20', result: 'exito' },
    { task: 'Envío de audio a WhatsApp Newsletter', time: '07:31', result: 'fallo' },
    { task: 'Reintento de envío de audio a WhatsApp Newsletter', time: '07:33', result: 'exito' },
    { task: 'Clasificación de sensibilidad: corte de agua colonia Centro', time: '08:05', result: 'exito' },
    { task: 'Generación de meme: precio del gas', time: '08:40', result: 'exito' }
  ];

  var hermesSkillsData = [
    { name: 'Resumen de clima matutino', count: 46 },
    { name: 'Clasificación de sensibilidad de propuestas', count: 31 },
    { name: 'Redacción de meme desde tendencia', count: 18 },
    { name: 'Verificación de bache / infraestructura viral', count: 7 }
  ];

  var pipelineStepsData = [
    { label: 'Social listening', status: 'completado', time: '06:45' },
    { label: 'Borrador generado', status: 'completado', time: '07:14' },
    { label: 'Clima agregado', status: 'completado', time: '07:20' },
    { label: 'Aprobación manual (Emmanuel)', status: 'esperando', time: '—' },
    { label: 'Audio generado', status: 'pendiente', time: '—' },
    { label: 'Envío', status: 'pendiente', time: '—' }
  ];

  var piecesPublished = 9;
  var weeklyGoal = 10;
  var totalReach = '42K';

  var draftLocal = 'Autoridades locales atienden reporte ciudadano sobre bache en la carretera a Xalapa. El reporte se viralizó en redes sociales esta semana...';
  var draftSonnet = 'El Ayuntamiento de Perote confirmó esta mañana el inicio de trabajos de bacheo en la carretera federal a Xalapa, tras la difusión de un video que acumuló más de 70 menciones en redes sociales durante las últimas 24 horas. Vecinos reportan el daño desde hace tres semanas...';

  var PROTO_NOTE = 'Esto es un prototipo — el envío todavía no está conectado a un backend.';

  // ---------- state ----------

  var state = {
    role: 'director', screen: 'login',
    radarSource: 'Todas', radarStatus: 'Todos',
    propuestaDecisions: {}, propuestaRejecting: null,
    draftModel: 'local', noteBody: '',
    transparency: {}, deniedTarget: null,
    selectedRadarId: null,
    comentarioPieceId: null, comentarioText: '',
    mobileAprobacion: false, configTab: 'usuarios', showNotifications: false,
    demoNote: null
  };

  function setState(patch) {
    var k;
    for (k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) state[k] = patch[k]; }
    render();
  }

  // ---------- small helpers ----------

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initialsOf(name) {
    return name.split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  function statusStyle(label) {
    if (label === 'Borrador' || label === 'Nueva' || label === 'Identificado') return { bg: '#EEEDE8', color: '#6B6A60' };
    if (label === 'En revisión' || label === 'En análisis' || label === 'Contactado') return { bg: '#F3E4D4', color: '#7A4A18' };
    if (label === 'Aprobada' || label === 'Propuesta enviada') return { bg: '#E1E8DD', color: '#2F5233' };
    if (label === 'Publicada' || label === 'Cerrado') return { bg: '#2F5233', color: '#fff' };
    if (label === 'Descartada') return { bg: '#EFEFEA', color: '#8C8C82' };
    return { bg: '#EEEDE8', color: '#6B6A60' };
  }

  function badge(label) {
    var st = statusStyle(label);
    return '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + esc(label) + '</span>';
  }

  function landingFor(role) {
    return role === 'comercial' ? 'comercial' : (role === 'colaborador' ? 'ideas' : 'dashboard');
  }

  function login(role) {
    setState({ role: role, screen: landingFor(role), deniedTarget: null });
  }

  function logout() {
    setState({ screen: 'login', deniedTarget: null, showNotifications: false });
  }

  function goTo(id) {
    var allowed = roleModules[state.role] || [];
    if (allowed.indexOf(id) !== -1) setState({ screen: id, deniedTarget: null, showNotifications: false });
    else setState({ screen: 'denegado', deniedTarget: id, showNotifications: false });
  }

  function goHome() {
    setState({ screen: landingFor(state.role), deniedTarget: null });
  }

  // ---------- shared shell pieces ----------

  function renderNav() {
    var allowed = roleModules[state.role] || [];
    return navItemsAll.filter(function (n) { return allowed.indexOf(n.id) !== -1; }).map(function (n) {
      var active = state.screen === n.id;
      var label = (n.id === 'ideas' && state.role === 'colaborador') ? 'Mis ideas' : n.label;
      return '<button type="button" class="padmin-nav-item' + (active ? ' active' : '') + '" data-action="goto" data-id="' + n.id + '">' + esc(label) + '</button>';
    }).join('');
  }

  function renderBellAndNotifs() {
    var notifications = notificationsData[state.role] || [];
    var count = notifications.length;
    var badgeHtml = count ? '<span class="padmin-bell-badge">' + count + '</span>' : '';
    var panel = '';
    if (state.showNotifications) {
      panel = '<div class="padmin-notif-panel">' +
        '<p class="padmin-notif-title">Notificaciones</p>' +
        notifications.map(function (n) {
          return '<div class="padmin-notif-item"><p>' + esc(n.text) + '</p><p>' + esc(n.time) + '</p></div>';
        }).join('') +
        '</div>';
    }
    return '<span class="padmin-bell-wrap">' +
      '<span class="padmin-bell" data-action="toggle-notifications">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z" stroke="#3F3F3A" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 21a2.5 2.5 0 0 0 5 0" stroke="#3F3F3A" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      badgeHtml + '</span>' + panel + '</span>';
  }

  function renderSidebar() {
    return '<div class="padmin-sidebar">' +
      '<div class="padmin-sidebar-brand"><span class="name">CREA</span><span class="badge">PANEL</span></div>' +
      '<div class="padmin-nav">' + renderNav() + '</div>' +
      '<div class="padmin-account">' +
        '<div class="padmin-account-row">' +
          '<div><p class="padmin-account-name">' + esc(roleNames[state.role]) + '</p><p class="padmin-account-role">' + esc(roleLabels[state.role]) + '</p></div>' +
          renderBellAndNotifs() +
        '</div>' +
        '<button type="button" class="padmin-logout" data-action="logout">Cerrar sesión</button>' +
      '</div>' +
    '</div>';
  }

  function renderShell(contentHtml) {
    return '<div class="padmin-shell">' + renderSidebar() + '<div class="padmin-content">' + contentHtml + '</div></div>';
  }

  // ---------- login screen ----------

  function renderLogin() {
    return '<div class="padmin-login-screen"><div class="padmin-login-card">' +
      '<div class="padmin-login-brand"><span class="name">CREA</span><span class="badge">PANEL INTERNO</span></div>' +
      '<p class="padmin-login-sub">Herramienta de trabajo para el equipo CREA</p>' +
      '<form data-action="submit-login">' +
        '<div class="padmin-field"><label for="pl-email">Correo</label><input id="pl-email" type="email" placeholder="tu@crearcontenidos.com" autocomplete="username"></div>' +
        '<div class="padmin-field"><label for="pl-pass">Contraseña</label><input id="pl-pass" type="password" autocomplete="current-password"></div>' +
        '<button type="submit" class="padmin-btn" style="width:100%;text-align:center;margin-bottom:22px;">Iniciar sesión</button>' +
      '</form>' +
      '<div class="padmin-demo-note">' +
        '<p class="label">SOLO PARA ESTE PROTOTIPO &middot; ENTRAR COMO</p>' +
        '<div class="padmin-demo-chips">' +
          '<span class="padmin-role-chip" data-action="login" data-role="director">Director</span>' +
          '<span class="padmin-role-chip" data-action="login" data-role="produccion">Producción</span>' +
          '<span class="padmin-role-chip" data-action="login" data-role="comercial">Comercial</span>' +
          '<span class="padmin-role-chip" data-action="login" data-role="colaborador">Colaborador externo</span>' +
        '</div>' +
      '</div>' +
    '</div></div>';
  }

  // ---------- dashboard ----------

  function statCard(label, value, color) {
    return '<div class="padmin-stat-card"><p class="padmin-stat-label">' + esc(label) + '</p><p class="padmin-stat-value"' + (color ? ' style="color:' + color + ';"' : '') + '>' + value + '</p></div>';
  }

  function renderDashboardDirector() {
    var withStatus = piecesData.map(function (p) { return p; });
    var ideasNueva = ideasData.filter(function (i) { return i.column === 'Nueva'; });
    var piecesInReview = withStatus.filter(function (p) { return p.status === 'En revisión'; });
    var activePipelineCount = commercialData.filter(function (c) { return c.column !== 'Cerrado'; }).length;

    return '<div>' +
      '<p style="font-size:13px;color:#6B6A60;margin:0 0 4px;">Buenos días</p>' +
      '<h1 class="padmin-h1" style="font-size:24px;margin-bottom:24px;">' + esc(roleNames.director) + '</h1>' +
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:28px;">' +
        statCard('IDEAS PENDIENTES', ideasNueva.length) +
        statCard('PIEZAS EN REVISIÓN', piecesInReview.length) +
        statCard('PUBLICADAS ESTA SEMANA', piecesPublished + '<span style="font-size:14px;color:#6B6A60;font-weight:500;"> / ' + weeklyGoal + '</span>', '#2F5233') +
        statCard('PIPELINE COMERCIAL ACTIVO', activePipelineCount, '#C77D2E') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;">' +
        '<div>' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;"><p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0;">Ideas pendientes de decisión</p><button type="button" class="padmin-logout" data-action="goto" data-id="ideas">Ver bandeja &rarr;</button></div>' +
          '<div class="padmin-card">' + ideasNueva.map(function (i) {
            return '<div class="padmin-row clickable" data-action="goto" data-id="ideas"><div><p class="padmin-row-title">' + esc(i.title) + '</p><p class="padmin-row-meta">' + esc(i.category) + '</p></div><span class="padmin-idea-score">Score ' + i.score + '</span></div>';
          }).join('') + '</div>' +
        '</div>' +
        '<div>' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;"><p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0;">Piezas en revisión</p><button type="button" class="padmin-logout" data-action="goto" data-id="aprobacion">Ir a aprobación &rarr;</button></div>' +
          '<div class="padmin-card">' + piecesInReview.map(function (p) {
            return '<div class="padmin-row clickable" data-action="goto" data-id="aprobacion"><div><p class="padmin-row-title">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section) + ' &middot; ' + esc(p.author) + '</p></div>' + badge(p.status) + '</div>';
          }).join('') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderDashboardProduccion() {
    var myAuthor = roleNames.produccion;
    var myPieces = piecesData.filter(function (p) { return p.author === myAuthor; });
    var myDraftCount = myPieces.filter(function (p) { return p.status === 'Borrador'; }).length;
    var myReviewCount = myPieces.filter(function (p) { return p.status === 'En revisión'; }).length;
    var myPublishedCount = myPieces.filter(function (p) { return p.status === 'Publicada'; }).length;

    return '<div>' +
      '<p style="font-size:13px;color:#6B6A60;margin:0 0 4px;">Tus tareas</p>' +
      '<h1 class="padmin-h1" style="font-size:24px;margin-bottom:24px;">' + esc(roleNames.produccion) + '</h1>' +
      '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:28px;">' +
        statCard('PIEZAS ASIGNADAS', myPieces.length) +
        statCard('EN BORRADOR', myDraftCount) +
        statCard('EN REVISIÓN', myReviewCount, '#7A4A18') +
        statCard('PUBLICADAS ESTA SEMANA', myPublishedCount, '#2F5233') +
      '</div>' +
      '<p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0 0 12px;">Piezas en proceso</p>' +
      '<div class="padmin-card" style="margin-bottom:28px;">' + myPieces.map(function (p) {
        return '<div class="padmin-row clickable" data-action="goto" data-id="editor"><div><p class="padmin-row-title">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section) + '</p></div>' + badge(p.status) + '</div>';
      }).join('') + '</div>' +
      '<p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0 0 12px;">Checklist de publicación &middot; pieza de hoy</p>' +
      '<div class="padmin-card" style="padding:8px 16px;">' + checklistData.map(function (c) {
        var color = c.done ? '#2F5233' : '#D6D5CE';
        var bg = c.done ? '#2F5233' : 'transparent';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid #E3E2DD;"><div style="width:16px;height:16px;border-radius:4px;border:1.5px solid ' + color + ';background:' + bg + ';flex-shrink:0;"></div><span style="font-size:13px;color:#1F2A22;">' + esc(c.label) + '</span></div>';
      }).join('') + '</div>' +
    '</div>';
  }

  function renderDashboard() {
    if (state.role === 'director') return renderDashboardDirector();
    if (state.role === 'produccion') return renderDashboardProduccion();
    return '';
  }

  // ---------- ideas ----------

  function ideaCard(i) {
    return '<div class="padmin-idea-card' + (i.column === 'Descartada' ? ' discarded' : '') + '">' +
      '<p class="padmin-idea-cat">' + esc(i.category) + '</p>' +
      '<p class="padmin-idea-title">' + esc(i.title) + '</p>' +
      '<div class="padmin-idea-foot"><span class="padmin-idea-score">Score ' + i.score + '</span><span class="padmin-idea-avatar">' + initialsOf(i.collaborator) + '</span></div>' +
    '</div>';
  }

  function ideasKanban() {
    var cols = [
      { title: 'NUEVA', items: ideasData.filter(function (i) { return i.column === 'Nueva'; }) },
      { title: 'EN ANÁLISIS', items: ideasData.filter(function (i) { return i.column === 'En análisis'; }) },
      { title: 'APROBADA', items: ideasData.filter(function (i) { return i.column === 'Aprobada'; }) },
      { title: 'DESCARTADA', items: ideasData.filter(function (i) { return i.column === 'Descartada'; }) }
    ];
    return '<div>' +
      '<h1 class="padmin-h1">Bandeja de ideas</h1><p class="padmin-lede">Flujo editorial de ideas propuestas.</p>' +
      '<div class="padmin-kanban">' + cols.map(function (col) {
        return '<div><p class="padmin-kanban-col-title">' + col.title + ' &middot; ' + col.items.length + '</p><div class="padmin-kanban-cards">' + col.items.map(ideaCard).join('') + '</div></div>';
      }).join('') + '</div>' +
    '</div>';
  }

  function ideasMine() {
    var myCollaborator = roleNames.colaborador;
    var myIdeas = ideasData.filter(function (i) { return i.collaborator === myCollaborator; });
    var demoNote = state.demoNote === 'idea' ? '<p class="padmin-demo-hint">' + PROTO_NOTE + '</p>' : '';
    return '<div style="max-width:640px;">' +
      '<h1 class="padmin-h1" style="font-size:22px;">Tus ideas</h1>' +
      '<p class="padmin-lede">Envía una idea de nota y da seguimiento a su estado.</p>' +
      '<div class="padmin-card" style="padding:20px;margin-bottom:24px;">' +
        '<p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0 0 14px;">Nueva idea</p>' +
        '<form data-action="submit-idea">' +
          '<div class="padmin-field"><label for="idea-title">Título</label><input id="idea-title" type="text"></div>' +
          '<div class="padmin-field"><label for="idea-cat">Categoría</label><select id="idea-cat"><option>Local</option><option>Cultura</option><option>Economía</option><option>Entretenimiento</option><option>Deportes</option><option>Opinión</option></select></div>' +
          '<div class="padmin-field"><label for="idea-desc">Descripción</label><textarea id="idea-desc" style="min-height:70px;"></textarea></div>' +
          '<button type="submit" class="padmin-btn" style="align-self:flex-start;">Enviar idea</button>' +
          demoNote +
        '</form>' +
      '</div>' +
      '<p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0 0 12px;">Estado de tus ideas</p>' +
      '<div class="padmin-card">' + myIdeas.map(function (i) {
        return '<div class="padmin-row"><div><p class="padmin-row-title">' + esc(i.title) + '</p><p class="padmin-row-meta">' + esc(i.category) + '</p></div>' + badge(i.column) + '</div>';
      }).join('') + '</div>' +
    '</div>';
  }

  function renderIdeas() {
    return state.role === 'colaborador' ? ideasMine() : ideasKanban();
  }

  // ---------- editor ----------

  function renderEditor() {
    return '<div class="padmin-editor-wrap">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
        '<h1 style="font-weight:600;font-size:20px;color:#1F2A22;margin:0;">Editor de nota</h1>' + badge('En revisión') +
      '</div>' +
      '<div class="padmin-editor-card">' +
        '<label style="font-size:11px;color:#6B6A60;display:block;margin-bottom:8px;">Título</label>' +
        '<div class="padmin-title-input" contenteditable="true">Fuerte de San Carlos abre nueva ruta nocturna para visitantes</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<label style="font-size:11px;color:#6B6A60;">Cuerpo</label>' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<select id="draft-model" style="font-size:11px;color:#1F2A22;border:0.5px solid #E3E2DD;border-radius:6px;padding:6px 8px;background:#fff;">' +
              '<option value="local"' + (state.draftModel === 'local' ? ' selected' : '') + '>Modelo local</option>' +
              '<option value="sonnet"' + (state.draftModel === 'sonnet' ? ' selected' : '') + '>Claude Sonnet — piezas complejas</option>' +
            '</select>' +
            '<button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-draft">Generar borrador con IA</button>' +
          '</div>' +
        '</div>' +
        '<textarea id="note-body" class="padmin-body-textarea">' + esc(state.noteBody) + '</textarea>' +
        '<div class="padmin-editor-grid2">' +
          '<div class="padmin-field" style="margin:0;"><label>Sección editorial</label><select><option>Cultura</option><option>Local</option><option>Economía</option><option>Deportes</option><option>Entretenimiento</option><option>Opinión</option></select></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Colaborador asignado</label><select><option>Ana Torres</option><option>Carlos Mendoza</option><option>Luisa Pérez</option></select></div>' +
        '</div>' +
        '<div class="padmin-editor-grid2">' +
          '<div class="padmin-field" style="margin:0;"><label>Meta título (SEO)</label><input type="text"></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Slug</label><input type="text" value="/cultura/fuerte-san-carlos-ruta-nocturna"></div>' +
        '</div>' +
        '<div class="padmin-field"><label>Meta descripción (SEO)</label><textarea style="min-height:54px;"></textarea></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Patrocinador asociado (opcional)</label><select><option>Ninguno</option><option>Ferretería Reyes</option><option>Hotel San Carlos</option></select></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button type="button" class="padmin-btn padmin-btn-brand">Enviar a revisión</button>' +
        '<button type="button" class="padmin-btn-outline">Guardar borrador</button>' +
      '</div>' +
      (state.demoNote === 'editor' ? '<p class="padmin-demo-hint">' + PROTO_NOTE + '</p>' : '') +
    '</div>';
  }

  // ---------- aprobación ----------

  var transparencyLabels = ['100% humano', 'Asistido por IA', 'Generado con IA'];

  function renderAprobacionDesktop(piecesInReview) {
    return '<div class="padmin-card">' + piecesInReview.map(function (p) {
      var selected = state.transparency[p.id];
      var approveBg = selected ? '#2F5233' : '#EFEFEA';
      var approveColor = selected ? '#fff' : '#B9B9B0';
      var approveCursor = selected ? 'pointer' : 'not-allowed';
      var chips = transparencyLabels.map(function (label) {
        var active = selected === label;
        return '<span class="padmin-chip" data-action="set-transparency" data-piece="' + p.id + '" data-label="' + esc(label) + '" style="background:' + (active ? '#2F5233' : '#F0EFEA') + ';color:' + (active ? '#fff' : '#6B6A60') + ';border-color:' + (active ? '#2F5233' : '#E3E2DD') + ';">' + esc(label) + '</span>';
      }).join('');
      return '<div style="padding:16px 18px;border-bottom:0.5px solid #E3E2DD;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<div><p class="padmin-row-title" style="font-size:14px;">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section) + ' &middot; ' + esc(p.author) + '</p></div>' +
          '<div style="display:flex;gap:8px;">' +
            '<span class="padmin-btn-sm" style="background:' + approveBg + ';color:' + approveColor + ';cursor:' + approveCursor + ';">Aprobar</span>' +
            '<span class="padmin-btn-sm padmin-btn-outline" style="font-weight:500;" data-action="open-comentario" data-id="' + p.id + '">Devolver con comentarios</span>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-size:11px;color:#6B6A60;margin-right:2px;">Origen del contenido (obligatorio):</span>' + chips + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderAprobacionMobile(piecesInReview) {
    return '<div style="display:flex;justify-content:center;"><div style="max-width:380px;width:100%;display:flex;flex-direction:column;gap:14px;">' +
      piecesInReview.map(function (p) {
        return '<div class="padmin-card" style="padding:14px;">' +
          '<p class="padmin-row-title" style="font-size:14px;font-weight:600;">' + esc(p.title) + '</p>' +
          '<p class="padmin-row-meta" style="margin-bottom:12px;">' + esc(p.section) + ' &middot; ' + esc(p.author) + '</p>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<span style="display:block;text-align:center;font-size:14px;font-weight:600;background:#EFEFEA;color:#B9B9B0;padding:14px;border-radius:8px;">Aprobar</span>' +
            '<span class="padmin-btn-outline" style="text-align:center;padding:14px;" data-action="open-comentario" data-id="' + p.id + '">Devolver con comentarios</span>' +
          '</div>' +
        '</div>';
      }).join('') + '</div></div>';
  }

  function renderComentarioModal() {
    if (state.comentarioPieceId == null) return '';
    var piece = piecesData.filter(function (p) { return p.id === state.comentarioPieceId; })[0];
    if (!piece) return '';
    return '<div class="padmin-overlay">' +
      '<div class="padmin-overlay-bg" data-action="close-comentario"></div>' +
      '<div class="padmin-modal">' +
        '<p style="font-size:15px;font-weight:600;color:#1F2A22;margin:0 0 4px;">Devolver con comentarios</p>' +
        '<p style="font-size:12px;color:#6B6A60;margin:0 0 16px;">' + esc(piece.title) + '</p>' +
        '<label style="font-size:11px;color:#6B6A60;display:block;margin-bottom:6px;">Motivo de la devolución</label>' +
        '<textarea id="comentario-text" placeholder="Describe qué debe ajustarse antes de publicar..." style="width:100%;min-height:100px;border:0.5px solid #E3E2DD;border-radius:6px;background:#F7F7F5;padding:10px 12px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical;margin-bottom:16px;">' + esc(state.comentarioText) + '</textarea>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
          '<button type="button" class="padmin-btn-outline" data-action="close-comentario">Cancelar</button>' +
          '<button type="button" class="padmin-btn" data-action="confirm-comentario">Confirmar devolución</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderAprobacion() {
    var piecesInReview = piecesData.filter(function (p) { return p.status === 'En revisión'; });
    var desktopActive = !state.mobileAprobacion;
    return '<div>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">' +
        '<h1 class="padmin-h1" style="font-size:22px;margin:0;">Aprobación</h1>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;">' +
          '<span class="padmin-chip" data-action="set-mobile" data-value="false" style="background:' + (desktopActive ? '#2F5233' : '#fff') + ';color:' + (desktopActive ? '#fff' : '#1F2A22') + ';">Escritorio</span>' +
          '<span class="padmin-chip" data-action="set-mobile" data-value="true" style="background:' + (!desktopActive ? '#2F5233' : '#fff') + ';color:' + (!desktopActive ? '#fff' : '#1F2A22') + ';">Vista móvil</span>' +
        '</div>' +
      '</div>' +
      '<p class="padmin-lede">Piezas pendientes de revisión editorial.</p>' +
      (desktopActive ? renderAprobacionDesktop(piecesInReview) : renderAprobacionMobile(piecesInReview)) +
      renderComentarioModal() +
    '</div>';
  }

  // ---------- comercial ----------

  function commColumn(title, col, color) {
    var items = commercialData.filter(function (c) { return c.column === col; });
    return '<div><p class="padmin-kanban-col-title">' + title + ' &middot; ' + items.length + '</p><div class="padmin-kanban-cards">' + items.map(function (c) {
      return '<div class="padmin-idea-card"><p class="padmin-row-title" style="margin-bottom:6px;">' + esc(c.business) + '</p><p class="padmin-row-meta" style="margin-bottom:8px;">' + esc(c.interest) + '</p><p style="font-size:12px;font-weight:600;color:' + color + ';margin:0 0 8px;">' + esc(c.value) + '</p><p style="font-size:10px;color:#9A9A93;margin:0;">Últ. seguimiento: ' + esc(c.lastContact) + '</p></div>';
    }).join('') + '</div></div>';
  }

  function renderComercial() {
    return '<div>' +
      '<h1 class="padmin-h1">Pipeline comercial</h1><p class="padmin-lede">Prospectos activos del equipo comercial.</p>' +
      '<div class="padmin-kanban">' +
        commColumn('IDENTIFICADO', 'Identificado', '#C77D2E') +
        commColumn('CONTACTADO', 'Contactado', '#C77D2E') +
        commColumn('PROPUESTA ENVIADA', 'Propuesta enviada', '#C77D2E') +
        commColumn('CERRADO', 'Cerrado', '#2F5233') +
      '</div>' +
    '</div>';
  }

  // ---------- métricas ----------

  function renderMetricas() {
    var maxWeekly = Math.max.apply(null, weeklyPiecesData.map(function (w) { return w.count; }));
    var chartW = 420, chartH = 110, chartPad = 10;
    var stepX = (chartW - chartPad * 2) / (weeklyPiecesData.length - 1);
    var points = weeklyPiecesData.map(function (w, idx) {
      var x = chartPad + idx * stepX;
      var y = chartH - chartPad - (w.count / maxWeekly) * (chartH - chartPad * 2);
      return { x: x, y: y, week: w.week };
    });
    var polyline = points.map(function (p) { return p.x + ',' + p.y; }).join(' ');
    var weeklyPct = Math.round((piecesPublished / weeklyGoal) * 100) + '%';

    return '<div style="max-width:820px;">' +
      '<h1 class="padmin-h1" style="font-size:22px;margin-bottom:22px;">Panel de métricas</h1>' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:24px;">' +
        '<div class="padmin-card" style="padding:20px;"><p class="padmin-stat-label">PIEZAS PUBLICADAS VS. OBJETIVO SEMANAL</p><p style="font-weight:700;font-size:24px;color:#1F2A22;margin:0 0 10px;">' + piecesPublished + ' / ' + weeklyGoal + '</p><div style="width:100%;height:8px;background:#F0EFEA;border-radius:4px;overflow:hidden;"><div style="height:100%;background:#2F5233;width:' + weeklyPct + ';"></div></div></div>' +
        '<div class="padmin-card" style="padding:20px;"><p class="padmin-stat-label">ALCANCE TOTAL</p><div style="display:flex;align-items:baseline;gap:10px;"><p style="font-weight:700;font-size:28px;color:#1F2A22;margin:0;">' + totalReach + '</p><span style="font-size:12px;font-weight:600;color:#2F5233;background:#E1E8DD;padding:3px 8px;border-radius:4px;">+' + reachVsLastWeekPct + '% vs. semana pasada</span></div></div>' +
      '</div>' +
      '<p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0 0 12px;">Piezas publicadas por semana</p>' +
      '<div class="padmin-card" style="padding:20px;margin-bottom:24px;">' +
        '<svg viewBox="0 0 ' + chartW + ' ' + chartH + '" width="100%" height="110" style="display:block;overflow:visible;">' +
          '<polyline points="' + polyline + '" fill="none" stroke="#2F5233" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
          points.map(function (p) { return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="#2F5233"></circle>'; }).join('') +
        '</svg>' +
        '<div class="padmin-chart-labels">' + points.map(function (p) { return '<span>' + esc(p.week) + '</span>'; }).join('') + '</div>' +
      '</div>' +
      '<p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0 0 12px;">Crecimiento por canal</p>' +
      '<div class="padmin-card">' + socialChannelsData.map(function (ch) {
        return '<div class="padmin-row"><span style="font-size:13px;color:#1F2A22;">' + esc(ch.name) + '</span><span style="font-size:13px;font-weight:600;color:#2F5233;">' + esc(ch.growth) + '</span></div>';
      }).join('') + '</div>' +
    '</div>';
  }

  // ---------- radar ----------

  function sentimentStyle(label) {
    if (label === 'positivo') return { color: '#2F5233', text: 'Positivo' };
    if (label === 'negativo') return { color: '#A6432E', text: 'Negativo' };
    return { color: '#6B6A60', text: 'Neutral' };
  }

  function renderRadarDetail() {
    if (state.selectedRadarId == null) return '';
    var topic = radarData.filter(function (r) { return r.id === state.selectedRadarId; })[0];
    if (!topic) return '';
    return '<div class="padmin-overlay">' +
      '<div class="padmin-overlay-bg" data-action="close-radar"></div>' +
      '<div class="padmin-drawer">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;"><p class="padmin-drawer-eyebrow">FICHA DE CONTEXTO</p><span class="padmin-drawer-close" data-action="close-radar">Cerrar &times;</span></div>' +
        '<h2 style="font-size:18px;font-weight:600;color:#1F2A22;margin:0 0 16px;line-height:1.35;">' + esc(topic.title) + '</h2>' +
        '<div style="display:flex;gap:16px;margin-bottom:22px;"><span style="font-size:11px;color:#6B6A60;">Fuente: <b style="color:#1F2A22;">' + esc(topic.source) + '</b></span><span style="font-size:11px;color:#6B6A60;">Menciones: <b style="color:#1F2A22;">' + topic.mentions + '</b></span></div>' +
        '<p class="padmin-drawer-section-title">ANTECEDENTES</p><p class="padmin-drawer-section-body">' + esc(topic.antecedentes) + '</p>' +
        '<p class="padmin-drawer-section-title">ACTORES INVOLUCRADOS</p><p class="padmin-drawer-section-body">' + esc(topic.actores) + '</p>' +
        '<p class="padmin-drawer-section-title">ÁNGULOS DE COBERTURA SUGERIDOS</p><p class="padmin-drawer-section-body">' + esc(topic.angulos) + '</p>' +
        '<p class="padmin-drawer-section-title">POTENCIAL DE AUDIENCIA</p><p class="padmin-drawer-section-body" style="margin-bottom:0;">' + esc(topic.audiencia) + '</p>' +
      '</div>' +
    '</div>';
  }

  function renderRadar() {
    var sources = ['Todas', 'Perplexity', 'Facebook', 'TikTok'];
    var statuses = ['Todos', 'Nuevo', 'Revisado'];
    var sourceChips = sources.map(function (src) {
      var active = state.radarSource === src;
      return '<span class="padmin-chip" data-action="set-radar-source" data-value="' + esc(src) + '" style="background:' + (active ? '#2F5233' : '#fff') + ';color:' + (active ? '#fff' : '#1F2A22') + ';border-color:' + (active ? '#2F5233' : '#E3E2DD') + ';">' + esc(src) + '</span>';
    }).join('');
    var statusChips = statuses.map(function (st) {
      var active = state.radarStatus === st;
      return '<span class="padmin-chip" data-action="set-radar-status" data-value="' + esc(st) + '" style="background:' + (active ? '#C77D2E' : '#fff') + ';color:' + (active ? '#fff' : '#1F2A22') + ';border-color:' + (active ? '#C77D2E' : '#E3E2DD') + ';">' + esc(st) + '</span>';
    }).join('');
    var filtered = radarData.filter(function (r) {
      return (state.radarSource === 'Todas' || r.source === state.radarSource) && (state.radarStatus === 'Todos' || r.status === state.radarStatus);
    });

    return '<div>' +
      '<h1 class="padmin-h1">RADAR &middot; Social listening</h1>' +
      '<p class="padmin-lede">Temas detectados por el agente en fuentes públicas. Feed de trabajo, no contenido editorial.</p>' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap;">' + sourceChips + '<span style="width:1px;height:16px;background:#E3E2DD;margin:0 6px;"></span>' + statusChips + '</div>' +
      '<div class="padmin-card">' +
        '<div class="padmin-table-head" style="grid-template-columns:1fr 100px 90px 90px 90px;"><span>TEMA</span><span>FUENTE</span><span>MENCIONES</span><span>SENTIMIENTO</span><span>ESTADO</span></div>' +
        filtered.map(function (r) {
          var sent = sentimentStyle(r.sentiment);
          var stStyle = r.status === 'Nuevo' ? { bg: '#F3E4D4', color: '#7A4A18' } : { bg: '#E1E8DD', color: '#2F5233' };
          return '<div class="padmin-table-row clickable" data-action="open-radar" data-id="' + r.id + '" style="grid-template-columns:1fr 100px 90px 90px 90px;">' +
            '<span style="font-size:13px;color:#1F2A22;">' + esc(r.title) + '</span>' +
            '<span style="font-size:12px;color:#6B6A60;">' + esc(r.source) + '</span>' +
            '<span style="font-size:12px;color:#1F2A22;font-weight:600;">' + r.mentions + '</span>' +
            '<span style="font-size:11px;font-weight:600;color:' + sent.color + ';">' + sent.text + '</span>' +
            '<span class="padmin-badge" style="background:' + stStyle.bg + ';color:' + stStyle.color + ';width:fit-content;">' + esc(r.status) + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      renderRadarDetail() +
    '</div>';
  }

  // ---------- propuestas ----------

  var sensColorMap = { verde: '#2F5233', amarillo: '#C9932F', rojo: '#A6432E' };

  function renderPropuestas() {
    return '<div>' +
      '<h1 class="padmin-h1">Propuestas de contenido</h1>' +
      '<p class="padmin-lede">Generadas por el agente a partir de temas detectados en RADAR.</p>' +
      '<div class="padmin-propuestas-grid">' + propuestasData.map(function (p) {
        var decision = state.propuestaDecisions[p.id];
        var isRejecting = state.propuestaRejecting === p.id;
        var body;
        if (decision) {
          var decidedLabel = decision === 'aprobada' ? 'Aprobada' : 'Rechazada';
          var decidedBg = decision === 'aprobada' ? '#E1E8DD' : '#F0DEDA';
          var decidedColor = decision === 'aprobada' ? '#2F5233' : '#A6432E';
          body = '<span class="padmin-badge" style="background:' + decidedBg + ';color:' + decidedColor + ';">' + decidedLabel + '</span>';
        } else if (isRejecting) {
          body = '<div><label style="font-size:11px;color:#6B6A60;display:block;margin:0 0 6px;">Motivo del rechazo</label>' +
            '<textarea id="reject-reason-' + p.id + '" style="width:100%;min-height:56px;border:0.5px solid #E3E2DD;border-radius:6px;background:#F7F7F5;margin-bottom:8px;padding:8px;font:inherit;font-size:12px;box-sizing:border-box;"></textarea>' +
            '<button type="button" class="padmin-btn-sm" style="background:#A6432E;color:#fff;" data-action="confirm-reject-propuesta" data-id="' + p.id + '">Confirmar rechazo</button></div>';
        } else {
          body = '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="padmin-btn-sm" style="background:#2F5233;color:#fff;" data-action="approve-propuesta" data-id="' + p.id + '">Aprobar</button>' +
            '<button type="button" class="padmin-btn-sm padmin-btn-outline" style="font-weight:500;">Editar</button>' +
            '<button type="button" class="padmin-btn-sm padmin-btn-danger-outline" data-action="start-reject-propuesta" data-id="' + p.id + '">Rechazar</button>' +
          '</div>';
        }
        return '<div class="padmin-propuesta-card">' +
          '<span class="padmin-sens-dot" style="background:' + sensColorMap[p.sensibilidad] + ';"></span>' +
          '<p style="font-size:10px;font-weight:600;color:#7A4A18;background:#F3E4D4;display:inline-block;padding:3px 8px;border-radius:4px;margin:0 0 10px;">' + esc(p.formato) + '</p>' +
          '<p style="font-size:11px;color:#6B6A60;margin:0 0 4px;">Tema origen (RADAR)</p>' +
          '<p style="font-size:13px;font-weight:500;color:#1F2A22;margin:0 0 10px;line-height:1.35;">' + esc(p.tema) + '</p>' +
          '<p style="font-size:12px;color:#3F3F3A;margin:0 0 16px;line-height:1.4;">' + esc(p.angulo) + '</p>' +
          body +
        '</div>';
      }).join('') + '</div>' +
    '</div>';
  }

  // ---------- hermes ----------

  function renderHermes() {
    return '<div>' +
      '<h1 class="padmin-h1">Estado del agente Hermes</h1>' +
      '<p class="padmin-lede">Bitácora de actividad y habilidades generadas por el agente.</p>' +
      '<p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0 0 12px;">Actividad reciente</p>' +
      '<div class="padmin-hermes-log">' + hermesLogData.map(function (h) {
        var ok = h.result === 'exito';
        return '<div class="padmin-hermes-row"><span class="padmin-hermes-time">' + esc(h.time) + '</span><span class="padmin-hermes-task">' + esc(h.task) + '</span><span style="color:' + (ok ? '#7CB084' : '#D98A7A') + ';flex-shrink:0;">' + (ok ? '✓ éxito' : '✕ falló') + '</span></div>';
      }).join('') + '</div>' +
      '<p style="font-size:12px;font-weight:600;color:#1F2A22;margin:0 0 4px;">Skills generados desde tareas repetidas</p>' +
      '<p style="font-size:11px;color:#6B6A60;margin:0 0 12px;">El agente convierte patrones recurrentes en habilidades reutilizables.</p>' +
      '<div class="padmin-card">' + hermesSkillsData.map(function (sk) {
        return '<div class="padmin-row"><span style="font-size:13px;color:#1F2A22;">' + esc(sk.name) + '</span><span style="font-size:12px;font-weight:600;color:#6B6A60;">' + sk.count + ' usos</span></div>';
      }).join('') + '</div>' +
    '</div>';
  }

  // ---------- pipeline ----------

  function pipelineStepStyle(st) {
    if (st.status === 'completado') return { dotColor: '#2F5233', ringColor: '#2F5233', badgeBg: '#E1E8DD', badgeColor: '#2F5233', badgeLabel: '✅ Automático completado', textColor: '#1F2A22', weight: 500 };
    if (st.status === 'esperando') return { dotColor: '#C77D2E', ringColor: '#C77D2E', badgeBg: '#F3E4D4', badgeColor: '#7A4A18', badgeLabel: '⏳ Esperando aprobación', textColor: '#1F2A22', weight: 600 };
    if (st.status === 'fallo') return { dotColor: '#A6432E', ringColor: '#A6432E', badgeBg: '#F0DEDA', badgeColor: '#A6432E', badgeLabel: '❌ Falló', textColor: '#1F2A22', weight: 500 };
    return { dotColor: '#fff', ringColor: '#D6D5CE', badgeBg: '#F0EFEA', badgeColor: '#9A9A93', badgeLabel: 'Pendiente', textColor: '#9A9A93', weight: 400 };
  }

  function renderPipeline() {
    return '<div>' +
      '<h1 class="padmin-h1">Pipeline &middot; Buenos días, Perote</h1>' +
      '<p class="padmin-lede" style="margin-bottom:26px;">Newsletter matutino automatizado. El único punto de intervención humana obligatoria se resalta en ocre.</p>' +
      '<div style="max-width:640px;">' + pipelineStepsData.map(function (st) {
        var sty = pipelineStepStyle(st);
        return '<div class="padmin-pipeline-step">' +
          '<div class="padmin-pipeline-rail"><span class="padmin-pipeline-dot" style="background:' + sty.dotColor + ';border-color:' + sty.ringColor + ';"></span><span class="padmin-pipeline-line"></span></div>' +
          '<div class="padmin-pipeline-body">' +
            '<div class="padmin-pipeline-head"><p style="font-size:14px;font-weight:' + sty.weight + ';color:' + sty.textColor + ';margin:0;">' + esc(st.label) + '</p><span style="font-size:11px;color:#9A9A93;">' + esc(st.time) + '</span></div>' +
            '<span class="padmin-badge" style="background:' + sty.badgeBg + ';color:' + sty.badgeColor + ';">' + sty.badgeLabel + '</span>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
    '</div>';
  }

  // ---------- denegado ----------

  function renderDenegado() {
    var deniedLabelMap = {};
    navItemsAll.forEach(function (n) { deniedLabelMap[n.id] = n.label; });
    var label = state.deniedTarget ? (deniedLabelMap[state.deniedTarget] || state.deniedTarget) : '';
    return '<div class="padmin-denied-wrap"><div style="max-width:380px;text-align:center;">' +
      '<div class="padmin-denied-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#A6432E" stroke-width="1.8"/><path d="M8 8l8 8M16 8l-8 8" stroke="#A6432E" stroke-width="1.8" stroke-linecap="round"/></svg></div>' +
      '<h1 style="font-weight:600;font-size:19px;color:#1F2A22;margin:0 0 8px;">Sin acceso</h1>' +
      '<p style="font-size:13px;color:#6B6A60;margin:0 0 24px;line-height:1.5;">Tu rol (' + esc(roleLabels[state.role]) + ') no tiene permiso para ver «' + esc(label) + '». Si crees que esto es un error, contacta a tu Director editorial.</p>' +
      '<button type="button" class="padmin-btn" data-action="goto" data-id="' + landingFor(state.role) + '">Volver a Inicio</button>' +
    '</div></div>';
  }

  // ---------- configuración ----------

  function renderConfigUsuarios() {
    return '<div class="padmin-card" style="max-width:640px;">' +
      '<div class="padmin-table-head" style="grid-template-columns:1fr 1fr 90px;"><span>NOMBRE</span><span>ROL</span><span>ESTADO</span></div>' +
      usersData.map(function (u) {
        var st = u.active ? { label: 'Activo', bg: '#E1E8DD', color: '#2F5233' } : { label: 'Inactivo', bg: '#EFEFEA', color: '#9A9A93' };
        return '<div class="padmin-table-row" style="grid-template-columns:1fr 1fr 90px;"><span style="font-size:13px;color:#1F2A22;">' + esc(u.name) + '</span><span style="font-size:12px;color:#6B6A60;">' + esc(u.role) + '</span><span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';width:fit-content;">' + st.label + '</span></div>';
      }).join('') + '</div>';
  }

  function renderConfigPermisos() {
    return '<div class="padmin-card" style="max-width:780px;overflow:auto;">' +
      '<div class="padmin-table-head" style="grid-template-columns:2fr 70px 90px 80px 90px;"><span>MÓDULO</span><span>DIRECTOR</span><span>PRODUCCIÓN</span><span>COMERCIAL</span><span>COLABORADOR</span></div>' +
      permisosMatrix.map(function (row) {
        function mark(v) { return v ? '<span style="color:#2F5233;">✓</span>' : '<span style="color:#C7C6BC;">—</span>'; }
        return '<div class="padmin-table-row" style="grid-template-columns:2fr 70px 90px 80px 90px;"><span style="font-size:13px;color:#1F2A22;">' + esc(row.modulo) + '</span>' +
          '<span style="font-weight:600;">' + mark(row.director) + '</span>' +
          '<span style="font-weight:600;">' + mark(row.produccion) + '</span>' +
          '<span style="font-weight:600;">' + mark(row.comercial) + '</span>' +
          '<span style="font-weight:600;">' + mark(row.colaborador) + '</span></div>';
      }).join('') + '</div>';
  }

  function renderConfigIntegraciones() {
    return '<div class="padmin-integraciones-grid">' + integracionesData.map(function (i) {
      var st = i.connected ? { label: 'Conectado', bg: '#E1E8DD', color: '#2F5233', dot: '#2F5233' } : { label: 'Desconectado', bg: '#F0EFEA', color: '#9A9A93', dot: '#C7C6BC' };
      return '<div class="padmin-integracion-card"><div style="display:flex;align-items:center;gap:10px;"><span class="padmin-dot" style="background:' + st.dot + ';"></span><div><p style="font-size:13px;font-weight:500;color:#1F2A22;margin:0 0 2px;">' + esc(i.name) + '</p><p style="font-size:11px;color:#6B6A60;margin:0;">' + esc(i.desc) + '</p></div></div><span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + st.label + '</span></div>';
    }).join('') + '</div>';
  }

  function renderConfiguracion() {
    var tab = state.configTab;
    var body = tab === 'permisos' ? renderConfigPermisos() : (tab === 'integraciones' ? renderConfigIntegraciones() : renderConfigUsuarios());
    function tabBtn(id, label) {
      var active = tab === id;
      return '<button type="button" class="padmin-tab' + (active ? ' active' : '') + '" data-action="set-config-tab" data-tab="' + id + '">' + label + '</button>';
    }
    return '<div>' +
      '<h1 class="padmin-h1">Configuración</h1>' +
      '<p class="padmin-lede">Usuarios, permisos e integraciones del panel. Solo visible para Director.</p>' +
      '<div class="padmin-tabs">' + tabBtn('usuarios', 'Usuarios') + tabBtn('permisos', 'Permisos') + tabBtn('integraciones', 'Integraciones') + '</div>' +
      body +
    '</div>';
  }

  // ---------- top-level render ----------

  var screenRenderers = {
    dashboard: renderDashboard,
    ideas: renderIdeas,
    editor: renderEditor,
    aprobacion: renderAprobacion,
    comercial: renderComercial,
    metricas: renderMetricas,
    radar: renderRadar,
    propuestas: renderPropuestas,
    hermes: renderHermes,
    pipeline: renderPipeline,
    denegado: renderDenegado,
    configuracion: renderConfiguracion
  };

  function render() {
    var app = document.getElementById('app');
    if (state.screen === 'login') {
      app.innerHTML = renderLogin();
      return;
    }
    var fn = screenRenderers[state.screen] || renderDashboard;
    app.innerHTML = renderShell(fn());
    focusPreservingInputs();
  }

  // Textareas whose value is state-backed (noteBody, comentarioText) get their value set via
  // the template string above; nothing extra to focus here — kept as a hook for later screens.
  function focusPreservingInputs() {}

  // ---------- event delegation ----------

  function handleClick(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    switch (action) {
      case 'login': login(el.getAttribute('data-role')); break;
      case 'logout': logout(); break;
      case 'goto': goTo(el.getAttribute('data-id')); break;
      case 'toggle-notifications': setState({ showNotifications: !state.showNotifications }); break;
      case 'set-radar-source': setState({ radarSource: el.getAttribute('data-value') }); break;
      case 'set-radar-status': setState({ radarStatus: el.getAttribute('data-value') }); break;
      case 'open-radar': setState({ selectedRadarId: Number(el.getAttribute('data-id')) }); break;
      case 'close-radar': setState({ selectedRadarId: null }); break;
      case 'open-comentario': setState({ comentarioPieceId: Number(el.getAttribute('data-id')), comentarioText: '' }); break;
      case 'close-comentario': setState({ comentarioPieceId: null, comentarioText: '' }); break;
      case 'confirm-comentario': setState({ comentarioPieceId: null, comentarioText: '', demoNote: 'aprobacion' }); break;
      case 'set-mobile': setState({ mobileAprobacion: el.getAttribute('data-value') === 'true' }); break;
      case 'set-transparency': setState({ transparency: mergeKey(state.transparency, el.getAttribute('data-piece'), el.getAttribute('data-label')) }); break;
      case 'set-config-tab': setState({ configTab: el.getAttribute('data-tab') }); break;
      case 'approve-propuesta': setState({ propuestaDecisions: mergeKey(state.propuestaDecisions, el.getAttribute('data-id'), 'aprobada') }); break;
      case 'start-reject-propuesta': setState({ propuestaRejecting: Number(el.getAttribute('data-id')) }); break;
      case 'confirm-reject-propuesta': setState({ propuestaDecisions: mergeKey(state.propuestaDecisions, el.getAttribute('data-id'), 'rechazada'), propuestaRejecting: null }); break;
      case 'generate-draft':
        setState({ noteBody: state.draftModel === 'sonnet' ? draftSonnet : draftLocal });
        break;
      default: break;
    }
  }

  function mergeKey(obj, key, value) {
    var copy = {}, k;
    for (k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) copy[k] = obj[k]; }
    copy[key] = value;
    return copy;
  }

  function handleSubmit(e) {
    var form = e.target.closest('[data-action]');
    if (!form) return;
    var action = form.getAttribute('data-action');
    if (action === 'submit-login') {
      e.preventDefault();
      login('director');
    } else if (action === 'submit-idea') {
      e.preventDefault();
      form.reset();
      setState({ demoNote: 'idea' });
    }
  }

  function handleChange(e) {
    if (e.target.id === 'draft-model') state.draftModel = e.target.value;
  }

  function handleInput(e) {
    if (e.target.id === 'comentario-text') state.comentarioText = e.target.value;
    if (e.target.id === 'note-body') state.noteBody = e.target.value;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('app');
    app.addEventListener('click', handleClick);
    app.addEventListener('submit', handleSubmit);
    app.addEventListener('change', handleChange);
    app.addEventListener('input', handleInput);
    render();
  });
})();
