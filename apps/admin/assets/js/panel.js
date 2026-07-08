// CREA Panel Admin — internal newsroom tool. Conectado a /api/auth, /api/editorial,
// /api/listening, /api/commercial, /api/newsletter. Hermes (activity_log) y el pipeline
// "Buenos días, Perote" (newsletter_editions) son datos reales, no mock — dependen de
// que NOUS_PORTAL_API_KEY/RESEND_API_KEY/ELEVENLABS_API_KEY tengan valores válidos en
// .env. Solo Integraciones sigue con la lista de servicios fija en el backend.

(function () {
  'use strict';

  // ---------- API helper ----------

  var CREA_API_BASE = (function () {
    var meta = document.querySelector('meta[name="crea-api-base"]');
    var base = (meta && meta.content) || 'http://localhost:3000';
    // Meta en localhost (default dev) pero servido desde otro host: mismo origen.
    if (base.indexOf('localhost') !== -1 && location.hostname !== 'localhost') return '';
    return base;
  })();

  function adminApi(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(CREA_API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok) {
          var err = new Error((json && json.error) || 'API respondió ' + res.status);
          err.status = res.status;
          err.fields = json && json.fields;
          throw err;
        }
        return json;
      });
    });
  }

  // Binario (audio/mpeg): adminApi() asume JSON, así que esta es aparte.
  function adminApiBlob(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(CREA_API_BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (json) {
          throw new Error((json && json.error) || 'API respondió ' + res.status);
        });
      }
      return res.blob();
    });
  }

  // ---------- static copy (sin backend por decisión de alcance) ----------

  var roleLabels = { director: 'Director Editorial', produccion: 'Producción / Reportero', comercial: 'Comercial / Ventas', colaborador: 'Colaborador externo' };
  var navItemsAll = [
    { id: 'dashboard', label: 'Inicio' },
    { id: 'radar', label: 'RADAR' },
    { id: 'propuestas', label: 'Propuestas IA' },
    { id: 'ideas', label: 'Bandeja de ideas' },
    { id: 'editor', label: 'Editor de nota' },
    { id: 'aprobacion', label: 'Aprobación' },
    { id: 'producciones', label: 'Producciones' },
    { id: 'comercial', label: 'Pipeline comercial' },
    { id: 'leads', label: 'Leads' },
    { id: 'metricas', label: 'Métricas' },
    { id: 'hermes', label: 'Estado del agente' },
    { id: 'pipeline', label: 'Buenos días, Perote' },
    { id: 'configuracion', label: 'Configuración' }
  ];

  // ---------- state ----------

  var state = {
    token: null, user: null, allowedModules: [],
    screen: 'login', loginError: null,
    data: { ideas: null, proposalsByKey: {}, clients: null, topics: null, users: null, metrics: null, socialPosts: null, activity: null, integrations: null, pipeline: null, notifications: null, newsletterSettings: null, newsletterEvents: null, services: null, roleModules: null, leads: null, distLog: null, distChannels: null, competitors: null, siteMetrics: null, fbAccounts: null },
    distBusy: null,
    radarSource: 'Todas', radarStatus: 'Todos', radarBusy: false,
    radarTab: 'temas', competitorsBusy: false,
    leadsStatus: 'todos',
    propuestaRejecting: null,
    editorProposalId: null, editorDraft: null,
    generatingProposal: false, generatingDraft: false, qaResult: null, qaBusy: false, notaPreviewHtml: null,
    transparency: {}, comentarioPieceId: null, comentarioText: '',
    selectedRadarId: null,
    configTab: 'usuarios', showNotifications: false,
    newUserOpen: false, newUserError: null, editingUserId: null,
    serviceFormOpen: false, serviceFormError: null, editingServiceId: null,
    fbAccountFormOpen: false, fbAccountFormError: null, editingFbAccountId: null,
    socialFormOpen: false, socialFormError: null, socialBusy: false,
    clientFormOpen: false, clientFormError: null,
    newsletterContent: null, newsletterBusy: false, newsletterSending: false,
    newsletterPreview: null, newsletterSubscriberCount: null,
    newsletterAudioBusy: false, newsletterAudioUrl: null,
    demoNote: null, errorMsg: null, successMsg: null, soundMuted: false
  };
  state.soundMuted = isSoundMuted();

  function setState(patch) {
    var k;
    for (k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) state[k] = patch[k]; }
    if (Object.prototype.hasOwnProperty.call(patch, 'errorMsg')) {
      if (errorToastTimer) { clearTimeout(errorToastTimer); errorToastTimer = null; }
      if (patch.errorMsg) {
        playToastSound('error');
        errorToastTimer = setTimeout(function () { state.errorMsg = null; render(); }, 6000);
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'successMsg')) {
      if (successToastTimer) { clearTimeout(successToastTimer); successToastTimer = null; }
      if (patch.successMsg) {
        playToastSound('success');
        successToastTimer = setTimeout(function () { state.successMsg = null; render(); }, 4000);
      }
    }
    render();
  }

  // ---------- toasts: sonido + auto-dismiss ----------
  // Un solo timer por tipo (error/success) — nueva notificación del mismo tipo reinicia el conteo.
  var errorToastTimer = null;
  var successToastTimer = null;
  var audioCtx = null;

  function isSoundMuted() {
    try { return localStorage.getItem('crea-admin-sound-muted') === '1'; } catch (e) { return false; }
  }

  function playToastSound(kind) {
    if (isSoundMuted()) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var freqs = kind === 'error' ? [392] : [523.25, 659.25]; // G4 vs. C5→E5
      freqs.forEach(function (freq, i) {
        var t0 = audioCtx.currentTime + i * 0.09;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.16);
      });
    } catch (e) { /* autoplay bloqueado o Web Audio no soportado */ }
  }

  // ---------- small helpers ----------

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function relativeTime(iso) {
    if (!iso) return '';
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return 'hace ' + mins + 'm';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return 'hace ' + hours + 'h';
    return 'hace ' + Math.floor(hours / 24) + 'd';
  }

  function initialsOf(name) {
    return String(name || '?').split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  function statusStyle(label) {
    if (label === 'borrador' || label === 'nueva' || label === 'identificado') return { bg: 'var(--bg-soft)', color: 'var(--text-mute)' };
    if (label === 'nuevo') return { bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
    if (label === 'en_revision' || label === 'en_analisis') return { bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
    if (label === 'aprobada' || label === 'propuesta_enviada' || label === 'contactado') return { bg: 'var(--brand-soft)', color: 'var(--brand)' };
    if (label === 'published' || label === 'cerrado') return { bg: 'var(--brand)', color: '#fff' };
    if (label === 'descartada' || label === 'rechazada' || label === 'descartado') return { bg: 'var(--bg-soft)', color: 'var(--mute-2)' };
    return { bg: 'var(--bg-soft)', color: 'var(--text-mute)' };
  }

  var STATUS_LABEL = {
    borrador: 'Borrador', en_revision: 'En revisión', published: 'Publicada', rechazada: 'Rechazada', propuesta: 'Propuesta',
    nueva: 'Nueva', en_analisis: 'En análisis', aprobada: 'Aprobada', descartada: 'Descartada',
    identificado: 'Identificado', contactado: 'Contactado', propuesta_enviada: 'Propuesta enviada', cerrado: 'Cerrado',
    nuevo: 'Nuevo', descartado: 'Descartado'
  };

  function badge(statusKey) {
    var st = statusStyle(statusKey);
    var label = STATUS_LABEL[statusKey] || statusKey;
    return '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + esc(label) + '</span>';
  }

  function loadingCard(label) {
    return '<div class="padmin-card" style="padding:20px;"><p class="padmin-lede" style="margin:0;">' + esc(label || 'Cargando…') + '</p></div>';
  }

  function errorCard(err) {
    return '<div class="padmin-card" style="padding:20px;"><p class="padmin-lede" style="margin:0;">No pudimos cargar los datos (' + esc(err && err.message) + ').</p></div>';
  }

  function landingFor(role) {
    return role === 'comercial' ? 'comercial' : (role === 'colaborador' ? 'ideas' : 'dashboard');
  }

  // ---------- auth ----------

  function login(email, password) {
    setState({ loginError: null });
    adminApi('/api/auth/login', { method: 'POST', body: { email: email, password: password } })
      .then(function (res) {
        state.token = res.token;
        try { localStorage.setItem('crea-admin-token', res.token); } catch (e) { /* modo privado */ }
        return adminApi('/api/auth/session');
      })
      .then(function (session) {
        var landing = landingFor(session.role);
        setState({
          user: { id: session.id, name: session.name, role: session.role },
          allowedModules: session.allowedModules,
          screen: landing, loginError: null
        });
        loadScreenData(landing);
        loadNotifBadge();
      })
      .catch(function (err) {
        state.token = null;
        try { localStorage.removeItem('crea-admin-token'); } catch (e) { /* noop */ }
        setState({ loginError: err.status === 401 ? 'Correo o contraseña incorrectos.' : 'No pudimos conectar con el servidor.' });
      });
  }

  function loadNotifBadge() {
    if (state.user.role !== 'director') return;
    adminApi('/api/admin/activity?limit=5').then(function (r) { setData({ notifications: r }); }).catch(function () { /* badge best-effort */ });
  }

  function logout() {
    state.token = null;
    try { localStorage.removeItem('crea-admin-token'); } catch (e) { /* noop */ }
    setState({
      user: null, allowedModules: [], screen: 'login', loginError: null,
      errorMsg: null, successMsg: null,
      data: { ideas: null, proposalsByKey: {}, clients: null, topics: null, users: null, metrics: null, socialPosts: null, activity: null, integrations: null, pipeline: null, notifications: null, newsletterSettings: null, newsletterEvents: null }
    });
  }

  function tryResumeSession() {
    var saved;
    try { saved = localStorage.getItem('crea-admin-token'); } catch (e) { saved = null; }
    if (!saved) return render();
    state.token = saved;
    adminApi('/api/auth/session')
      .then(function (session) {
        var landing = landingFor(session.role);
        setState({
          user: { id: session.id, name: session.name, role: session.role },
          allowedModules: session.allowedModules,
          screen: landing
        });
        loadScreenData(landing);
        loadNotifBadge();
      })
      .catch(function () {
        state.token = null;
        try { localStorage.removeItem('crea-admin-token'); } catch (e) { /* noop */ }
        render();
      });
  }

  function goTo(id, extra) {
    var allowed = state.allowedModules || [];
    if (allowed.indexOf(id) === -1) {
      setState({ screen: 'denegado', deniedTarget: id, showNotifications: false });
      return;
    }
    var patch = { screen: id, deniedTarget: null, showNotifications: false, mobileNavOpen: false };
    if (id === 'editor') patch.editorProposalId = (extra != null ? extra : null);
    setState(patch);
    loadScreenData(id, extra);
  }

  function goHome() {
    setState({ screen: landingFor(state.user.role), deniedTarget: null });
  }

  // ---------- data loading (fetch-on-enter, cache in state.data) ----------

  function setData(patch) {
    state.data = Object.assign({}, state.data, patch);
    render();
  }

  function loadProposals(key, query) {
    if (state.data.proposalsByKey[key]) return;
    adminApi('/api/editorial/proposals?' + query)
      .then(function (rows) {
        var byKey = Object.assign({}, state.data.proposalsByKey);
        byKey[key] = rows;
        setData({ proposalsByKey: byKey });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function invalidateProposals() {
    state.data.proposalsByKey = {};
  }

  function loadScreenData(screen, extra) {
    if (screen === 'dashboard') {
      loadProposals('en_revision', 'status=en_revision');
      if (state.user.role === 'produccion') loadProposals('mine', 'author_id=' + state.user.id);
      if (!state.data.ideas) adminApi('/api/editorial/ideas').then(function (r) { setData({ ideas: r }); });
    } else if (screen === 'ideas') {
      adminApi('/api/editorial/ideas').then(function (r) { setData({ ideas: r }); });
    } else if (screen === 'editor') {
      var id = extra != null ? extra : state.editorProposalId;
      loadProposals('borrador', 'status=borrador');
      loadProposals('en_revision', 'status=en_revision');
      if (id) {
        adminApi('/api/editorial/proposals/' + id).then(function (p) {
          setState({ editorProposalId: id, notaPreviewHtml: null, editorImagePrompt: null, editorDraft: {
            title: p.title || '', body: p.body || '', section: p.section || '', dek: p.dek || '', slug: p.slug || '',
            cover_image_url: p.cover_image_url || '', author_name: p.author_name || state.user.name,
            is_sponsored: Boolean(p.is_sponsored), sponsor_name: p.sponsor_name || '',
            image_prompt: p.image_prompt || ''
          } });
        });
      }
    } else if (screen === 'aprobacion') {
      loadProposals('en_revision', 'status=en_revision');
      loadProposals('published', 'status=published');
      adminApi('/api/distribution/channels').then(function (r) { setData({ distChannels: r }); }).catch(function () { /* best-effort */ });
      adminApi('/api/distribution/log?limit=30').then(function (r) { setData({ distLog: r }); }).catch(function () { /* best-effort */ });
    } else if (screen === 'comercial') {
      adminApi('/api/commercial/clients').then(function (r) { setData({ clients: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
    } else if (screen === 'leads') {
      adminApi('/api/commercial/leads').then(function (r) { setData({ leads: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
    } else if (screen === 'metricas') {
      adminApi('/api/editorial/metrics').then(function (r) { setData({ metrics: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
    } else if (screen === 'radar') {
      adminApi('/api/listening/topics').then(function (r) { setData({ topics: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      if (state.radarTab === 'competencia' && !state.data.competitors) {
        adminApi('/api/listening/competitors').then(function (r) { setData({ competitors: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      }
    } else if (screen === 'propuestas') {
      loadProposals('propuesta', 'status=propuesta');
      loadProposals('rechazada', 'status=rechazada');
    } else if (screen === 'producciones') {
      adminApi('/api/admin/social').then(function (r) { setData({ socialPosts: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
    } else if (screen === 'configuracion') {
      if (state.configTab === 'usuarios') adminApi('/api/auth/users').then(function (r) { setData({ users: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      if (state.configTab === 'permisos' && !state.data.roleModules) adminApi('/api/auth/roles').then(function (r) { setData({ roleModules: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      if (state.configTab === 'integraciones') adminApi('/api/admin/integrations').then(function (r) { setData({ integrations: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      if (state.configTab === 'newsletter') {
        adminApi('/api/newsletter/settings').then(function (r) { setData({ newsletterSettings: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
        adminApi('/api/newsletter/events').then(function (r) { setData({ newsletterEvents: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      }
      if (state.configTab === 'servicios') adminApi('/api/commercial/services').then(function (r) { setData({ services: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      if (state.configTab === 'cuentas-fb') adminApi('/api/listening/competitors/accounts').then(function (r) { setData({ fbAccounts: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      if (state.configTab === 'metricas-sitio') adminApi('/api/admin/site-metrics').then(function (r) { setData({ siteMetrics: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
    } else if (screen === 'hermes') {
      adminApi('/api/admin/activity?limit=20').then(function (r) { setData({ activity: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
    } else if (screen === 'pipeline') {
      adminApi('/api/editorial/pipeline').then(function (r) { setData({ pipeline: r }); }).catch(function (err) { setState({ errorMsg: err.message }); });
      adminApi('/api/newsletter/subscribers/count').then(function (r) { setState({ newsletterSubscriberCount: r.count }); }).catch(function () { /* best-effort */ });
      if (!state.newsletterContent) {
        adminApi('/api/newsletter/pending').then(function (r) { if (r) setState({ newsletterContent: r }); }).catch(function () { /* best-effort */ });
      }
    }
  }

  // ---------- shared shell pieces ----------

  function renderNav() {
    var allowed = state.allowedModules || [];
    return navItemsAll.filter(function (n) { return allowed.indexOf(n.id) !== -1; }).map(function (n) {
      var active = state.screen === n.id;
      var label = (n.id === 'ideas' && state.user.role === 'colaborador') ? 'Mis ideas' : n.label;
      return '<button type="button" class="padmin-nav-item' + (active ? ' active' : '') + '" data-action="goto" data-id="' + n.id + '">' + esc(label) + '</button>';
    }).join('');
  }

  function getLastNotifSeen() {
    try { return localStorage.getItem('crea-admin-last-notif-seen'); } catch (e) { return null; }
  }

  function unseenNotifCount() {
    var notifs = state.data.notifications;
    if (!notifs) return 0;
    var lastSeen = getLastNotifSeen();
    if (!lastSeen) return notifs.length;
    return notifs.filter(function (n) { return n.created_at > lastSeen; }).length;
  }

  function renderBellAndNotifs() {
    // La bitácora (/api/admin/activity) es solo-director; para otros roles la campana
    // quedaba en "Cargando…" para siempre. Sin datos, sin campana.
    if (state.user.role !== 'director') return '';
    var notifs = state.data.notifications;
    var count = unseenNotifCount();
    var badgeHtml = count > 0 ? '<span class="padmin-bell-badge">' + (count > 9 ? '9+' : count) + '</span>' : '';
    var panel = '';
    if (state.showNotifications) {
      var lastSeen = getLastNotifSeen();
      var itemsHtml;
      if (!notifs) itemsHtml = '<div class="padmin-notif-item"><p>Cargando…</p></div>';
      else if (!notifs.length) itemsHtml = '<div class="padmin-notif-item"><p>Sin actividad reciente.</p></div>';
      else itemsHtml = notifs.map(function (n) {
        var isNew = !lastSeen || n.created_at > lastSeen;
        return '<div class="padmin-notif-item' + (isNew ? ' unread' : '') + '"><p>' + (isNew ? '<span class="padmin-notif-dot"></span>' : '') + esc(n.detail || n.action) + '</p><p class="padmin-notif-time">' + esc(relativeTime(n.created_at)) + '</p></div>';
      }).join('');
      panel = '<div class="padmin-notif-panel"><div class="padmin-notif-title-row"><p class="padmin-notif-title">Notificaciones</p>' +
        (count > 0 ? '<span class="padmin-notif-count">' + count + ' nueva' + (count === 1 ? '' : 's') + '</span>' : '') +
        '</div><div class="padmin-notif-list">' + itemsHtml + '</div></div>';
    }
    return '<span class="padmin-bell-wrap"><span class="padmin-bell' + (count > 0 ? ' has-unread' : '') + '" data-action="toggle-notifications" title="Notificaciones">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16l-2-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 21a2.5 2.5 0 0 0 5 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      badgeHtml +
      '</span>' + panel + '</span>';
  }

  function renderSoundToggle() {
    var muted = !!state.soundMuted;
    var icon = muted
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M18 9l4 6M22 9l-4 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    return '<span class="padmin-sound-toggle' + (muted ? ' muted' : '') + '" data-action="toggle-sound" title="' + (muted ? 'Activar sonido de avisos' : 'Silenciar sonido de avisos') + '">' + icon + '</span>';
  }

  function renderSidebar() {
    // Hamburguesa solo móvil (≤640px, CSS): el sidebar colapsa a barra superior y
    // nav+cuenta se despliegan al tocar el botón. En desktop el botón no existe visualmente.
    var toggleIcon = state.mobileNavOpen
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    return '<div class="padmin-sidebar' + (state.mobileNavOpen ? ' nav-open' : '') + '">' +
      '<div class="padmin-sidebar-brand"><img src="assets/img/logo-crea.png" alt=""><span class="name">CREA</span><span class="badge">PANEL</span>' +
        '<button type="button" class="padmin-menu-toggle" data-action="toggle-mobile-nav" aria-label="Menú" aria-expanded="' + (state.mobileNavOpen ? 'true' : 'false') + '">' + toggleIcon + '</button>' +
      '</div>' +
      '<div class="padmin-nav">' + renderNav() + '</div>' +
      '<div class="padmin-account">' +
        '<div class="padmin-account-row">' +
          '<div><p class="padmin-account-name">' + esc(state.user.name) + '</p><p class="padmin-account-role">' + esc(roleLabels[state.user.role] || state.user.role) + '</p></div>' +
          '<span class="padmin-account-actions">' + renderSoundToggle() + renderBellAndNotifs() + '</span>' +
        '</div>' +
        '<button type="button" class="padmin-logout" data-action="logout">Cerrar sesión</button>' +
      '</div>' +
    '</div>';
  }

  function renderToasts() {
    var html = '';
    if (state.errorMsg) {
      html += '<div class="padmin-toast padmin-toast-error" role="alert">' +
        '<span class="padmin-toast-icon">⚠</span><span class="padmin-toast-msg">' + esc(state.errorMsg) + '</span>' +
        '<button type="button" class="padmin-toast-close" data-action="dismiss-toast" data-kind="error" aria-label="Cerrar aviso">×</button></div>';
    }
    if (state.successMsg) {
      html += '<div class="padmin-toast padmin-toast-success" role="status">' +
        '<span class="padmin-toast-icon">✓</span><span class="padmin-toast-msg">' + esc(state.successMsg) + '</span>' +
        '<button type="button" class="padmin-toast-close" data-action="dismiss-toast" data-kind="success" aria-label="Cerrar aviso">×</button></div>';
    }
    return html ? '<div class="padmin-toast-stack">' + html + '</div>' : '';
  }

  function renderShell(contentHtml) {
    return '<div class="padmin-shell">' + renderSidebar() + '<div class="padmin-content">' + contentHtml + '</div>' + renderToasts() + '</div>';
  }

  // ---------- login screen ----------

  function renderLogin() {
    var errorHtml = state.loginError ? '<p class="padmin-lede" style="color:var(--danger);margin:0 0 12px;">' + esc(state.loginError) + '</p>' : '';
    return '<div class="padmin-login-screen"><div class="padmin-login-card">' +
      '<div class="padmin-login-brand"><span class="name">CREA</span><span class="badge">PANEL INTERNO</span></div>' +
      '<p class="padmin-login-sub">Herramienta de trabajo para el equipo CREA</p>' +
      errorHtml +
      '<form data-action="submit-login">' +
        '<div class="padmin-field"><label for="pl-email">Correo</label><input id="pl-email" type="email" placeholder="tu@crearcontenidos.com" autocomplete="username" required></div>' +
        '<div class="padmin-field"><label for="pl-pass">Contraseña</label><input id="pl-pass" type="password" autocomplete="current-password" required></div>' +
        '<button type="submit" class="padmin-btn" style="width:100%;text-align:center;">Iniciar sesión</button>' +
      '</form>' +
    '</div></div>';
  }

  // ---------- dashboard ----------

  function statCard(label, value, color) {
    return '<div class="padmin-stat-card"><p class="padmin-stat-label">' + esc(label) + '</p><p class="padmin-stat-value"' + (color ? ' style="color:' + color + ';"' : '') + '>' + value + '</p></div>';
  }

  function renderDashboardDirector() {
    var ideas = state.data.ideas;
    var piecesInReview = state.data.proposalsByKey.en_revision;
    if (!ideas || !piecesInReview) return loadingCard();
    var ideasNueva = ideas.filter(function (i) { return i.column_status === 'nueva'; });

    return '<div>' +
      '<p style="font-size:13px;color:var(--text-mute);margin:0 0 4px;">Buenos días</p>' +
      '<h1 class="padmin-h1" style="margin-bottom:22px;">' + esc(state.user.name) + '</h1>' +
      '<div class="padmin-grid2" style="margin-bottom:28px;">' +
        statCard('IDEAS PENDIENTES', ideasNueva.length) +
        statCard('PIEZAS EN REVISIÓN', piecesInReview.length) +
      '</div>' +
      '<div class="padmin-grid2" style="gap:20px;">' +
        '<div>' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;"><p style="font-size:12px;font-weight:600;color:var(--text);margin:0;">Ideas pendientes de decisión</p><button type="button" class="padmin-logout" data-action="goto" data-id="ideas">Ver bandeja &rarr;</button></div>' +
          '<div class="padmin-card">' + (ideasNueva.length ? ideasNueva.map(function (i) {
            return '<div class="padmin-row clickable" data-action="goto" data-id="ideas"><div><p class="padmin-row-title">' + esc(i.title) + '</p><p class="padmin-row-meta">' + esc(i.category || '') + '</p></div><span class="padmin-idea-score">' + (i.score != null ? 'Score ' + i.score : '') + '</span></div>';
          }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin ideas pendientes.</p></div>') + '</div>' +
        '</div>' +
        '<div>' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;"><p style="font-size:12px;font-weight:600;color:var(--text);margin:0;">Piezas en revisión</p><button type="button" class="padmin-logout" data-action="goto" data-id="aprobacion">Ir a aprobación &rarr;</button></div>' +
          '<div class="padmin-card">' + (piecesInReview.length ? piecesInReview.map(function (p) {
            return '<div class="padmin-row clickable" data-action="goto" data-id="aprobacion"><div><p class="padmin-row-title">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section || '') + '</p></div>' + badge(p.status) + '</div>';
          }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Nada en revisión.</p></div>') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Checklist derivado de la pieza propia más reciente sin publicar (la lista ya viene
  // ordenada por updated_at DESC) — antes era una lista estática que siempre marcaba lo mismo.
  function renderChecklistPieza(myPieces) {
    var current = myPieces.filter(function (p) { return p.status !== 'published'; })[0];
    if (!current) return '';
    var items = [
      { label: 'Título final', done: Boolean(current.title) },
      { label: 'Imagen principal', done: Boolean(current.cover_image_url) },
      { label: 'SEO completo (dek, slug, sección)', done: Boolean(current.dek && current.slug && current.section) },
      { label: 'Revisión editorial', done: current.status === 'en_revision' }
    ];
    return '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Checklist de publicación &middot; ' + esc(current.title || 'pieza en curso') + '</p>' +
      '<div class="padmin-card" style="padding:8px 16px;">' + items.map(function (c) {
        var color = c.done ? 'var(--brand)' : 'var(--line-soft)';
        var bg = c.done ? 'var(--brand)' : 'transparent';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid var(--line-soft);"><div style="width:16px;height:16px;border-radius:4px;border:1.5px solid ' + color + ';background:' + bg + ';flex-shrink:0;"></div><span style="font-size:13px;color:var(--text);">' + esc(c.label) + '</span></div>';
      }).join('') + '</div>';
  }

  function renderDashboardProduccion() {
    var myPieces = state.data.proposalsByKey.mine;
    if (!myPieces) return loadingCard();
    var myDraftCount = myPieces.filter(function (p) { return p.status === 'borrador'; }).length;
    var myReviewCount = myPieces.filter(function (p) { return p.status === 'en_revision'; }).length;
    var myPublishedCount = myPieces.filter(function (p) { return p.status === 'published'; }).length;

    return '<div>' +
      '<p style="font-size:13px;color:var(--text-mute);margin:0 0 4px;">Tus tareas</p>' +
      '<h1 class="padmin-h1" style="margin-bottom:22px;">' + esc(state.user.name) + '</h1>' +
      '<div class="padmin-grid4" style="margin-bottom:28px;">' +
        statCard('PIEZAS ASIGNADAS', myPieces.length) +
        statCard('EN BORRADOR', myDraftCount) +
        statCard('EN REVISIÓN', myReviewCount, 'var(--accent-text)') +
        statCard('PUBLICADAS', myPublishedCount, 'var(--brand)') +
      '</div>' +
      '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Piezas en proceso</p>' +
      '<div class="padmin-card" style="margin-bottom:28px;">' + (myPieces.length ? myPieces.map(function (p) {
        return '<div class="padmin-row clickable" data-action="goto" data-id="editor" data-pid="' + p.id + '"><div><p class="padmin-row-title">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section || '') + '</p></div>' + badge(p.status) + '</div>';
      }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin piezas asignadas todavía.</p></div>') + '</div>' +
      renderChecklistPieza(myPieces) +
    '</div>';
  }

  function renderDashboard() {
    if (state.user.role === 'director') return renderDashboardDirector();
    if (state.user.role === 'produccion') return renderDashboardProduccion();
    return '<p class="padmin-lede">Sin panel de inicio para tu rol.</p>';
  }

  // ---------- ideas ----------

  function ideaCard(i, canMove) {
    var moveHtml = canMove ? '<select data-action="move-idea" data-id="' + i.id + '" style="font-size:10px;border:0.5px solid var(--line-soft);border-radius:4px;padding:2px 4px;">' +
      ['nueva', 'en_analisis', 'aprobada', 'descartada'].map(function (c) {
        return '<option value="' + c + '"' + (i.column_status === c ? ' selected' : '') + '>' + esc(STATUS_LABEL[c]) + '</option>';
      }).join('') + '</select>' : '';
    var deleteHtml = (canMove && state.user.role === 'director')
      ? '<button type="button" class="padmin-btn-sm padmin-btn-outline" style="margin-top:8px;" data-action="delete-idea" data-id="' + i.id + '">Eliminar</button>' : '';
    return '<div class="padmin-idea-card' + (i.column_status === 'descartada' ? ' discarded' : '') + '">' +
      '<p class="padmin-idea-cat">' + esc(i.category || '') + '</p>' +
      '<p class="padmin-idea-title">' + esc(i.title) + '</p>' +
      '<div class="padmin-idea-foot"><span class="padmin-idea-score">' + (i.score != null ? 'Score ' + i.score : '') + '</span><span class="padmin-idea-avatar">' + initialsOf(i.collaborator_name) + '</span></div>' +
      (moveHtml ? '<div style="margin-top:8px;">' + moveHtml + '</div>' : '') +
      deleteHtml +
    '</div>';
  }

  function ideasKanban() {
    var ideas = state.data.ideas;
    if (!ideas) return loadingCard();
    var canMove = state.user.role === 'director' || state.user.role === 'produccion';
    var cols = [
      { title: 'NUEVA', key: 'nueva' }, { title: 'EN ANÁLISIS', key: 'en_analisis' },
      { title: 'APROBADA', key: 'aprobada' }, { title: 'DESCARTADA', key: 'descartada' }
    ].map(function (c) { return { title: c.title, items: ideas.filter(function (i) { return i.column_status === c.key; }) }; });
    return '<div>' +
      '<h1 class="padmin-h1">Bandeja de ideas</h1><p class="padmin-lede">Flujo editorial de ideas propuestas.</p>' +
      '<div class="padmin-kanban">' + cols.map(function (col) {
        return '<div><p class="padmin-kanban-col-title">' + col.title + ' &middot; ' + col.items.length + '</p><div class="padmin-kanban-cards">' + col.items.map(function (i) { return ideaCard(i, canMove); }).join('') + '</div></div>';
      }).join('') + '</div>' +
    '</div>';
  }

  function ideasMine() {
    var ideas = state.data.ideas;
    if (!ideas) return loadingCard();
    var demoNote = state.demoNote === 'idea' ? '<p class="padmin-demo-hint">Idea enviada.</p>' : '';
    return '<div style="max-width:640px;">' +
      '<h1 class="padmin-h1">Tus ideas</h1>' +
      '<p class="padmin-lede">Envía una idea de nota y da seguimiento a su estado.</p>' +
      '<div class="padmin-card" style="padding:20px;margin-bottom:24px;">' +
        '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 14px;">Nueva idea</p>' +
        '<form data-action="submit-idea">' +
          '<div class="padmin-field"><label for="idea-title">Título</label><input id="idea-title" type="text" required></div>' +
          '<div class="padmin-field"><label for="idea-cat">Categoría</label><select id="idea-cat"><option>Local</option><option>Cultura</option><option>Economía</option><option>Entretenimiento</option><option>Deportes</option><option>Opinión</option></select></div>' +
          '<div class="padmin-field"><label for="idea-desc">Descripción</label><textarea id="idea-desc" style="min-height:70px;"></textarea></div>' +
          '<button type="submit" class="padmin-btn" style="align-self:flex-start;">Enviar idea</button>' +
          demoNote +
        '</form>' +
      '</div>' +
      '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Estado de tus ideas</p>' +
      '<div class="padmin-card">' + (ideas.length ? ideas.map(function (i) {
        return '<div class="padmin-row"><div><p class="padmin-row-title">' + esc(i.title) + '</p><p class="padmin-row-meta">' + esc(i.category || '') + '</p></div>' + badge(i.column_status) + '</div>';
      }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Todavía no envías ninguna idea.</p></div>') + '</div>' +
    '</div>';
  }

  function renderIdeas() {
    return state.user.role === 'colaborador' ? ideasMine() : ideasKanban();
  }

  // ---------- editor ----------

  // Fila del picker: thumb de portada + título/dek + sección/fecha + estado + acciones
  // rápidas (vista previa siempre; eliminar solo director y solo borradores).
  function pickerRow(p, editable) {
    var fecha = p.updated_at ? new Date(p.updated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '';
    var thumb = p.cover_image_url
      ? '<img src="' + esc(p.cover_image_url) + '" alt="" class="padmin-picker-thumb" onerror="this.style.visibility=\'hidden\';">'
      : '<div class="padmin-picker-thumb padmin-picker-thumb-empty">Sin<br>imagen</div>';
    var meta = [p.section || '', fecha, p.author_name || ''].filter(Boolean).join(' · ');
    return '<div class="padmin-row' + (editable ? ' clickable" data-action="open-editor" data-id="' + p.id + '"' : '"') + ' style="gap:12px;">' +
      thumb +
      '<div style="flex:1;min-width:0;">' +
        '<p class="padmin-row-title">' + esc(p.title) + '</p>' +
        '<p class="padmin-row-meta">' + esc(meta) + (p.dek ? ' — ' + esc(String(p.dek).slice(0, 90)) : '') + '</p>' +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">' +
        badge(p.status) +
        '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="preview-piece" data-id="' + p.id + '">Vista previa</button>' +
        (editable && state.user.role === 'director' ? '<button type="button" class="padmin-btn-sm padmin-btn-danger-outline" data-action="delete-borrador" data-id="' + p.id + '">Eliminar</button>' : '') +
      '</div>' +
    '</div>';
  }

  // Modal de vista previa desde el picker: reusa buildNotaPreviewDoc (mismo render
  // que la vista previa dentro del editor) sin abrir la pieza.
  function renderPickerPreview() {
    if (!state.pickerPreview) return '';
    var p = state.pickerPreview;
    return '<div class="padmin-overlay">' +
      '<div class="padmin-overlay-bg" data-action="close-picker-preview"></div>' +
      '<div class="padmin-modal" style="width:720px;padding:18px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<p style="font-size:11px;font-weight:600;color:var(--text-mute);letter-spacing:0.06em;margin:0;">VISTA PREVIA — ' + esc(p.title || '') + '</p>' +
          '<span class="padmin-drawer-close" data-action="close-picker-preview">Cerrar &times;</span>' +
        '</div>' +
        '<iframe srcdoc="' + esc(buildNotaPreviewDoc(p)) + '" class="padmin-preview-frame"></iframe>' +
      '</div>' +
    '</div>';
  }

  function renderEditorPicker() {
    var list = state.data.proposalsByKey.borrador;
    if (!list) return loadingCard();
    var mine = state.user.role === 'produccion' ? list.filter(function (p) { return p.author_id === state.user.id; }) : list;
    var inReview = state.data.proposalsByKey.en_revision || [];
    return '<div>' +
      '<h1 class="padmin-h1">Editor de nota</h1>' +
      '<p class="padmin-lede">Elige una pieza en borrador para editar.</p>' +
      '<div class="padmin-card">' + (mine.length ? mine.map(function (p) { return pickerRow(p, true); }).join('') :
        '<div class="padmin-row"><p class="padmin-row-meta">No hay piezas en borrador. Aprueba una propuesta desde "Propuestas IA".</p></div>') + '</div>' +
      (inReview.length ?
        '<p style="font-size:11px;font-weight:600;color:var(--text-mute);letter-spacing:0.06em;margin:22px 0 10px;">EN REVISIÓN (solo lectura — se editan devolviéndolas desde Aprobación)</p>' +
        '<div class="padmin-card">' + inReview.map(function (p) { return pickerRow(p, false); }).join('') + '</div>'
      : '') +
      renderPickerPreview() +
    '</div>';
  }

  // Prompt sugerido para la imagen de portada: se arma con lo que hay en el borrador
  // (título/dek/sección) + el estilo editorial fijo de CREA. Editable en el textarea.
  function defaultImagePrompt(d) {
    var tema = d.title ? '"' + d.title + '"' + (d.dek ? '. ' + d.dek : '') : 'la nota';
    return 'Imagen realista y profesional para ilustrar ' + tema + '. Contexto: sección ' + (d.section || 'Local') + ' de un medio digital en Perote, Veracruz. Estilo fotográfico documental, tonos cálidos y neutros, alta resolución, sin texto sobre la imagen.';
  }

  function renderEditor() {
    if (!state.editorProposalId) return renderEditorPicker();
    if (!state.editorDraft) return loadingCard();
    var d = state.editorDraft;
    var imagePrompt = state.editorImagePrompt != null ? state.editorImagePrompt : (d.image_prompt || defaultImagePrompt(d));
    return '<div class="padmin-editor-wrap">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;">' +
        '<h1 class="padmin-h1" style="margin:0;">Editor de nota</h1>' + badge('borrador') +
      '</div>' +
      '<div class="padmin-editor-cols">' +
      '<div class="padmin-editor-card padmin-editor-main">' +
        '<label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:8px;">Título</label>' +
        '<input id="editor-title" class="padmin-title-input" value="' + esc(d.title) + '" style="width:100%;box-sizing:border-box;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;margin-top:12px;">' +
          '<label style="font-size:11px;color:var(--text-mute);">Cuerpo</label>' +
          '<button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-draft" ' + (state.generatingDraft ? 'disabled' : '') + '>' + (state.generatingDraft ? 'Generando…' : 'Generar borrador con IA') + '</button>' +
        '</div>' +
        '<textarea id="editor-body" class="padmin-body-textarea">' + esc(d.body) + '</textarea>' +
      '</div>' +
      '<aside class="padmin-editor-card padmin-editor-meta">' +
        '<p class="padmin-editor-meta-title">Metadatos de la nota</p>' +
        '<div class="padmin-field"><label>Sección editorial</label><select id="editor-section">' + ['Local', 'Cultura', 'Economía', 'Entretenimiento', 'Deportes', 'Opinión'].map(function (s) { return '<option' + (d.section === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
        '<div class="padmin-field"><label>Dek / bajada</label><input id="editor-dek" type="text" value="' + esc(d.dek) + '"></div>' +
        '<div class="padmin-field"><label>Slug</label><input id="editor-slug" type="text" value="' + esc(d.slug) + '" placeholder="mi-nota-slug"></div>' +
        '<div class="padmin-field"><label>Autor / firma</label><input id="editor-author" type="text" value="' + esc(d.author_name) + '"></div>' +
        '<div class="padmin-field"><label>Imagen de portada (URL)</label><input id="editor-cover" type="text" value="' + esc(d.cover_image_url) + '" placeholder="https://..." onchange="document.getElementById(\'editor-cover-thumb\').src=this.value;document.getElementById(\'editor-cover-thumb\').style.display=this.value?\'block\':\'none\';"></div>' +
        (d.cover_image_url ? '<img id="editor-cover-thumb" src="' + esc(d.cover_image_url) + '" alt="" style="display:block;width:100%;max-height:200px;object-fit:cover;border-radius:6px;margin:-8px 0 14px;" onerror="this.style.display=\'none\';">' : '<img id="editor-cover-thumb" style="display:none;width:100%;max-height:200px;object-fit:cover;border-radius:6px;margin:-8px 0 14px;" onerror="this.style.display=\'none\';">') +
        '<div class="padmin-ia-image">' +
          '<p class="padmin-ia-image-title">Generación de imagen de portada con IA</p>' +
          '<button type="button" class="padmin-btn" data-action="generate-image" style="width:100%;margin-bottom:12px;" ' + (state.generatingImage ? 'disabled' : '') + '>' + (state.generatingImage ? 'Generando imagen…' : 'Generar imagen con IA') + '</button>' +
          '<div class="padmin-field"><label>Prompt sugerido (editable)</label><textarea id="editor-image-prompt" style="min-height:110px;font-size:12px;">' + esc(imagePrompt) + '</textarea></div>' +
        '</div>' +
        '<div class="padmin-field-inline padmin-field"><input id="editor-sponsored" type="checkbox" ' + (d.is_sponsored ? 'checked' : '') + ' onchange="document.getElementById(\'editor-sponsor-name-field\').style.display=this.checked?\'\':\'none\';"><label for="editor-sponsored" style="font-size:13px;color:var(--text);">Nota patrocinada (publicidad)</label></div>' +
        '<div class="padmin-field" id="editor-sponsor-name-field" style="margin-bottom:0;display:' + (d.is_sponsored ? '' : 'none') + ';"><label>Patrocinado por</label><input id="editor-sponsor-name" type="text" value="' + esc(d.sponsor_name) + '" placeholder="Nombre del negocio"></div>' +
      '</aside>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<button type="button" class="padmin-btn padmin-btn-brand" data-action="submit-review" data-id="' + state.editorProposalId + '">Enviar a revisión</button>' +
        '<button type="button" class="padmin-btn-outline" data-action="save-draft" data-id="' + state.editorProposalId + '">Guardar borrador</button>' +
        (d.body ? '<button type="button" class="padmin-btn-outline" data-action="run-qa" ' + (state.qaBusy ? 'disabled' : '') + '>' + (state.qaBusy ? 'Verificando…' : 'Verificar texto') + '</button>' : '') +
        '<button type="button" class="padmin-btn-outline" data-action="preview-nota">Vista previa</button>' +
        '<button type="button" class="padmin-btn-outline" data-action="close-editor">Volver</button>' +
      '</div>' +
      renderQaResult() +
      renderNotaPreview() +
    '</div>';
  }

  function renderNotaPreview() {
    if (!state.notaPreviewHtml) return '';
    return '<div class="padmin-editor-card" style="margin-top:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<p style="font-size:11px;font-weight:600;color:var(--text-mute);letter-spacing:0.06em;margin:0;">VISTA PREVIA — así se vería publicada</p>' +
        '<span class="padmin-drawer-close" data-action="close-nota-preview">Cerrar &times;</span>' +
      '</div>' +
      '<iframe srcdoc="' + esc(state.notaPreviewHtml) + '" class="padmin-preview-frame"></iframe>' +
    '</div>';
  }

  // Snapshot del <form> del editor tal cual está en el DOM (incluye ediciones sin
  // guardar) — mismo dato que consume submitDraft() y la vista previa.
  function readEditorForm() {
    return {
      title: document.getElementById('editor-title').value,
      body: document.getElementById('editor-body').value,
      section: document.getElementById('editor-section').value,
      dek: document.getElementById('editor-dek').value,
      slug: document.getElementById('editor-slug').value,
      cover_image_url: document.getElementById('editor-cover').value,
      author_name: document.getElementById('editor-author').value,
      is_sponsored: document.getElementById('editor-sponsored').checked,
      sponsor_name: document.getElementById('editor-sponsor-name').value,
    };
  }

  // Construye un documento HTML autocontenido que imita renderNotaPage() (apps/web/assets/js/main.js)
  // con los tokens del tema editorial (crea-design-system) para que el editor vea el resultado
  // final sin depender de que la nota ya esté publicada (la API pública solo sirve status='published').
  // Los hex van hardcodeados a propósito: el iframe es un documento aparte y no hereda var(--token).
  function buildNotaPreviewDoc(d) {
    var body = String(d.body || '');
    var minutes = Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200));
    var fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    var paras = body.split(/\n\s*\n/).filter(Boolean).map(function (p) {
      return '<p style="font-size:16px;line-height:1.75;margin:0 0 18px;">' + esc(p) + '</p>';
    }).join('');
    var cover = d.cover_image_url
      ? '<img src="' + esc(d.cover_image_url) + '" alt="" style="width:100%;max-height:420px;object-fit:cover;border-radius:8px;margin-bottom:24px;display:block;" onerror="this.style.display=\'none\';">'
      : '<div style="width:100%;height:260px;background:#DCE6D6;border-radius:8px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#2F5233;">Sin imagen de portada</div>';
    var authorName = d.author_name || 'CREA Contenidos';
    var sponsorBlock = d.is_sponsored
      ? '<div style="background:#E2DFD3;border-radius:8px;padding:14px 18px;font-size:12px;color:#6B6A60;margin-top:18px;">Contenido patrocinado por <strong style="color:#1F2A22;">' + esc(d.sponsor_name || 'un aliado de CREA') + '</strong>.</div>'
      : '';
    return '<!DOCTYPE html><html lang="es-MX"><head><meta charset="utf-8">' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link href="https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>body{margin:0;padding:28px 24px;background:#ECEAE2;color:#1F2A22;font-family:\'Inter\',sans-serif;} .eyebrow{font-size:11px;font-weight:600;letter-spacing:0.06em;color:#2F5233;}</style>' +
      '</head><body>' +
      '<div style="max-width:640px;margin:0 auto;">' +
        '<p class="eyebrow">' + esc((d.section || 'LOCAL').toUpperCase()) + (d.is_sponsored ? ' &middot; CONTENIDO PATROCINADO' : '') + '</p>' +
        '<h1 style="font-family:\'Roboto Slab\',serif;font-size:32px;line-height:1.2;margin:10px 0 16px;">' + esc(d.title || 'Sin título') + '</h1>' +
        (d.dek ? '<p style="font-size:16px;color:#6B6A60;line-height:1.5;margin:0 0 20px;">' + esc(d.dek) + '</p>' : '') +
        '<div style="display:flex;align-items:center;gap:12px;padding-bottom:20px;border-bottom:0.5px solid #C9C6B8;margin-bottom:24px;">' +
          '<div style="width:36px;height:36px;border-radius:50%;background:#E3E2DD;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;">' + esc(initialsOf(authorName)) + '</div>' +
          '<div style="font-size:12px;color:#6B6A60;"><strong style="color:#1F2A22;">' + esc(authorName) + '</strong> &middot; ' + esc(fecha) + ' &middot; ' + minutes + ' min de lectura</div>' +
        '</div>' +
        cover +
        (paras || '<p style="font-size:13px;color:#9A9A93;">Sin contenido todavía.</p>') +
        sponsorBlock +
      '</div></body></html>';
  }

  function renderQaResult() {
    if (!state.qaResult) return '';
    var q = state.qaResult;
    var color = q.score > 80 ? 'var(--brand)' : (q.score >= 50 ? 'var(--accent-2)' : 'var(--danger)');
    var issues = (q.issues || []).map(function (i) {
      return '<li style="margin-bottom:4px;">' + '[' + esc(i.type) + (i.line ? ' · línea ' + i.line : '') + '] ' + esc(i.text) + '</li>';
    }).join('');
    return '<div class="padmin-editor-card" style="margin-top:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<p style="font-size:14px;font-weight:600;color:' + color + ';margin:0;">Score: ' + q.score + '/100</p>' +
        '<span class="padmin-drawer-close" data-action="close-qa">Cerrar &times;</span>' +
      '</div>' +
      '<ul style="font-size:12px;color:var(--text-2);padding-left:18px;margin:0 0 10px;">' + (issues || '<li>Sin observaciones.</li>') + '</ul>' +
      '<p style="font-size:12px;color:var(--text-mute);margin:0;">' + esc(q.summary || '') + '</p>' +
    '</div>';
  }

  // ---------- aprobación ----------

  var transparencyLabels = ['100% humano', 'Asistido por IA', 'Generado con IA'];

  function renderAprobacionDesktop(piecesInReview) {
    return '<div class="padmin-card">' + piecesInReview.map(function (p) {
      var selected = state.transparency[p.id];
      var approveBg = selected ? 'var(--brand)' : 'var(--bg-soft)';
      var approveColor = selected ? '#fff' : 'var(--mute-2)';
      var chips = transparencyLabels.map(function (label) {
        var active = selected === label;
        return '<span class="padmin-chip" data-action="set-transparency" data-piece="' + p.id + '" data-label="' + esc(label) + '" style="background:' + (active ? 'var(--brand)' : 'var(--bg-soft)') + ';color:' + (active ? '#fff' : 'var(--text-mute)') + ';border-color:' + (active ? 'var(--brand)' : 'var(--line-soft)') + ';">' + esc(label) + '</span>';
      }).join('');
      return '<div style="padding:16px 18px;border-bottom:0.5px solid var(--line-soft);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<div><p class="padmin-row-title" style="font-size:14px;">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section || '') + '</p></div>' +
          '<div style="display:flex;gap:8px;">' +
            '<span class="padmin-btn-sm" style="background:' + approveBg + ';color:' + approveColor + ';cursor:' + (selected ? 'pointer' : 'not-allowed') + ';" ' + (selected ? 'data-action="approve-piece" data-id="' + p.id + '"' : '') + '>Aprobar</span>' +
            '<span class="padmin-btn-sm padmin-btn-outline" style="font-weight:500;" data-action="open-comentario" data-id="' + p.id + '">Devolver con comentarios</span>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-size:11px;color:var(--text-mute);margin-right:2px;">Origen del contenido (obligatorio):</span>' + chips + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderComentarioModal() {
    if (state.comentarioPieceId == null) return '';
    var pieces = state.data.proposalsByKey.en_revision || [];
    var piece = pieces.filter(function (p) { return p.id === state.comentarioPieceId; })[0];
    if (!piece) return '';
    return '<div class="padmin-overlay">' +
      '<div class="padmin-overlay-bg" data-action="close-comentario"></div>' +
      '<div class="padmin-modal">' +
        '<p style="font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px;">Devolver con comentarios</p>' +
        '<p style="font-size:12px;color:var(--text-mute);margin:0 0 16px;">' + esc(piece.title) + '</p>' +
        '<label style="font-size:11px;color:var(--text-mute);display:block;margin-bottom:6px;">Motivo de la devolución</label>' +
        '<textarea id="comentario-text" placeholder="Describe qué debe ajustarse antes de publicar..." style="width:100%;min-height:100px;border:0.5px solid var(--line-soft);border-radius:6px;background:var(--bg-admin);padding:10px 12px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical;margin-bottom:16px;">' + esc(state.comentarioText) + '</textarea>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
          '<button type="button" class="padmin-btn-outline" data-action="close-comentario">Cancelar</button>' +
          '<button type="button" class="padmin-btn" data-action="confirm-comentario" data-id="' + piece.id + '">Confirmar devolución</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Distribución: paso posterior a publicar. Push por canal + historial (published_content).
  function renderDistribucion() {
    var published = state.data.proposalsByKey.published;
    var channels = state.data.distChannels;
    if (!published || !channels) return '';
    var lastPush = {};
    (state.data.distLog || []).forEach(function (e) {
      var k = e.proposal_id + ':' + e.platform;
      if (!lastPush[k]) lastPush[k] = e; // el log viene DESC — el primero es el más reciente
    });
    var rows = published.slice(0, 10).map(function (p) {
      var buttons = channels.map(function (ch) {
        var push = lastPush[p.id + ':' + ch.channel];
        var busy = state.distBusy === ch.channel + ':' + p.id;
        var mark = '';
        if (push && push.status === 'ok') mark = '<span title="Enviado ' + esc(relativeTime(push.published_at)) + '" style="color:var(--brand);font-size:11px;margin-left:2px;">✓</span>';
        else if (push) mark = '<span title="' + esc(push.detail || 'Falló') + '" style="color:var(--danger);font-size:11px;margin-left:2px;">✕</span>';
        return '<span style="display:inline-flex;align-items:center;">' +
          '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="distribute" data-channel="' + ch.channel + '" data-id="' + p.id + '" ' +
          (!ch.connected || busy ? 'disabled' : '') + (!ch.connected ? ' title="Canal no configurado (variables de entorno)"' : '') + '>' +
          (busy ? 'Enviando…' : esc(ch.label)) + '</button>' + mark + '</span>';
      }).join('');
      return '<div class="padmin-row" style="flex-wrap:wrap;gap:8px;">' +
        '<div style="min-width:0;"><p class="padmin-row-title">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.section || '') + (p.published_at ? ' · publicada ' + esc(relativeTime(p.published_at)) : '') + '</p></div>' +
        '<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' + buttons + '</span>' +
      '</div>';
    }).join('');
    return '<p style="font-size:12px;font-weight:600;color:var(--text);margin:28px 0 12px;">Distribución &middot; publicadas recientes</p>' +
      '<div class="padmin-card">' + (rows || '<div class="padmin-row"><p class="padmin-row-meta">Todavía no hay notas publicadas para distribuir.</p></div>') + '</div>';
  }

  function renderAprobacion() {
    var piecesInReview = state.data.proposalsByKey.en_revision;
    if (!piecesInReview) return loadingCard();
    return '<div>' +
      '<h1 class="padmin-h1">Aprobación</h1>' +
      '<p class="padmin-lede">Piezas pendientes de revisión editorial.</p>' +
      (piecesInReview.length ? renderAprobacionDesktop(piecesInReview) : loadingCard('Nada en revisión.')) +
      renderDistribucion() +
      renderComentarioModal() +
    '</div>';
  }

  // ---------- comercial ----------

  var PIPELINE_STAGES_ORDER = ['identificado', 'contactado', 'propuesta_enviada', 'cerrado'];

  function sponsorFieldsHtml(c) {
    return '<div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--line-soft);">' +
      '<p style="font-size:10px;color:var(--mute-2);margin:0 0 6px;">Datos de patrocinio (newsletter)</p>' +
      '<input type="text" id="sponsor-link-' + c.id + '" placeholder="Sitio web" value="' + esc(c.website_url || '') + '" style="width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--line-soft);border-radius:5px;box-sizing:border-box;margin-bottom:6px;">' +
      '<input type="text" id="sponsor-copy-' + c.id + '" placeholder="Copy (ej. Todo lo que necesitas para tu hogar)" value="' + esc(c.sponsor_copy || '') + '" style="width:100%;font-size:11px;padding:5px 7px;border:0.5px solid var(--line-soft);border-radius:5px;box-sizing:border-box;margin-bottom:6px;">' +
      '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="save-sponsor-info" data-id="' + c.id + '">Guardar patrocinio</button>' +
      (c.last_sponsored_at ? '<p style="font-size:10px;color:var(--mute-2);margin:6px 0 0;">Último newsletter: ' + new Date(c.last_sponsored_at).toLocaleDateString('es-MX') + '</p>' : '') +
    '</div>';
  }

  function commColumn(title, stage, color, clients, canMove, canDelete) {
    var items = clients.filter(function (c) { return c.pipeline_stage === stage; });
    var nextStage = PIPELINE_STAGES_ORDER[PIPELINE_STAGES_ORDER.indexOf(stage) + 1];
    return '<div><p class="padmin-kanban-col-title">' + title + ' &middot; ' + items.length + '</p><div class="padmin-kanban-cards">' + items.map(function (c) {
      return '<div class="padmin-idea-card"><p class="padmin-row-title" style="margin-bottom:6px;">' + esc(c.name) + '</p><p class="padmin-row-meta" style="margin-bottom:8px;">' + esc(c.interest || '') + '</p><p style="font-size:12px;font-weight:600;color:' + color + ';margin:0 0 8px;">' + esc(c.estimated_value || '') + '</p><p style="font-size:10px;color:var(--mute-2);margin:0;">Últ. seguimiento: ' + (c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString('es-MX') : '—') + '</p>' +
        (canMove && nextStage ? '<button type="button" class="padmin-btn-sm padmin-btn-outline" style="margin-top:8px;" data-action="advance-client" data-id="' + c.id + '" data-stage="' + nextStage + '">Avanzar &rarr;</button>' : '') +
        (canDelete ? '<button type="button" class="padmin-btn-sm padmin-btn-danger" style="margin-top:8px;margin-left:6px;" data-action="delete-client" data-id="' + c.id + '">Eliminar</button>' : '') +
        (stage === 'cerrado' ? sponsorFieldsHtml(c) : '') +
      '</div>';
    }).join('') + '</div></div>';
  }

  function renderComercial() {
    var clients = state.data.clients;
    if (!clients) return loadingCard();
    var canMove = state.user.role === 'comercial' || state.user.role === 'director';
    var canDelete = state.user.role === 'director';
    var errorHtml = state.clientFormError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.clientFormError) + '</p>' : '';
    var formHtml = state.clientFormOpen ? (
      '<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:640px;">' +
        errorHtml +
        '<form data-action="submit-new-client" class="padmin-grid2" style="gap:10px;">' +
          '<div class="padmin-field" style="margin:0;"><label>Nombre</label><input id="nc-name" type="text" required></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Negocio</label><input id="nc-business" type="text"></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Paquete</label><select id="nc-package"><option value="básico">Básico</option><option value="profesional">Profesional</option><option value="premium">Premium</option></select></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Teléfono</label><input id="nc-phone" type="tel"></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Correo</label><input id="nc-email" type="email"></div>' +
          '<div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">Crear cliente</button><button type="button" class="padmin-btn-outline" data-action="close-client-form">Cancelar</button></div>' +
        '</form>' +
      '</div>'
    ) : (canMove ? '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-client-form">+ Nuevo cliente</button>' : '');
    return '<div>' +
      '<h1 class="padmin-h1">Pipeline comercial</h1><p class="padmin-lede">Prospectos activos del equipo comercial.</p>' +
      formHtml +
      '<div class="padmin-kanban">' +
        commColumn('IDENTIFICADO', 'identificado', 'var(--accent)', clients, canMove, canDelete) +
        commColumn('CONTACTADO', 'contactado', 'var(--accent)', clients, canMove, canDelete) +
        commColumn('PROPUESTA ENVIADA', 'propuesta_enviada', 'var(--accent)', clients, canMove, canDelete) +
        commColumn('CERRADO', 'cerrado', 'var(--brand)', clients, canMove, canDelete) +
      '</div>' +
    '</div>';
  }

  // ---------- leads (formulario de contacto del Estudio) ----------

  function renderLeads() {
    var leads = state.data.leads;
    if (!leads) return loadingCard();
    var canDelete = state.user.role === 'director';
    var statuses = ['todos', 'nuevo', 'contactado', 'descartado'];
    var chips = statuses.map(function (st) {
      var active = state.leadsStatus === st;
      return '<span class="padmin-chip" data-action="set-leads-status" data-value="' + st + '" style="background:' + (active ? 'var(--brand)' : 'var(--surface)') + ';color:' + (active ? '#fff' : 'var(--text)') + ';border-color:' + (active ? 'var(--brand)' : 'var(--line-soft)') + ';">' + (st === 'todos' ? 'Todos' : STATUS_LABEL[st]) + '</span>';
    }).join('');
    var filtered = leads.filter(function (l) { return state.leadsStatus === 'todos' || l.status === state.leadsStatus; });
    var nuevos = leads.filter(function (l) { return l.status === 'nuevo'; }).length;

    return '<div>' +
      '<h1 class="padmin-h1">Leads</h1>' +
      '<p class="padmin-lede">Mensajes del formulario de contacto del sitio. ' + (nuevos ? nuevos + ' sin atender.' : 'Sin pendientes.') + '</p>' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap;">' + chips + '</div>' +
      '<div class="padmin-card">' +
        '<div class="padmin-table-head padmin-cols-leads"><span>RECIBIDO</span><span>CONTACTO</span><span>INTERÉS</span><span>MENSAJE</span><span>ESTADO</span><span>ACCIONES</span></div>' +
        (filtered.length ? filtered.map(function (l) {
          return '<div class="padmin-table-row padmin-cols-leads">' +
            '<span style="font-size:11px;color:var(--text-mute);">' + esc(relativeTime(l.created_at)) + '</span>' +
            '<div style="min-width:0;"><p class="padmin-row-title">' + esc(l.name) + (l.company ? ' · ' + esc(l.company) : '') + '</p><p class="padmin-row-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(l.email || '') + '</p></div>' +
            '<span style="font-size:12px;color:var(--text-mute);">' + esc(l.service_interest || '—') + '</span>' +
            '<span style="font-size:12px;color:var(--text-2);line-height:1.4;" title="' + esc(l.message || '') + '">' + esc((l.message || '—').slice(0, 140)) + ((l.message || '').length > 140 ? '…' : '') + '</span>' +
            '<span>' + badge(l.status) + '</span>' +
            '<span style="display:flex;gap:4px;flex-wrap:wrap;">' +
              (l.status === 'nuevo' ? '<button type="button" class="padmin-icon-btn" title="Marcar contactado" data-action="mark-lead" data-id="' + l.id + '" data-status="contactado">✓</button>' : '') +
              (l.status !== 'descartado' ? '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="convert-lead" data-id="' + l.id + '">→ Cliente</button>' : '') +
              (l.status !== 'descartado' ? '<button type="button" class="padmin-icon-btn" title="Descartar" data-action="mark-lead" data-id="' + l.id + '" data-status="descartado">✕</button>' : '') +
              (canDelete ? '<button type="button" class="padmin-icon-btn" title="Eliminar" data-action="delete-lead" data-id="' + l.id + '">🗑</button>' : '') +
            '</span>' +
          '</div>';
        }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">' + (leads.length ? 'Sin leads con ese estado.' : 'Todavía no llegan mensajes del formulario de contacto.') + '</p></div>') +
      '</div>' +
    '</div>';
  }

  // ---------- métricas ----------

  function renderMetricas() {
    var m = state.data.metrics;
    if (!m) return loadingCard();
    var weeklyPct = m.weeklyGoal ? Math.round((m.piecesPublished / m.weeklyGoal) * 100) + '%' : '0%';
    var chartHtml;
    if (m.weeklyPieces && m.weeklyPieces.length) {
      var maxWeekly = Math.max.apply(null, m.weeklyPieces.map(function (w) { return w.count; }));
      var chartW = 420, chartH = 110, chartPad = 10;
      var stepX = m.weeklyPieces.length > 1 ? (chartW - chartPad * 2) / (m.weeklyPieces.length - 1) : 0;
      var points = m.weeklyPieces.map(function (w, idx) {
        var x = chartPad + idx * stepX;
        var y = chartH - chartPad - (maxWeekly ? (w.count / maxWeekly) * (chartH - chartPad * 2) : 0);
        return { x: x, y: y, week: w.week.slice(5) };
      });
      var polyline = points.map(function (p) { return p.x + ',' + p.y; }).join(' ');
      chartHtml = '<svg viewBox="0 0 ' + chartW + ' ' + chartH + '" width="100%" height="110" style="display:block;overflow:visible;color:var(--brand);">' +
          '<polyline points="' + polyline + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>' +
          points.map(function (p) { return '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.5" fill="currentColor"></circle>'; }).join('') +
        '</svg><div class="padmin-chart-labels">' + points.map(function (p) { return '<span>' + esc(p.week) + '</span>'; }).join('') + '</div>';
    } else {
      chartHtml = '<p class="padmin-lede" style="margin:0;">Sin piezas publicadas en las últimas semanas.</p>';
    }

    var topSections = m.topSections || [];
    var maxSectionCount = topSections.length ? Math.max.apply(null, topSections.map(function (s) { return s.count; })) : 0;
    var authors = m.authors || [];

    return '<div style="max-width:820px;">' +
      '<h1 class="padmin-h1" style="margin-bottom:22px;">Panel de métricas</h1>' +
      '<div class="padmin-grid2" style="gap:16px;margin-bottom:24px;">' +
        '<div class="padmin-card" style="padding:20px;"><p class="padmin-stat-label">PIEZAS PUBLICADAS ESTA SEMANA VS. OBJETIVO</p><p style="font-weight:700;font-size:24px;color:var(--text);margin:0 0 10px;">' + m.piecesPublished + ' / ' + m.weeklyGoal + '</p><div style="width:100%;height:8px;background:var(--bg-soft);border-radius:4px;overflow:hidden;"><div style="height:100%;background:var(--brand);width:' + weeklyPct + ';"></div></div></div>' +
        '<div class="padmin-card" style="padding:20px;"><p class="padmin-stat-label">ALCANCE TOTAL</p>' +
          '<div style="display:flex;gap:18px;margin-top:10px;">' +
            '<div><p style="font-size:20px;font-weight:700;color:var(--text);margin:0;">' + (m.totalPieces != null ? m.totalPieces : '—') + '</p><p style="font-size:10px;color:var(--text-mute);margin:2px 0 0;">PIEZAS PUBLICADAS</p></div>' +
            '<div><p style="font-size:20px;font-weight:700;color:var(--text);margin:0;">' + (m.approvalRate != null ? m.approvalRate + '%' : '—') + '</p><p style="font-size:10px;color:var(--text-mute);margin:2px 0 0;">TASA DE APROBACIÓN</p></div>' +
            '<div><p style="font-size:20px;font-weight:700;color:var(--text);margin:0;">' + (m.avgDraftDays != null ? m.avgDraftDays : '—') + '</p><p style="font-size:10px;color:var(--text-mute);margin:2px 0 0;">DÍAS PROM. DE PRODUCCIÓN</p></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Piezas publicadas por semana</p>' +
      '<div class="padmin-card" style="padding:20px;margin-bottom:24px;">' + chartHtml + '</div>' +
      '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Crecimiento por canal</p>' +
      '<div class="padmin-card" style="padding:20px;">' +
        (topSections.length ? (
          '<p style="font-size:11px;font-weight:600;color:var(--text-mute);margin:0 0 10px;">TOP SECCIONES</p>' +
          topSections.map(function (s) {
            var pct = maxSectionCount ? Math.round((s.count / maxSectionCount) * 100) : 0;
            return '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text);margin-bottom:4px;"><span>' + esc(s.section) + '</span><span>' + s.count + '</span></div><div style="width:100%;height:6px;background:var(--bg-soft);border-radius:3px;overflow:hidden;"><div style="height:100%;background:var(--accent);width:' + pct + '%;"></div></div></div>';
          }).join('') +
          (authors.length ? '<p style="font-size:11px;font-weight:600;color:var(--text-mute);margin:18px 0 10px;">RANKING DE AUTORES</p>' +
            authors.map(function (a) {
              return '<div class="padmin-row" style="padding:6px 0;"><span style="font-size:12px;color:var(--text);">' + esc(a.name) + '</span><span style="font-size:12px;font-weight:600;color:var(--text-mute);">' + a.published + ' publicadas</span></div>';
            }).join('') : '')
        ) : '<p class="padmin-lede" style="margin:0;">Sin piezas publicadas todavía.</p>') +
      '</div>' +
    '</div>';
  }

  // ---------- radar ----------

  function sentimentStyle(label) {
    if (label === 'positivo') return { color: 'var(--brand)', text: 'Positivo' };
    if (label === 'negativo') return { color: 'var(--danger)', text: 'Negativo' };
    return { color: 'var(--text-mute)', text: 'Neutral' };
  }

  function renderRadarDetail() {
    if (state.selectedRadarId == null) return '';
    var topics = state.data.topics || [];
    var topic = topics.filter(function (r) { return r.id === state.selectedRadarId; })[0];
    if (!topic) return '';
    return '<div class="padmin-overlay">' +
      '<div class="padmin-overlay-bg" data-action="close-radar"></div>' +
      '<div class="padmin-drawer">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;"><p class="padmin-drawer-eyebrow">FICHA DE CONTEXTO</p><span class="padmin-drawer-close" data-action="close-radar">Cerrar &times;</span></div>' +
        '<h2 style="font-size:16px;font-weight:600;color:var(--text);margin:0 0 16px;line-height:1.35;">' + esc(topic.title) + '</h2>' +
        '<div style="display:flex;gap:16px;margin-bottom:22px;"><span style="font-size:11px;color:var(--text-mute);">Fuente: <b style="color:var(--text);">' + esc(topic.source) + '</b></span><span style="font-size:11px;color:var(--text-mute);">Menciones: <b style="color:var(--text);">' + topic.mentions + '</b></span></div>' +
        '<p class="padmin-drawer-section-title">ANTECEDENTES</p><p class="padmin-drawer-section-body">' + esc(topic.antecedentes || 'Sin datos.') + '</p>' +
        '<p class="padmin-drawer-section-title">ACTORES INVOLUCRADOS</p><p class="padmin-drawer-section-body">' + esc(topic.actores || 'Sin datos.') + '</p>' +
        '<p class="padmin-drawer-section-title">ÁNGULOS DE COBERTURA SUGERIDOS</p><p class="padmin-drawer-section-body">' + esc(topic.angulos || 'Sin datos.') + '</p>' +
        '<p class="padmin-drawer-section-title">POTENCIAL DE AUDIENCIA</p><p class="padmin-drawer-section-body" style="margin-bottom:0;">' + esc(topic.audiencia || 'Sin datos.') + '</p>' +
        (state.user.role === 'director' || state.user.role === 'produccion' ?
          '<div style="margin-top:20px;padding-top:16px;border-top:0.5px solid var(--line-soft);display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
            '<select id="proposal-format-' + topic.id + '" style="font-size:12px;border:0.5px solid var(--line-soft);border-radius:6px;padding:6px 8px;background:#fff;">' +
              ['nota', 'post', 'guion_audio', 'guion_video'].map(function (f) { return '<option value="' + f + '">' + f + '</option>'; }).join('') +
            '</select>' +
            '<button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-proposal-from-topic" data-id="' + topic.id + '" ' + (state.generatingProposal ? 'disabled' : '') + '>' + (state.generatingProposal ? 'Generando…' : 'Generar propuesta IA') + '</button>' +
            (topic.status !== 'Revisado' ? '<button type="button" class="padmin-btn-sm" style="background:var(--brand-soft);color:var(--brand);" data-action="approve-topic" data-id="' + topic.id + '">✓ Aprobar</button>' : '') +
            '<button type="button" class="padmin-btn-sm padmin-btn-danger" style="margin-left:auto;" data-action="delete-topic" data-id="' + topic.id + '">🗑 Eliminar</button>' +
          '</div>' : '') +
      '</div>' +
    '</div>';
  }

  function renderRadar() {
    var tabs = '<div class="padmin-tabs">' + [
      { id: 'temas', label: 'Temas' },
      { id: 'competencia', label: 'Competencia' }
    ].map(function (t) {
      return '<button type="button" class="padmin-tab' + (state.radarTab === t.id ? ' active' : '') + '" data-action="set-radar-tab" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('') + '</div>';
    return '<div>' +
      '<h1 class="padmin-h1">RADAR &middot; Social listening</h1>' +
      '<p class="padmin-lede">Temas detectados por listening y publicaciones de la competencia. Feed de trabajo, no contenido editorial.</p>' +
      tabs +
      (state.radarTab === 'competencia' ? renderRadarCompetencia() : renderRadarTemas()) +
    '</div>';
  }

  function renderRadarCompetencia() {
    var posts = state.data.competitors;
    if (!posts) return loadingCard();
    var canManage = state.user.role === 'director' || state.user.role === 'produccion';
    var detectBtn = canManage
      ? '<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px;">' +
          '<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-outline" data-action="detect-competitors-fb" ' + (state.competitorsBusy ? 'disabled' : '') + '>' + (state.competitorsBusy ? 'Escaneando…' : '📘 Escanear Facebook') + '</button>' +
          '<button type="button" class="padmin-btn padmin-btn-sm" data-action="detect-competitors" ' + (state.competitorsBusy ? 'disabled' : '') + '>' + (state.competitorsBusy ? 'Explorando…' : '🔎 Explorar competencia') + '</button>' +
          (posts.length ? '<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-danger" data-action="clear-competitors">🗑 Limpiar todo</button>' : '') +
        '</div>'
      : '';
    return detectBtn +
      '<div class="padmin-card">' +
        '<div class="padmin-table-head padmin-cols-competencia"><span>CUENTA</span><span>PUBLICACIÓN</span><span>FECHA</span><span>INTERACCIONES</span><span>ESTADO</span><span>ACCIONES</span></div>' +
        (posts.length ? posts.map(function (p) {
          var inter = (p.reactions || 0) + (p.comments || 0) + (p.shares || 0);
          var st = p.analyzed ? { label: 'Analizado', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Nuevo', bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
          var text = String(p.post_text || '—');
          return '<div class="padmin-table-row padmin-cols-competencia">' +
            '<div style="min-width:0;"><p class="padmin-row-title">' + esc(p.source_account || '—') + '</p><p class="padmin-row-meta" style="text-transform:uppercase;">' + esc(p.source_platform || '') + '</p></div>' +
            '<div style="min-width:0;"><span style="font-size:12px;color:var(--text-2);line-height:1.4;" title="' + esc(text) + '">' + esc(text.slice(0, 160)) + (text.length > 160 ? '…' : '') + '</span>' +
              (p.post_url ? '<a href="' + esc(p.post_url) + '" target="_blank" rel="noopener" style="display:block;font-size:11px;color:var(--accent-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(p.post_url) + '</a>' : '') + '</div>' +
            '<span style="font-size:11px;color:var(--text-mute);">' + (p.post_date ? new Date(p.post_date).toLocaleDateString('es-MX') : '—') + '</span>' +
            '<span style="font-size:12px;font-weight:600;color:var(--text);">' + inter + '</span>' +
            '<span><span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + st.label + '</span></span>' +
            '<span style="display:flex;gap:4px;flex-wrap:wrap;">' +
              (canManage ? '<button type="button" class="padmin-btn-sm padmin-btn-outline" title="Crear idea en la bandeja a partir de esta publicación" data-action="competitor-to-idea" data-id="' + p.id + '">→ Idea</button>' : '') +
              (canManage && !p.analyzed ? '<button type="button" class="padmin-icon-btn" title="Marcar analizado" data-action="analyze-competitor" data-id="' + p.id + '">✓</button>' : '') +
              (canManage ? '<button type="button" class="padmin-icon-btn" title="Eliminar" data-action="delete-competitor" data-id="' + p.id + '">🗑</button>' : '') +
            '</span>' +
          '</div>';
        }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Sin publicaciones de competencia. Usa "Explorar competencia" para escanear con IA.</p></div>') +
      '</div>';
  }

  function renderRadarTemas() {
    var topics = state.data.topics;
    if (!topics) return loadingCard();
    var sources = ['Todas', 'Perplexity', 'Facebook', 'TikTok'];
    var statuses = ['Todos', 'Nuevo', 'Revisado'];
    var sourceChips = sources.map(function (src) {
      var active = state.radarSource === src;
      return '<span class="padmin-chip" data-action="set-radar-source" data-value="' + esc(src) + '" style="background:' + (active ? 'var(--brand)' : 'var(--surface)') + ';color:' + (active ? '#fff' : 'var(--text)') + ';border-color:' + (active ? 'var(--brand)' : 'var(--line-soft)') + ';">' + esc(src) + '</span>';
    }).join('');
    var statusChips = statuses.map(function (st) {
      var active = state.radarStatus === st;
      return '<span class="padmin-chip" data-action="set-radar-status" data-value="' + esc(st) + '" style="background:' + (active ? 'var(--accent)' : 'var(--surface)') + ';color:' + (active ? '#fff' : 'var(--text)') + ';border-color:' + (active ? 'var(--accent)' : 'var(--line-soft)') + ';">' + esc(st) + '</span>';
    }).join('');
    var filtered = topics.filter(function (r) {
      return (state.radarSource === 'Todas' || r.source === state.radarSource) && (state.radarStatus === 'Todos' || r.status === state.radarStatus);
    });

    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap;">' + sourceChips + '<span style="width:1px;height:16px;background:var(--line-soft);margin:0 6px;"></span>' + statusChips +
        (state.user.role === 'director' || state.user.role === 'produccion' ?
          '<span style="margin-left:auto;display:flex;gap:8px;">' +
            (topics.length ? '<button type="button" class="padmin-btn padmin-btn-sm padmin-btn-danger" data-action="clear-topics">🗑 Limpiar todo</button>' : '') +
            '<button type="button" class="padmin-btn padmin-btn-sm" data-action="detect-radar" ' + (state.radarBusy ? 'disabled' : '') + '>' + (state.radarBusy ? 'Buscando…' : '🔍 Buscar tendencias') + '</button>' +
          '</span>' : '') +
      '</div>' +
      '<div class="padmin-card">' +
        '<div class="padmin-table-head padmin-cols-radar"><span>TEMA</span><span>FUENTE</span><span>MENCIONES</span><span>SENTIMIENTO</span><span>ESTADO</span><span>ACCIONES</span></div>' +
        filtered.map(function (r) {
          var sent = sentimentStyle(r.sentiment);
          var stStyle = r.status === 'Nuevo' ? { bg: 'var(--accent-soft)', color: 'var(--accent-text)' } : { bg: 'var(--brand-soft)', color: 'var(--brand)' };
          var canManage = state.user.role === 'director' || state.user.role === 'produccion';
          return '<div class="padmin-table-row clickable padmin-cols-radar" data-action="open-radar" data-id="' + r.id + '">' +
            '<span style="font-size:13px;color:var(--text);">' + esc(r.title) + '</span>' +
            '<span style="font-size:12px;color:var(--text-mute);">' + esc(r.source) + '</span>' +
            '<span style="font-size:12px;color:var(--text);font-weight:600;">' + r.mentions + '</span>' +
            '<span style="font-size:11px;font-weight:600;color:' + sent.color + ';">' + sent.text + '</span>' +
            '<span class="padmin-badge" style="background:' + stStyle.bg + ';color:' + stStyle.color + ';width:fit-content;">' + esc(r.status) + '</span>' +
            '<span style="display:flex;gap:4px;">' +
              '<button type="button" title="Ver" data-action="open-radar" data-id="' + r.id + '" class="padmin-icon-btn">👁</button>' +
              (canManage ? '<button type="button" title="Aprobar" data-action="approve-topic" data-id="' + r.id + '" class="padmin-icon-btn" ' + (r.status === 'Revisado' ? 'disabled' : '') + '>✓</button>' : '') +
              (canManage ? '<button type="button" title="Eliminar" data-action="delete-topic" data-id="' + r.id + '" class="padmin-icon-btn">🗑</button>' : '') +
            '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      renderRadarDetail();
  }

  // ---------- propuestas ----------

  var sensColorMap = { verde: 'var(--brand)', amarillo: 'var(--accent-2)', rojo: 'var(--danger)' };

  function renderPropuestasRechazadas() {
    var rechazadas = state.data.proposalsByKey.rechazada;
    if (!rechazadas || !rechazadas.length || state.user.role !== 'director') return '';
    return '<p style="font-size:12px;font-weight:600;color:var(--text);margin:24px 0 12px;">Rechazadas</p>' +
      '<div class="padmin-card">' + rechazadas.map(function (p) {
        return '<div class="padmin-row"><div><p class="padmin-row-title">' + esc(p.title) + '</p><p class="padmin-row-meta">' + esc(p.review_comment || '') + '</p></div>' +
          '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-propuesta" data-id="' + p.id + '">Eliminar</button></div>';
      }).join('') + '</div>';
  }

  function renderPropuestas() {
    var proposals = state.data.proposalsByKey.propuesta;
    if (!proposals) return loadingCard();
    return '<div>' +
      '<h1 class="padmin-h1">Propuestas de contenido</h1>' +
      '<p class="padmin-lede">Generadas a partir de temas detectados en RADAR. Aprobar pasa la pieza al Editor de nota.</p>' +
      '<div class="padmin-propuestas-grid">' + (proposals.length ? proposals.map(function (p) {
        var isRejecting = state.propuestaRejecting === p.id;
        var body;
        if (isRejecting) {
          body = '<div><label style="font-size:11px;color:var(--text-mute);display:block;margin:0 0 6px;">Motivo del rechazo</label>' +
            '<textarea id="reject-reason-' + p.id + '" style="width:100%;min-height:56px;border:0.5px solid var(--line-soft);border-radius:6px;background:var(--bg-admin);margin-bottom:8px;padding:8px;font:inherit;font-size:12px;box-sizing:border-box;"></textarea>' +
            '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="confirm-reject-propuesta" data-id="' + p.id + '">Confirmar rechazo</button></div>';
        } else {
          body = '<div style="display:flex;gap:6px;">' +
            '<button type="button" class="padmin-btn-sm" style="background:var(--brand);color:#fff;" data-action="approve-propuesta" data-id="' + p.id + '">Aprobar</button>' +
            '<button type="button" class="padmin-btn-sm padmin-btn-danger-outline" data-action="start-reject-propuesta" data-id="' + p.id + '">Rechazar</button>' +
          '</div>';
        }
        return '<div class="padmin-propuesta-card">' +
          '<span class="padmin-sens-dot" style="background:' + (sensColorMap[p.sensibilidad] || 'var(--text-mute)') + ';"></span>' +
          '<p style="font-size:10px;font-weight:600;color:var(--accent-text);background:var(--accent-soft);display:inline-block;padding:3px 8px;border-radius:4px;margin:0 0 10px;">' + esc(p.format) + '</p>' +
          '<p style="font-size:13px;font-weight:500;color:var(--text);margin:0 0 10px;line-height:1.35;">' + esc(p.title) + '</p>' +
          '<p style="font-size:12px;color:var(--text-2);margin:0 0 16px;line-height:1.4;">' + esc(p.angulo || '') + '</p>' +
          body +
        '</div>';
      }).join('') : '<p class="padmin-lede">Sin propuestas pendientes de decisión.</p>') + '</div>' +
      renderPropuestasRechazadas() +
    '</div>';
  }

  // ---------- hermes / pipeline (estático — fuera de alcance) ----------

  function renderHermes() {
    var activity = state.data.activity;
    if (!activity) return loadingCard();
    var skillCounts = {};
    activity.forEach(function (a) { skillCounts[a.action] = (skillCounts[a.action] || 0) + 1; });
    var skills = Object.keys(skillCounts).map(function (k) { return { name: k, count: skillCounts[k] }; }).sort(function (a, b) { return b.count - a.count; });
    return '<div>' +
      '<h1 class="padmin-h1">Estado del agente Hermes</h1>' +
      '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 12px;">Actividad reciente</p>' +
      (activity.length ? '<div class="padmin-hermes-log">' + activity.map(function (h) {
        var ok = h.status === 'exito';
        return '<div class="padmin-hermes-row"><span class="padmin-hermes-time">' + esc(relativeTime(h.created_at)) + '</span><span class="padmin-hermes-task">' + esc(h.detail || h.action) + '</span><span style="color:' + (ok ? '#7CB084' : '#D98A7A') + ';flex-shrink:0;">' + (ok ? '✓ éxito' : '✕ falló') + '</span></div>';
      }).join('') + '</div>' : '<p class="padmin-lede">Sin actividad registrada todavía.</p>') +
      (skills.length ? '<p style="font-size:12px;font-weight:600;color:var(--text);margin:20px 0 4px;">Skills generados desde tareas repetidas</p>' +
        '<div class="padmin-card">' + skills.map(function (sk) {
          return '<div class="padmin-row"><span style="font-size:13px;color:var(--text);">' + esc(sk.name) + '</span><span style="font-size:12px;font-weight:600;color:var(--text-mute);">' + sk.count + ' usos</span></div>';
        }).join('') + '</div>' : '') +
    '</div>';
  }

  function pipelineStepStyle(st) {
    if (st.status === 'completado') return { dotColor: 'var(--brand)', ringColor: 'var(--brand)', badgeBg: 'var(--brand-soft)', badgeColor: 'var(--brand)', badgeLabel: '✅ Automático completado', textColor: 'var(--text)', weight: 500 };
    if (st.status === 'esperando') return { dotColor: 'var(--accent)', ringColor: 'var(--accent)', badgeBg: 'var(--accent-soft)', badgeColor: 'var(--accent-text)', badgeLabel: '⏳ Esperando aprobación', textColor: 'var(--text)', weight: 600 };
    return { dotColor: '#fff', ringColor: 'var(--line-soft)', badgeBg: 'var(--bg-soft)', badgeColor: 'var(--mute-2)', badgeLabel: 'Pendiente — sin automatización', textColor: 'var(--mute-2)', weight: 400 };
  }

  function renderPipeline() {
    var steps = state.data.pipeline;
    if (!steps) return loadingCard();
    return '<div>' +
      '<h1 class="padmin-h1">Pipeline &middot; Buenos días, Perote</h1>' +
      '<p class="padmin-lede">Estado del boletín matutino, derivado de la pieza editorial más reciente.</p>' +
      '<div style="max-width:640px;">' + steps.map(function (st) {
        var sty = pipelineStepStyle(st);
        return '<div class="padmin-pipeline-step">' +
          '<div class="padmin-pipeline-rail"><span class="padmin-pipeline-dot" style="background:' + sty.dotColor + ';border-color:' + sty.ringColor + ';"></span><span class="padmin-pipeline-line"></span></div>' +
          '<div class="padmin-pipeline-body">' +
            '<div class="padmin-pipeline-head"><p style="font-size:14px;font-weight:' + sty.weight + ';color:' + sty.textColor + ';margin:0;">' + esc(st.label) + '</p><span style="font-size:11px;color:var(--mute-2);">' + esc(st.at ? relativeTime(st.at) : '—') + '</span></div>' +
            '<span class="padmin-badge" style="background:' + sty.badgeBg + ';color:' + sty.badgeColor + ';">' + sty.badgeLabel + '</span>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
      renderNewsletterCard() +
    '</div>';
  }

  // ---------- newsletter "Buenos días, Perote" ----------

  function readNewsletterForm() {
    var enBreveRaw = document.getElementById('nl-en-breve').value;
    return {
      weekday: state.newsletterContent.weekday,
      date: state.newsletterContent.date,
      clima: document.getElementById('nl-clima').value,
      notaDelDia: {
        titulo: document.getElementById('nl-nota-titulo').value,
        cuerpo: document.getElementById('nl-nota-cuerpo').value,
      },
      enBreve: enBreveRaw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
      datoDelDia: document.getElementById('nl-dato').value,
      agenda: document.getElementById('nl-agenda').value || null,
      patrocinador: document.getElementById('nl-patro-nombre').value ? {
        nombre: document.getElementById('nl-patro-nombre').value,
        copy: document.getElementById('nl-patro-copy').value,
        link: document.getElementById('nl-patro-link').value,
      } : null,
    };
  }

  function renderNewsletterCard() {
    var count = state.newsletterSubscriberCount;
    var countHtml = '<p style="font-size:12px;color:var(--text-mute);margin:0 0 14px;">' + (count == null ? 'Cargando suscriptores…' : count + ' suscriptor' + (count === 1 ? '' : 'es') + ' activos en Resend.') + '</p>';

    if (!state.newsletterContent) {
      return '<div class="padmin-card" style="max-width:640px;margin-top:28px;padding:20px;">' +
        '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 10px;">Newsletter del día</p>' +
        countHtml +
        '<button type="button" class="padmin-btn padmin-btn-sm" data-action="generate-newsletter" ' + (state.newsletterBusy ? 'disabled' : '') + '>' + (state.newsletterBusy ? 'Generando…' : 'Generar contenido con IA') + '</button>' +
        (state.errorMsg ? '<p style="font-size:12px;color:var(--danger);margin:10px 0 0;">' + esc(state.errorMsg) + '</p>' : '') +
      '</div>';
    }

    var c = state.newsletterContent;
    var enBreveText = (c.enBreve || []).join('\n');
    return '<div class="padmin-card" style="max-width:640px;margin-top:28px;padding:20px;">' +
      '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 10px;">Newsletter del día — ' + esc(c.weekday) + ' ' + esc(c.date) + '</p>' +
      countHtml +
      '<div class="padmin-field"><label>El clima</label><input id="nl-clima" type="text" value="' + esc(c.clima) + '"></div>' +
      '<div class="padmin-field"><label>La nota del día — título</label><input id="nl-nota-titulo" type="text" value="' + esc(c.notaDelDia.titulo) + '"></div>' +
      '<div class="padmin-field"><label>La nota del día — cuerpo</label><textarea id="nl-nota-cuerpo" style="width:100%;min-height:80px;box-sizing:border-box;">' + esc(c.notaDelDia.cuerpo) + '</textarea></div>' +
      '<div class="padmin-field"><label>En breve (una por línea)</label><textarea id="nl-en-breve" style="width:100%;min-height:70px;box-sizing:border-box;">' + esc(enBreveText) + '</textarea></div>' +
      '<div class="padmin-field"><label>Dato del día</label><input id="nl-dato" type="text" value="' + esc(c.datoDelDia || '') + '"></div>' +
      '<div class="padmin-field"><label>Agenda (manual — sin fuente automática)</label><textarea id="nl-agenda" style="width:100%;min-height:50px;box-sizing:border-box;">' + esc(c.agenda || '') + '</textarea></div>' +
      '<div class="padmin-editor-grid2">' +
        '<div class="padmin-field" style="margin:0;"><label>Patrocinador (opcional)</label><input id="nl-patro-nombre" type="text" value="' + esc(c.patrocinador ? c.patrocinador.nombre : '') + '" placeholder="Nombre"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Link</label><input id="nl-patro-link" type="text" value="' + esc(c.patrocinador ? c.patrocinador.link : '') + '" placeholder="https://…"></div>' +
      '</div>' +
      '<div class="padmin-field"><label>Copy del patrocinador</label><input id="nl-patro-copy" type="text" value="' + esc(c.patrocinador ? c.patrocinador.copy : '') + '"></div>' +
      (state.errorMsg ? '<p style="font-size:12px;color:var(--danger);margin:10px 0;">' + esc(state.errorMsg) + '</p>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">' +
        '<button type="button" class="padmin-btn-outline" data-action="regenerate-newsletter" ' + (state.newsletterBusy ? 'disabled' : '') + '>' + (state.newsletterBusy ? 'Generando…' : 'Regenerar con IA') + '</button>' +
        '<button type="button" class="padmin-btn-outline" data-action="preview-newsletter">Vista previa</button>' +
        '<button type="button" class="padmin-btn-outline" data-action="generate-newsletter-audio" ' + (state.newsletterAudioBusy ? 'disabled' : '') + '>' + (state.newsletterAudioBusy ? 'Generando audio…' : 'Generar audio (prueba)') + '</button>' +
        (state.user.role === 'director' ? '<button type="button" class="padmin-btn padmin-btn-brand" data-action="send-newsletter" ' + (state.newsletterSending ? 'disabled' : '') + '>' + (state.newsletterSending ? 'Enviando…' : 'Enviar newsletter') + '</button>' : '') +
      '</div>' +
      (state.newsletterAudioUrl ? '<audio controls src="' + esc(state.newsletterAudioUrl) + '" style="width:100%;margin-top:14px;"></audio>' : '') +
      renderNewsletterPreview() +
    '</div>';
  }

  function renderNewsletterPreview() {
    if (!state.newsletterPreview) return '';
    return '<div style="margin-top:16px;border-top:1px solid var(--line-soft);padding-top:14px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><p style="font-size:11px;font-weight:600;color:var(--text);margin:0;">VISTA PREVIA</p><span class="padmin-drawer-close" data-action="close-newsletter-preview">Cerrar &times;</span></div>' +
      '<iframe srcdoc="' + esc(state.newsletterPreview) + '" class="padmin-preview-frame"></iframe>' +
    '</div>';
  }

  // ---------- producciones (social embeds) ----------

  function renderProducciones() {
    var posts = state.data.socialPosts;
    if (!posts) return loadingCard();
    var errorHtml = state.socialFormError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.socialFormError) + '</p>' : '';
    var formHtml = state.socialFormOpen ? (
      '<div class="padmin-card" style="padding:18px;margin-bottom:18px;max-width:760px;">' +
        errorHtml +
        '<form data-action="submit-social">' +
          '<div class="padmin-field" style="margin:0 0 12px;"><label>URL del video (TikTok, YouTube, Facebook o Instagram)</label><input id="social-url" type="text" required placeholder="https://www.tiktok.com/@cuenta/video/... — o el código &lt;iframe&gt; que da Facebook al presionar &quot;Insertar&quot;"><p class="padmin-row-meta" style="margin:4px 0 0;">Para Facebook también puedes pegar directo el código &lt;iframe&gt; del botón "Insertar" del video: sacamos la URL nosotros.</p></div>' +
          '<div class="padmin-field" style="margin:0 0 12px;"><label>Posición (menor = primero)</label><input id="social-position" type="number" min="0" value="0" style="max-width:140px;"></div>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<button type="submit" class="padmin-btn padmin-btn-sm" ' + (state.socialBusy ? 'disabled' : '') + '>' + (state.socialBusy ? 'Resolviendo…' : 'Agregar') + '</button>' +
            '<button type="button" class="padmin-btn-outline" data-action="close-social-form" ' + (state.socialBusy ? 'disabled' : '') + '>Cancelar</button>' +
            '<span style="font-size:11px;color:var(--text-mute);margin-left:6px;">Al agregar resolvemos el embed y dejamos el post listo para publicar.</span>' +
          '</div>' +
        '</form>' +
      '</div>'
    ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-social-form">+ Agregar URL</button>';

    return '<div>' +
      '<h1 class="padmin-h1">Producciones CREA</h1>' +
      '<p class="padmin-lede">Videos y clips de redes sociales que se muestran en la sección pública <code>/producciones.html</code>. TikTok, YouTube, Facebook e Instagram soportados.</p>' +
      formHtml +
      '<div class="padmin-card">' +
        '<div class="padmin-table-head padmin-cols-social"><span></span><span>RED</span><span>TÍTULO / URL</span><span>POSICIÓN</span><span>ESTADO</span><span></span></div>' +
        (posts.length ? posts.map(function (p) {
          var pub = p.is_published ? { label: 'Publicado', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Borrador', bg: 'var(--accent-soft)', color: 'var(--accent-text)' };
          var titleLine = p.title ? '<p class="padmin-row-title" style="margin:0 0 2px;">' + esc(p.title) + '</p>' : '<p class="padmin-row-title" style="margin:0 0 2px;color:var(--mute-2);">(sin título)</p>';
          return '<div class="padmin-table-row padmin-cols-social">' +
            (p.thumbnail_url ? '<img src="' + esc(p.thumbnail_url) + '" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:4px;background:var(--line-soft);">' : '<div style="width:42px;height:42px;background:var(--line-soft);border-radius:4px;"></div>') +
            '<span style="font-size:12px;font-weight:600;color:var(--brand);text-transform:uppercase;">' + esc(p.network) + '</span>' +
            '<div style="min-width:0;">' + titleLine + '<p class="padmin-row-meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:380px;">' + esc(p.external_url) + '</p></div>' +
            '<span style="font-size:12px;color:var(--text);">' + p.position + '</span>' +
            '<span class="padmin-badge" style="background:' + pub.bg + ';color:' + pub.color + ';width:fit-content;">' + pub.label + '</span>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
              '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-social" data-id="' + p.id + '" data-pub="' + (!p.is_published) + '">' + (p.is_published ? 'Despublicar' : 'Publicar') + '</button>' +
              '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="refetch-social" data-id="' + p.id + '">Refetch</button>' +
              (state.user.role === 'director' ? '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-social" data-id="' + p.id + '">Borrar</button>' : '') +
            '</div>' +
          '</div>';
        }).join('') : '<div class="padmin-row"><p class="padmin-row-meta">Aún no hay producciones. Agrega una URL de TikTok, YouTube, Facebook o Instagram para empezar.</p></div>') +
      '</div>' +
    '</div>';
  }

  // ---------- denegado ----------

  function renderDenegado() {
    var deniedLabelMap = {};
    navItemsAll.forEach(function (n) { deniedLabelMap[n.id] = n.label; });
    var label = state.deniedTarget ? (deniedLabelMap[state.deniedTarget] || state.deniedTarget) : '';
    return '<div class="padmin-denied-wrap"><div style="max-width:380px;text-align:center;">' +
      '<div class="padmin-denied-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>' +
      '<h1 class="padmin-h1">Sin acceso</h1>' +
      '<p style="font-size:13px;color:var(--text-mute);margin:0 0 24px;line-height:1.5;">Tu rol (' + esc(roleLabels[state.user.role] || state.user.role) + ') no tiene permiso para ver «' + esc(label) + '». Si crees que esto es un error, contacta a tu Director editorial.</p>' +
      '<button type="button" class="padmin-btn" data-action="goto" data-id="' + landingFor(state.user.role) + '">Volver a Inicio</button>' +
    '</div></div>';
  }

  // ---------- configuración ----------

  function renderConfigUsuarios() {
    var users = state.data.users;
    if (!users) return loadingCard();
    var editing = state.editingUserId != null ? users.find(function (u) { return u.id === state.editingUserId; }) : null;
    var errorHtml = state.newUserError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.newUserError) + '</p>' : '';
    var formHtml = state.newUserOpen ? (
      '<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:760px;">' +
        errorHtml +
        '<form data-action="submit-new-user" class="padmin-grid2" style="gap:10px;">' +
          '<div class="padmin-field" style="margin:0;"><label>Nombre</label><input id="nu-name" type="text" required value="' + esc(editing ? editing.name : '') + '"></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Correo</label><input id="nu-email" type="email" required value="' + esc(editing ? editing.email : '') + '"></div>' +
          '<div class="padmin-field" style="margin:0;"><label>' + (editing ? 'Nueva contraseña (opcional)' : 'Contraseña') + '</label><input id="nu-password" type="password"' + (editing ? '' : ' required') + '></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Rol</label><select id="nu-role">' + Object.keys(roleLabels).map(function (r) { return '<option value="' + r + '"' + (editing && editing.role === r ? ' selected' : '') + '>' + esc(roleLabels[r]) + '</option>'; }).join('') + '</select></div>' +
          '<div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">' + (editing ? 'Guardar cambios' : 'Crear usuario') + '</button><button type="button" class="padmin-btn-outline" data-action="close-new-user">Cancelar</button></div>' +
        '</form>' +
      '</div>'
    ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-user">+ Nuevo usuario</button>';

    return formHtml + '<div class="padmin-card" style="max-width:760px;">' +
      '<div class="padmin-table-head padmin-cols-users"><span>NOMBRE</span><span>ROL</span><span>ESTADO</span><span></span></div>' +
      users.map(function (u) {
        var st = u.active ? { label: 'Activo', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Inactivo', bg: 'var(--bg-soft)', color: 'var(--mute-2)' };
        return '<div class="padmin-table-row padmin-cols-users">' +
          '<span style="font-size:13px;color:var(--text);">' + esc(u.name) + '</span>' +
          '<span style="font-size:12px;color:var(--text-mute);">' + esc(roleLabels[u.role] || u.role) + '</span>' +
          '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';width:fit-content;">' + st.label + '</span>' +
          '<span style="display:flex;gap:4px;flex-wrap:wrap;">' +
            '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="open-edit-user" data-id="' + u.id + '">Editar</button>' +
            '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="toggle-user-active" data-id="' + u.id + '" data-active="' + (!u.active) + '">' + (u.active ? 'Desactivar' : 'Activar') + '</button>' +
          '</span>' +
        '</div>';
      }).join('') + '</div>';
  }

  // La matriz sale de GET /api/auth/roles (ROLE_MODULES del backend) — sin copia local
  // que pueda divergir de lo que el servidor de verdad aplica.
  function renderConfigPermisos() {
    var roles = state.data.roleModules;
    if (!roles) return loadingCard();
    var roleOrder = ['director', 'produccion', 'comercial', 'colaborador'];
    function mark(v) { return v ? '<span style="color:var(--brand);">✓</span>' : '<span style="color:var(--line);">—</span>'; }
    return '<div class="padmin-card" style="max-width:780px;overflow:auto;">' +
      '<div class="padmin-table-head padmin-cols-permisos"><span>MÓDULO</span><span>DIRECTOR</span><span>PRODUCCIÓN</span><span>COMERCIAL</span><span>COLABORADOR</span></div>' +
      navItemsAll.map(function (n) {
        return '<div class="padmin-table-row padmin-cols-permisos"><span style="font-size:13px;color:var(--text);">' + esc(n.label) + '</span>' +
          roleOrder.map(function (r) {
            return '<span style="font-weight:600;">' + mark((roles[r] || []).indexOf(n.id) !== -1) + '</span>';
          }).join('') + '</div>';
      }).join('') + '</div>';
  }

  function renderConfigIntegraciones() {
    var integrations = state.data.integrations;
    if (!integrations) return loadingCard();
    return '<p class="padmin-lede" style="margin-bottom:14px;">Solo lectura — refleja las variables de entorno configuradas en el servidor.</p>' +
      '<div class="padmin-integraciones-grid">' + integrations.map(function (i) {
      var st = i.connected ? { label: 'Conectado', bg: 'var(--brand-soft)', color: 'var(--brand)', dot: 'var(--brand)' } : { label: 'Desconectado', bg: 'var(--bg-soft)', color: 'var(--mute-2)', dot: 'var(--line)' };
      return '<div class="padmin-integracion-card"><div style="display:flex;align-items:center;gap:10px;"><span class="padmin-dot" style="background:' + st.dot + ';"></span><div><p style="font-size:13px;font-weight:500;color:var(--text);margin:0 0 2px;">' + esc(i.name) + '</p><p style="font-size:11px;color:var(--text-mute);margin:0;">' + esc(i.desc) + '</p></div></div><span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';">' + st.label + '</span></div>';
    }).join('') + '</div>';
  }

  function renderConfigNewsletter() {
    var settings = state.data.newsletterSettings;
    if (!settings) return loadingCard();
    var hours = Array.from({ length: 24 }, function (_, i) { return i; });
    var minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    return '<div class="padmin-card" style="max-width:480px;padding:20px;">' +
      '<form data-action="submit-newsletter-settings">' +
        '<div class="padmin-field padmin-field-inline">' +
          '<input id="nls-enabled" type="checkbox"' + (settings.enabled ? ' checked' : '') + '>' +
          '<label for="nls-enabled">Envío automático diario activo</label>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--text-mute);margin:0 0 14px;">A la hora configurada, el sistema genera el contenido (clima real + IA) y lo deja pendiente de aprobación en Pipeline → Buenos días, Perote. Nunca se envía solo.</p>' +
        '<div class="padmin-editor-grid2">' +
          '<div class="padmin-field" style="margin:0;"><label>Hora</label><select id="nls-hour">' + hours.map(function (h) { return '<option value="' + h + '"' + (h === settings.send_hour ? ' selected' : '') + '>' + String(h).padStart(2, '0') + '</option>'; }).join('') + '</select></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Minuto</label><select id="nls-minute">' + minutes.map(function (m) { return '<option value="' + m + '"' + (m === settings.send_minute ? ' selected' : '') + '>' + String(m).padStart(2, '0') + '</option>'; }).join('') + '</select></div>' +
        '</div>' +
        '<p style="font-size:11px;color:var(--mute-2);margin:10px 0 14px;">Zona horaria: America/Mexico_City.</p>' +
        (state.errorMsg ? '<p style="font-size:12px;color:var(--danger);margin:0 0 10px;">' + esc(state.errorMsg) + '</p>' : '') +
        '<button type="submit" class="padmin-btn padmin-btn-sm">Guardar</button>' +
      '</form>' +
    '</div>' +
    renderConfigAgenda();
  }

  function renderConfigAgenda() {
    var events = state.data.newsletterEvents;
    return '<div class="padmin-card" style="max-width:480px;padding:20px;margin-top:16px;">' +
      '<p style="font-size:12px;font-weight:600;color:var(--text);margin:0 0 10px;">Agenda del newsletter</p>' +
      '<p style="font-size:12px;color:var(--text-mute);margin:0 0 14px;">Eventos reales del día (cortes de agua, eventos culturales, partidos, trámites). Sin esto, la sección "Agenda" del newsletter queda vacía — nunca se inventa.</p>' +
      '<form data-action="submit-newsletter-event" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">' +
        '<input id="ne-date" type="date" required style="flex:0 0 150px;">' +
        '<input id="ne-title" type="text" placeholder="Ej. Corte de agua en colonia Centro, 9am-2pm" required style="flex:1;min-width:200px;">' +
        '<button type="submit" class="padmin-btn-sm">Agregar</button>' +
      '</form>' +
      (events == null ? loadingCard() : (events.length ? events.map(function (ev) {
        return '<div class="padmin-row" style="padding:8px 0;"><div><p class="padmin-row-title" style="font-size:13px;">' + esc(ev.title) + '</p><p class="padmin-row-meta">' + esc(ev.event_date) + '</p></div>' +
          '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-newsletter-event" data-id="' + ev.id + '">Eliminar</button></div>';
      }).join('') : '<p class="padmin-lede">Sin eventos próximos cargados.</p>')) +
    '</div>';
  }

  function renderConfigServicios() {
    var services = state.data.services;
    if (!services) return loadingCard();
    var editing = state.editingServiceId != null ? services.find(function (s) { return s.id === state.editingServiceId; }) : null;
    var errorHtml = state.serviceFormError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.serviceFormError) + '</p>' : '';
    var formHtml = state.serviceFormOpen ? (
      '<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:640px;">' +
        errorHtml +
        '<form data-action="submit-service" class="padmin-grid2" style="gap:10px;">' +
          '<div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Nombre del paquete</label><input id="sv-name" type="text" required value="' + esc(editing ? editing.name : '') + '"></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Precio (texto libre)</label><input id="sv-price" type="text" placeholder="$2,500–$5,000 MXN/mes" required value="' + esc(editing ? editing.price_label : '') + '"></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Interés para el form de contacto</label><input id="sv-interest" type="text" placeholder="Otro" value="' + esc(editing ? editing.cta_interest : '') + '"></div>' +
          '<div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Descripción</label><textarea id="sv-desc" required style="min-height:70px;">' + esc(editing ? editing.description : '') + '</textarea></div>' +
          '<div class="padmin-field" style="margin:0;grid-column:1 / -1;"><label>Qué incluye (una por línea)</label><textarea id="sv-features" style="min-height:70px;">' + esc(editing ? (editing.features || []).join('\n') : '') + '</textarea></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Orden</label><input id="sv-order" type="number" value="' + (editing ? editing.sort_order : services.length) + '"></div>' +
          '<div class="padmin-field padmin-field-inline" style="margin:0;padding-top:18px;"><input id="sv-active" type="checkbox"' + (editing ? (editing.active ? ' checked' : '') : ' checked') + '><label>Activo (visible en el sitio)</label></div>' +
          '<div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">' + (editing ? 'Guardar cambios' : 'Crear paquete') + '</button><button type="button" class="padmin-btn-outline" data-action="close-service-form">Cancelar</button></div>' +
        '</form>' +
      '</div>'
    ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-service">+ Nuevo servicio</button>';

    return formHtml + '<div class="padmin-card" style="max-width:780px;">' +
      '<div class="padmin-table-head padmin-cols-services"><span>NOMBRE</span><span>PRECIO</span><span>ESTADO</span><span></span></div>' +
      (services.length ? services.map(function (s) {
        var st = s.active ? { label: 'Activo', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Inactivo', bg: 'var(--bg-soft)', color: 'var(--mute-2)' };
        return '<div class="padmin-table-row padmin-cols-services">' +
          '<span style="font-size:13px;color:var(--text);">' + esc(s.name) + '</span>' +
          '<span style="font-size:12px;color:var(--text-mute);">' + esc(s.price_label) + '</span>' +
          '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';width:fit-content;">' + st.label + '</span>' +
          '<span style="display:flex;gap:6px;">' +
            '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="edit-service" data-id="' + s.id + '">Editar</button>' +
            '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-service" data-id="' + s.id + '">Borrar</button>' +
          '</span>' +
        '</div>';
      }).join('') : '<p class="padmin-lede" style="padding:16px;">Sin paquetes cargados. El catálogo público quedará vacío hasta que agregues uno.</p>') +
    '</div>';
  }

  function renderConfigCuentasFb() {
    var accounts = state.data.fbAccounts;
    if (!accounts) return loadingCard();
    var editing = state.editingFbAccountId != null ? accounts.find(function (a) { return a.id === state.editingFbAccountId; }) : null;
    var errorHtml = state.fbAccountFormError ? '<p class="padmin-lede" style="color:var(--danger);">' + esc(state.fbAccountFormError) + '</p>' : '';
    var formHtml = state.fbAccountFormOpen ? (
      '<div class="padmin-card" style="padding:16px;margin-bottom:16px;max-width:760px;">' +
        errorHtml +
        '<form data-action="submit-fb-account" class="padmin-grid2" style="gap:10px;">' +
          '<div class="padmin-field" style="margin:0;"><label>Nombre del medio</label><input id="fba-label" type="text" required value="' + esc(editing ? editing.label : '') + '"></div>' +
          '<div class="padmin-field" style="margin:0;"><label>Handle o URL de Facebook</label><input id="fba-handle" type="text" placeholder="NombreDeLaPagina o https://facebook.com/..." required value="' + esc(editing ? editing.handle_or_url : '') + '"></div>' +
          '<div class="padmin-field padmin-field-inline" style="margin:0;padding-top:18px;"><input id="fba-active" type="checkbox"' + (editing ? (editing.active ? ' checked' : '') : ' checked') + '><label>Activa (se usa al escanear Facebook)</label></div>' +
          '<div style="grid-column:1 / -1;display:flex;gap:8px;"><button type="submit" class="padmin-btn padmin-btn-sm">' + (editing ? 'Guardar cambios' : 'Agregar cuenta') + '</button><button type="button" class="padmin-btn-outline" data-action="close-fb-account-form">Cancelar</button></div>' +
        '</form>' +
      '</div>'
    ) : '<button type="button" class="padmin-btn padmin-btn-sm" style="margin-bottom:16px;" data-action="open-new-fb-account">+ Nueva cuenta</button>';

    return '<p class="padmin-lede">Cuentas de Facebook que usa "Escanear Facebook" en RADAR → Competencia cuando no se especifican otras. Solo las activas se scrapean.</p>' +
      formHtml + '<div class="padmin-card" style="max-width:760px;">' +
      '<div class="padmin-table-head padmin-cols-services"><span>MEDIO</span><span>CUENTA</span><span>ESTADO</span><span></span></div>' +
      (accounts.length ? accounts.map(function (a) {
        var st = a.active ? { label: 'Activa', bg: 'var(--brand-soft)', color: 'var(--brand)' } : { label: 'Inactiva', bg: 'var(--bg-soft)', color: 'var(--mute-2)' };
        return '<div class="padmin-table-row padmin-cols-services">' +
          '<span style="font-size:13px;color:var(--text);">' + esc(a.label) + '</span>' +
          '<span style="font-size:12px;color:var(--text-mute);">' + esc(a.handle_or_url) + '</span>' +
          '<span class="padmin-badge" style="background:' + st.bg + ';color:' + st.color + ';width:fit-content;">' + st.label + '</span>' +
          '<span style="display:flex;gap:6px;">' +
            '<button type="button" class="padmin-btn-sm padmin-btn-outline" data-action="edit-fb-account" data-id="' + a.id + '">Editar</button>' +
            '<button type="button" class="padmin-btn-sm padmin-btn-danger" data-action="delete-fb-account" data-id="' + a.id + '">Borrar</button>' +
          '</span>' +
        '</div>';
      }).join('') : '<p class="padmin-lede" style="padding:16px;">Sin cuentas cargadas. "Escanear Facebook" fallará hasta que agregues al menos una.</p>') +
    '</div>';
  }

  // Estadísticas de audiencia mostradas en estudio/index.html, media-kit.html y
  // tercer-tiempo.html — antes copiadas a mano en los 3 archivos, ahora una sola fuente.
  function renderConfigMetricas() {
    var m = state.data.siteMetrics;
    if (!m) return loadingCard();
    return '<div class="padmin-card" style="max-width:480px;padding:20px;">' +
      '<form data-action="submit-site-metrics" class="padmin-grid2" style="gap:10px;">' +
        '<div class="padmin-field" style="margin:0;"><label>Alcance mensual</label><input id="sm-reach" type="text" value="' + esc(m.monthly_reach_label) + '" placeholder="42K"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Municipios cubiertos</label><input id="sm-municipios" type="number" min="0" value="' + m.municipalities_count + '"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Oyentes Tercer Tiempo</label><input id="sm-listeners" type="text" value="' + esc(m.tercer_tiempo_listeners_label) + '" placeholder="+1K"></div>' +
        '<div></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Edad 18-24 (%)</label><input id="sm-age-1" type="number" min="0" max="100" value="' + m.audience_age_18_24_pct + '"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Edad 25-44 (%)</label><input id="sm-age-2" type="number" min="0" max="100" value="' + m.audience_age_25_44_pct + '"></div>' +
        '<div class="padmin-field" style="margin:0;"><label>Edad 45+ (%)</label><input id="sm-age-3" type="number" min="0" max="100" value="' + m.audience_age_45_plus_pct + '"></div>' +
        '<div></div>' +
        (state.errorMsg ? '<p style="grid-column:1 / -1;font-size:12px;color:var(--danger);margin:0;">' + esc(state.errorMsg) + '</p>' : '') +
        '<div style="grid-column:1 / -1;"><button type="submit" class="padmin-btn padmin-btn-sm">Guardar</button></div>' +
      '</form>' +
      '<p style="font-size:11px;color:var(--mute-2);margin:12px 0 0;">Actualizado ' + esc(relativeTime(m.updated_at)) + ' &middot; se refleja de inmediato en Estudio (Inicio, Media kit, Tercer Tiempo).</p>' +
    '</div>';
  }

  function renderConfiguracion() {
    var tab = state.configTab;
    var body = tab === 'permisos' ? renderConfigPermisos() : (tab === 'integraciones' ? renderConfigIntegraciones() : (tab === 'newsletter' ? renderConfigNewsletter() : (tab === 'servicios' ? renderConfigServicios() : (tab === 'metricas-sitio' ? renderConfigMetricas() : (tab === 'cuentas-fb' ? renderConfigCuentasFb() : renderConfigUsuarios())))));
    function tabBtn(id, label) {
      var active = tab === id;
      return '<button type="button" class="padmin-tab' + (active ? ' active' : '') + '" data-action="set-config-tab" data-tab="' + id + '">' + label + '</button>';
    }
    return '<div>' +
      '<h1 class="padmin-h1">Configuración</h1>' +
      '<p class="padmin-lede">Usuarios, permisos e integraciones del panel. Solo visible para Director.</p>' +
      '<div class="padmin-tabs">' + tabBtn('usuarios', 'Usuarios') + tabBtn('permisos', 'Permisos') + tabBtn('integraciones', 'Integraciones') + tabBtn('newsletter', 'Newsletter') + tabBtn('servicios', 'Servicios') + tabBtn('cuentas-fb', 'Cuentas FB') + tabBtn('metricas-sitio', 'Métricas del sitio') + '</div>' +
      body +
    '</div>';
  }

  // ---------- top-level render ----------

  var screenRenderers = {
    dashboard: renderDashboard, ideas: renderIdeas, editor: renderEditor, aprobacion: renderAprobacion,
    comercial: renderComercial, leads: renderLeads, metricas: renderMetricas, radar: renderRadar, propuestas: renderPropuestas,
    producciones: renderProducciones,
    hermes: renderHermes, pipeline: renderPipeline, denegado: renderDenegado, configuracion: renderConfiguracion
  };

  function render() {
    var app = document.getElementById('app');
    if (state.screen === 'login' || !state.user) {
      app.innerHTML = renderLogin();
      return;
    }
    var fn = screenRenderers[state.screen] || renderDashboard;
    app.innerHTML = renderShell(fn());
  }

  // ---------- event delegation ----------

  function handleClick(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    switch (action) {
      case 'logout': logout(); break;
      case 'goto': goTo(el.getAttribute('data-id'), el.getAttribute('data-pid') ? Number(el.getAttribute('data-pid')) : null); break;
      case 'open-editor': goTo('editor', Number(el.getAttribute('data-id'))); break;
      case 'close-editor': setState({ editorProposalId: null, editorDraft: null }); break;
      case 'toggle-notifications':
        var opening = !state.showNotifications;
        setState({ showNotifications: opening });
        if (opening) {
          try { localStorage.setItem('crea-admin-last-notif-seen', new Date().toISOString()); } catch (e) { /* modo privado */ }
        }
        break;
      case 'toggle-sound':
        var muted = !isSoundMuted();
        try { localStorage.setItem('crea-admin-sound-muted', muted ? '1' : '0'); } catch (e) { /* modo privado */ }
        setState({ soundMuted: muted });
        break;
      case 'dismiss-toast':
        if (el.getAttribute('data-kind') === 'error') setState({ errorMsg: null });
        else setState({ successMsg: null });
        break;
      case 'set-radar-source': setState({ radarSource: el.getAttribute('data-value') }); break;
      case 'set-radar-status': setState({ radarStatus: el.getAttribute('data-value') }); break;
      case 'set-radar-tab': setState({ radarTab: el.getAttribute('data-tab') }); loadScreenData('radar'); break;
      case 'detect-competitors':
        setState({ competitorsBusy: true });
        adminApi('/api/listening/competitors/detect', { method: 'POST' })
          .then(function () { return adminApi('/api/listening/competitors'); })
          .then(function (posts) {
            state.data.competitors = posts;
            setState({ competitorsBusy: false, successMsg: 'Exploración de competencia completada.' });
          })
          .catch(function (err) { setState({ competitorsBusy: false, errorMsg: err.message }); });
        break;
      case 'detect-competitors-fb':
        setState({ competitorsBusy: true });
        adminApi('/api/listening/competitors/detect', { method: 'POST', body: { source: 'facebook' } })
          .then(function () { return Promise.all([adminApi('/api/listening/competitors'), adminApi('/api/listening/topics')]); })
          .then(function (results) {
            state.data.competitors = results[0];
            state.data.topics = results[1];
            setState({ competitorsBusy: false, successMsg: 'Escaneo de Facebook completado.' });
          })
          .catch(function (err) { setState({ competitorsBusy: false, errorMsg: err.message }); });
        break;
      case 'analyze-competitor': submitAnalyzeCompetitor(Number(el.getAttribute('data-id'))); break;
      case 'delete-competitor': submitDeleteCompetitor(Number(el.getAttribute('data-id'))); break;
      case 'clear-competitors': submitClearCompetitors(); break;
      case 'competitor-to-idea': submitCompetitorToIdea(Number(el.getAttribute('data-id'))); break;
      case 'set-leads-status': setState({ leadsStatus: el.getAttribute('data-value') }); break;
      case 'mark-lead': submitMarkLead(Number(el.getAttribute('data-id')), el.getAttribute('data-status')); break;
      case 'convert-lead': submitConvertLead(Number(el.getAttribute('data-id'))); break;
      case 'delete-lead': submitDeleteLead(Number(el.getAttribute('data-id'))); break;
      case 'open-radar': setState({ selectedRadarId: Number(el.getAttribute('data-id')) }); break;
      case 'close-radar': setState({ selectedRadarId: null }); break;
      case 'approve-topic': submitApproveTopic(Number(el.getAttribute('data-id'))); break;
      case 'delete-topic': submitDeleteTopic(Number(el.getAttribute('data-id'))); break;
      case 'clear-topics': submitClearTopics(); break;
      case 'open-comentario': setState({ comentarioPieceId: Number(el.getAttribute('data-id')), comentarioText: '' }); break;
      case 'close-comentario': setState({ comentarioPieceId: null, comentarioText: '' }); break;
      case 'confirm-comentario': submitReturn(Number(el.getAttribute('data-id'))); break;
      case 'set-transparency': setState({ transparency: mergeKey(state.transparency, el.getAttribute('data-piece'), el.getAttribute('data-label')) }); break;
      case 'approve-piece': submitPublish(Number(el.getAttribute('data-id'))); break;
      case 'distribute': submitDistribute(el.getAttribute('data-channel'), Number(el.getAttribute('data-id'))); break;
      case 'set-config-tab': setState({ configTab: el.getAttribute('data-tab') }); loadScreenData('configuracion'); break;
      case 'approve-propuesta': submitApproveProposal(Number(el.getAttribute('data-id'))); break;
      case 'start-reject-propuesta': setState({ propuestaRejecting: Number(el.getAttribute('data-id')) }); break;
      case 'confirm-reject-propuesta': submitRejectProposal(Number(el.getAttribute('data-id'))); break;
      case 'advance-client': submitAdvanceClient(Number(el.getAttribute('data-id')), el.getAttribute('data-stage')); break;
      case 'delete-idea': submitDeleteIdea(Number(el.getAttribute('data-id'))); break;
      case 'open-client-form': setState({ clientFormOpen: true, clientFormError: null }); break;
      case 'close-client-form': setState({ clientFormOpen: false, clientFormError: null }); break;
      case 'delete-client': submitDeleteClient(Number(el.getAttribute('data-id'))); break;
      case 'delete-propuesta': submitDeleteProposal(Number(el.getAttribute('data-id'))); break;
      case 'save-draft': submitDraft(Number(el.getAttribute('data-id')), false); break;
      case 'submit-review': submitDraft(Number(el.getAttribute('data-id')), true); break;
      case 'open-new-user': setState({ newUserOpen: true, newUserError: null, editingUserId: null }); break;
      case 'open-edit-user': setState({ newUserOpen: true, newUserError: null, editingUserId: Number(el.getAttribute('data-id')) }); break;
      case 'close-new-user': setState({ newUserOpen: false, newUserError: null, editingUserId: null }); break;
      case 'toggle-user-active': submitToggleUser(Number(el.getAttribute('data-id')), el.getAttribute('data-active') === 'true'); break;
      case 'open-new-service': setState({ serviceFormOpen: true, serviceFormError: null, editingServiceId: null }); break;
      case 'edit-service': setState({ serviceFormOpen: true, serviceFormError: null, editingServiceId: Number(el.getAttribute('data-id')) }); break;
      case 'close-service-form': setState({ serviceFormOpen: false, serviceFormError: null, editingServiceId: null }); break;
      case 'delete-service': submitDeleteService(Number(el.getAttribute('data-id'))); break;
      case 'open-new-fb-account': setState({ fbAccountFormOpen: true, fbAccountFormError: null, editingFbAccountId: null }); break;
      case 'edit-fb-account': setState({ fbAccountFormOpen: true, fbAccountFormError: null, editingFbAccountId: Number(el.getAttribute('data-id')) }); break;
      case 'close-fb-account-form': setState({ fbAccountFormOpen: false, fbAccountFormError: null, editingFbAccountId: null }); break;
      case 'delete-fb-account': submitDeleteFbAccount(Number(el.getAttribute('data-id'))); break;
      case 'generate-draft':
        if (!state.editorProposalId) break;
        // Snapshot del form antes del re-render: sin esto las ediciones sin guardar
        // (dek, slug, etc.) se pierden al volver a pintar la pantalla.
        state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm());
        setState({ generatingDraft: true });
        adminApi('/api/content/generate-draft', { method: 'POST', body: { proposal_id: state.editorProposalId } })
          .then(function (res) {
            if (state.editorDraft) state.editorDraft.body = res.body;
            setState({ generatingDraft: false });
          })
          .catch(function (err) { setState({ generatingDraft: false, errorMsg: err.message }); });
        break;
      case 'preview-piece': {
        var ppid = Number(el.getAttribute('data-id'));
        var ppLists = (state.data.proposalsByKey.borrador || []).concat(state.data.proposalsByKey.en_revision || []);
        var pp = ppLists.filter(function (p) { return p.id === ppid; })[0];
        if (pp) setState({ pickerPreview: pp });
        break;
      }
      case 'close-picker-preview': setState({ pickerPreview: null }); break;
      case 'toggle-mobile-nav': setState({ mobileNavOpen: !state.mobileNavOpen }); break;
      case 'delete-borrador': submitDeleteBorrador(Number(el.getAttribute('data-id'))); break;
      case 'generate-image':
        if (!state.editorProposalId) break;
        state.editorDraft = Object.assign({}, state.editorDraft, readEditorForm());
        var imgPrompt = document.getElementById('editor-image-prompt').value;
        if (!imgPrompt.trim()) { setState({ errorMsg: 'Escribe un prompt para generar la imagen.' }); break; }
        setState({ generatingImage: true, editorImagePrompt: imgPrompt });
        adminApi('/api/content/generate-image', { method: 'POST', body: { proposal_id: state.editorProposalId, prompt: imgPrompt } })
          .then(function (res) {
            if (state.editorDraft) state.editorDraft.cover_image_url = res.cover_image_url;
            setState({ generatingImage: false, successMsg: 'Imagen de portada generada.' });
          })
          .catch(function (err) { setState({ generatingImage: false, errorMsg: err.message }); });
        break;
      case 'run-qa':
        if (!state.editorProposalId) break;
        setState({ qaBusy: true, qaResult: null });
        adminApi('/api/content/qa-check', { method: 'POST', body: { proposal_id: state.editorProposalId } })
          .then(function (res) { setState({ qaBusy: false, qaResult: res }); })
          .catch(function (err) { setState({ qaBusy: false, errorMsg: err.message }); });
        break;
      case 'close-qa': setState({ qaResult: null }); break;
      case 'preview-nota':
        if (!state.editorDraft) break;
        var previewFields = readEditorForm();
        state.editorDraft = Object.assign({}, state.editorDraft, previewFields);
        setState({ notaPreviewHtml: buildNotaPreviewDoc(previewFields) });
        break;
      case 'close-nota-preview': setState({ notaPreviewHtml: null }); break;
      case 'generate-newsletter':
      case 'regenerate-newsletter':
        setState({ newsletterBusy: true, errorMsg: null });
        adminApi('/api/newsletter/generate', { method: 'POST' })
          .then(function (content) { setState({ newsletterBusy: false, newsletterContent: content, newsletterPreview: null, newsletterAudioUrl: null }); })
          .catch(function (err) { setState({ newsletterBusy: false, errorMsg: err.message }); });
        break;
      case 'preview-newsletter':
        adminApi('/api/newsletter/preview', { method: 'POST', body: readNewsletterForm() })
          .then(function (res) { setState({ newsletterPreview: res.html, errorMsg: null }); })
          .catch(function (err) { setState({ errorMsg: err.message }); });
        break;
      case 'close-newsletter-preview': setState({ newsletterPreview: null }); break;
      case 'generate-newsletter-audio':
        setState({ newsletterAudioBusy: true, errorMsg: null });
        adminApiBlob('/api/newsletter/audio', { method: 'POST', body: readNewsletterForm() })
          .then(function (blob) {
            setState({ newsletterAudioBusy: false, newsletterAudioUrl: URL.createObjectURL(blob) });
          })
          .catch(function (err) { setState({ newsletterAudioBusy: false, errorMsg: err.message }); });
        break;
      case 'send-newsletter':
        if (!confirm('¿Enviar el newsletter a todos los suscriptores activos? Esta acción no se puede deshacer.')) break;
        setState({ newsletterSending: true, errorMsg: null });
        adminApi('/api/newsletter/send', { method: 'POST', body: readNewsletterForm() })
          .then(function () {
            setState({ newsletterSending: false, newsletterContent: null, newsletterPreview: null, newsletterAudioUrl: null, successMsg: 'Newsletter enviado a los suscriptores.' });
          })
          .catch(function (err) { setState({ newsletterSending: false, errorMsg: err.message }); });
        break;
      case 'detect-radar':
        setState({ radarBusy: true });
        adminApi('/api/listening/topics/detect', { method: 'POST' })
          .then(function () { return adminApi('/api/listening/topics'); })
          .then(function (topics) {
            setState({ radarBusy: false, data: Object.assign({}, state.data, { topics: topics }) });
          })
          .catch(function (err) { setState({ radarBusy: false, errorMsg: err.message }); });
        break;
      case 'generate-proposal-from-topic':
        var topicId = Number(el.getAttribute('data-id'));
        var format = document.getElementById('proposal-format-' + topicId);
        setState({ generatingProposal: true });
        adminApi('/api/content/generate-proposal', { method: 'POST', body: { topic_id: topicId, format: format ? format.value : 'nota' } })
          .then(function (proposal) {
            state.data.proposalsByKey = {};
            setState({ generatingProposal: false, selectedRadarId: null, successMsg: 'Propuesta creada: ' + proposal.title });
          })
          .catch(function (err) { setState({ generatingProposal: false, errorMsg: err.message }); });
        break;
      case 'open-social-form': setState({ socialFormOpen: true, socialFormError: null }); break;
      case 'close-social-form': setState({ socialFormOpen: false, socialFormError: null, socialBusy: false }); break;
      case 'toggle-social': submitToggleSocial(Number(el.getAttribute('data-id')), el.getAttribute('data-pub') === 'true'); break;
      case 'refetch-social': submitRefetchSocial(Number(el.getAttribute('data-id'))); break;
      case 'delete-social': submitDeleteSocial(Number(el.getAttribute('data-id'))); break;
      case 'delete-newsletter-event':
        var evId = Number(el.getAttribute('data-id'));
        adminApi('/api/newsletter/events/' + evId, { method: 'DELETE' })
          .then(function () { setData({ newsletterEvents: (state.data.newsletterEvents || []).filter(function (ev) { return ev.id !== evId; }) }); })
          .catch(function (err) { setState({ errorMsg: err.message }); });
        break;
      case 'save-sponsor-info':
        var spId = Number(el.getAttribute('data-id'));
        adminApi('/api/commercial/clients/' + spId, { method: 'PATCH', body: {
          website_url: document.getElementById('sponsor-link-' + spId).value.trim(),
          sponsor_copy: document.getElementById('sponsor-copy-' + spId).value.trim(),
        } })
          .then(function (updated) {
            setData({ clients: (state.data.clients || []).map(function (c) { return c.id === spId ? Object.assign({}, c, updated) : c; }) });
          })
          .catch(function (err) { setState({ errorMsg: err.message }); });
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

  // ---------- write actions ----------

  function setProposalsKey(key, list) {
    var byKey = Object.assign({}, state.data.proposalsByKey);
    byKey[key] = list;
    setData({ proposalsByKey: byKey });
  }

  function submitApproveProposal(id) {
    adminApi('/api/editorial/proposals/' + id + '/approve', { method: 'PATCH' })
      .then(function () {
        var list = state.data.proposalsByKey.propuesta.filter(function (p) { return p.id !== id; });
        var byKey = Object.assign({}, state.data.proposalsByKey, { propuesta: list, borrador: null });
        setData({ proposalsByKey: byKey });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitRejectProposal(id) {
    var textarea = document.getElementById('reject-reason-' + id);
    var reason = textarea ? textarea.value.trim() : '';
    if (!reason) { textarea && textarea.focus(); setState({ errorMsg: 'Escribe un motivo antes de rechazar la propuesta.' }); return; }
    adminApi('/api/editorial/proposals/' + id + '/reject', { method: 'PATCH', body: { reason: reason } })
      .then(function () {
        var list = state.data.proposalsByKey.propuesta.filter(function (p) { return p.id !== id; });
        setState({ propuestaRejecting: null, successMsg: 'Propuesta rechazada.' });
        setProposalsKey('propuesta', list);
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDraft(id, thenSubmitReview) {
    var body = readEditorForm();
    adminApi('/api/editorial/proposals/' + id + '/draft', { method: 'PATCH', body: body })
      .then(function (updated) {
        if (!thenSubmitReview) {
          // Se queda en el editor — solo refresca el borrador guardado.
          setState({ editorDraft: {
            title: updated.title || '', body: updated.body || '', section: updated.section || '', dek: updated.dek || '', slug: updated.slug || '',
            cover_image_url: updated.cover_image_url || '', author_name: updated.author_name || '',
            is_sponsored: Boolean(updated.is_sponsored), sponsor_name: updated.sponsor_name || ''
          }, successMsg: 'Borrador guardado.' });
          return;
        }
        return adminApi('/api/editorial/proposals/' + id + '/submit-review', { method: 'PATCH' }).then(function () {
          state.editorProposalId = null;
          state.editorDraft = null;
          state.data.proposalsByKey = {};
          goTo('dashboard');
          setState({ successMsg: 'Nota enviada a revisión.' });
        });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitPublish(id) {
    var origin = state.transparency[id];
    adminApi('/api/editorial/proposals/' + id + '/publish', { method: 'PATCH', body: { origin: origin } })
      .then(function () {
        var list = state.data.proposalsByKey.en_revision.filter(function (p) { return p.id !== id; });
        setProposalsKey('en_revision', list);
        setState({ successMsg: 'Nota publicada correctamente.' });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitReturn(id) {
    var comment = (document.getElementById('comentario-text') || {}).value || '';
    if (!comment.trim()) { setState({ errorMsg: 'Escribe un comentario antes de regresar la nota.' }); return; }
    adminApi('/api/editorial/proposals/' + id + '/return', { method: 'PATCH', body: { comment: comment } })
      .then(function () {
        var list = state.data.proposalsByKey.en_revision.filter(function (p) { return p.id !== id; });
        setState({ comentarioPieceId: null, comentarioText: '', successMsg: 'Nota regresada a borrador.' });
        setProposalsKey('en_revision', list);
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitAdvanceClient(id, nextStage) {
    adminApi('/api/commercial/clients/' + id, { method: 'PATCH', body: { pipeline_stage: nextStage } })
      .then(function (updated) {
        var list = state.data.clients.map(function (c) { return c.id === id ? Object.assign({}, c, updated) : c; });
        setData({ clients: list });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteService(id) {
    if (!confirm('¿Eliminar este paquete? Desaparece de servicios.html de inmediato. No se puede deshacer.')) return;
    adminApi('/api/commercial/services/' + id, { method: 'DELETE' })
      .then(function () {
        setData({ services: (state.data.services || []).filter(function (s) { return s.id !== id; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteFbAccount(id) {
    if (!confirm('¿Eliminar esta cuenta de Facebook? Ya no se usará al escanear.')) return;
    adminApi('/api/listening/competitors/accounts/' + id, { method: 'DELETE' })
      .then(function () {
        setData({ fbAccounts: (state.data.fbAccounts || []).filter(function (a) { return a.id !== id; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitToggleUser(id, active) {
    adminApi('/api/auth/users/' + id, { method: 'PATCH', body: { active: active } })
      .then(function (updated) {
        var list = state.data.users.map(function (u) { return u.id === id ? updated : u; });
        setData({ users: list });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitToggleSocial(id, isPublished) {
    adminApi('/api/admin/social/' + id, { method: 'PATCH', body: { is_published: isPublished } })
      .then(function (updated) {
        var list = state.data.socialPosts.map(function (p) { return p.id === id ? Object.assign({}, p, updated) : p; });
        setData({ socialPosts: list });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitRefetchSocial(id) {
    adminApi('/api/admin/social/' + id, { method: 'PATCH', body: { refetch: true } })
      .then(function (updated) {
        var list = state.data.socialPosts.map(function (p) { return p.id === id ? Object.assign({}, p, updated) : p; });
        setData({ socialPosts: list });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteIdea(id) {
    if (!confirm('¿Eliminar esta idea? No se puede deshacer.')) return;
    adminApi('/api/editorial/ideas/' + id, { method: 'DELETE' })
      .then(function () {
        setData({ ideas: (state.data.ideas || []).filter(function (i) { return i.id !== id; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteClient(id) {
    if (!confirm('¿Eliminar este cliente? No se puede deshacer.')) return;
    adminApi('/api/commercial/clients/' + id, { method: 'DELETE' })
      .then(function () {
        setData({ clients: (state.data.clients || []).filter(function (c) { return c.id !== id; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDistribute(channel, proposalId) {
    setState({ distBusy: channel + ':' + proposalId });
    adminApi('/api/distribution/' + channel, { method: 'POST', body: { proposal_id: proposalId } })
      .then(function (r) {
        // WhatsApp devuelve share_url: se abre para que el director comparta desde su cuenta.
        if (r && r.share_url) window.open(r.share_url, '_blank');
        setState({ distBusy: null, successMsg: 'Nota enviada a ' + channel + '.' });
      })
      .catch(function (err) { setState({ distBusy: null, errorMsg: err.message }); })
      .then(function () {
        // Éxito o error quedan en la bitácora — refrescar siempre.
        return adminApi('/api/distribution/log?limit=30');
      })
      .then(function (log) { setData({ distLog: log }); })
      .catch(function () { /* best-effort */ });
  }

  function submitMarkLead(id, status) {
    adminApi('/api/commercial/leads/' + id, { method: 'PATCH', body: { status: status } })
      .then(function (updated) {
        setData({ leads: (state.data.leads || []).map(function (l) { return l.id === id ? updated : l; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitConvertLead(id) {
    adminApi('/api/commercial/leads/' + id + '/convert', { method: 'POST' })
      .then(function (client) {
        // El pipeline se refresca al entrar (clients: null fuerza el fetch).
        state.data.clients = null;
        setData({ leads: (state.data.leads || []).map(function (l) { return l.id === id ? Object.assign({}, l, { status: 'contactado' }) : l; }) });
        setState({ successMsg: 'Cliente creado en el pipeline: ' + client.name });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteLead(id) {
    if (!confirm('¿Eliminar este lead? No se puede deshacer.')) return;
    adminApi('/api/commercial/leads/' + id, { method: 'DELETE' })
      .then(function () {
        setData({ leads: (state.data.leads || []).filter(function (l) { return l.id !== id; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitAnalyzeCompetitor(id) {
    adminApi('/api/listening/competitors/' + id, { method: 'PATCH', body: { analyzed: true } })
      .then(function (updated) {
        setData({ competitors: (state.data.competitors || []).map(function (p) { return p.id === id ? updated : p; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteCompetitor(id) {
    if (!confirm('¿Eliminar esta publicación de competencia? No se puede deshacer.')) return;
    adminApi('/api/listening/competitors/' + id, { method: 'DELETE' })
      .then(function () {
        setData({ competitors: (state.data.competitors || []).filter(function (p) { return p.id !== id; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitClearCompetitors() {
    var posts = state.data.competitors || [];
    if (!posts.length) return;
    if (!confirm('¿Eliminar las ' + posts.length + ' publicaciones de competencia? No se puede deshacer.')) return;
    Promise.all(posts.map(function (p) { return adminApi('/api/listening/competitors/' + p.id, { method: 'DELETE' }); }))
      .then(function () { setData({ competitors: [] }); })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  // Crea una idea en la bandeja a partir del post del competidor (reusa POST /ideas)
  // y lo marca analizado — no hace falta endpoint nuevo.
  function submitCompetitorToIdea(id) {
    var post = (state.data.competitors || []).filter(function (p) { return p.id === id; })[0];
    if (!post) return;
    var title = (post.source_account ? post.source_account + ': ' : '') + String(post.post_text || 'publicación de competencia').slice(0, 120);
    var description = (post.post_text || '') + (post.post_url ? '\n\nFuente: ' + post.post_url : '');
    adminApi('/api/editorial/ideas', { method: 'POST', body: { title: title, category: 'Local', description: description } })
      .then(function () {
        state.data.ideas = null; // la bandeja se refresca al entrar
        setState({ successMsg: 'Idea creada en la bandeja.' });
        return adminApi('/api/listening/competitors/' + id, { method: 'PATCH', body: { analyzed: true } });
      })
      .then(function (updated) {
        if (updated) setData({ competitors: (state.data.competitors || []).map(function (p) { return p.id === id ? updated : p; }) });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitApproveTopic(id) {
    adminApi('/api/listening/topics/' + id + '/approve', { method: 'PATCH' })
      .then(function () {
        var topics = (state.data.topics || []).map(function (t) { return t.id === id ? Object.assign({}, t, { status: 'Revisado' }) : t; });
        setData({ topics: topics });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteTopic(id) {
    if (!confirm('¿Eliminar este tema detectado? No se puede deshacer.')) return;
    adminApi('/api/listening/topics/' + id, { method: 'DELETE' })
      .then(function () {
        var topics = (state.data.topics || []).filter(function (t) { return t.id !== id; });
        setData({ topics: topics });
        if (state.selectedRadarId === id) setState({ selectedRadarId: null });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitClearTopics() {
    var topics = state.data.topics || [];
    if (!topics.length) return;
    if (!confirm('¿Eliminar los ' + topics.length + ' temas detectados? No se puede deshacer.')) return;
    Promise.all(topics.map(function (t) { return adminApi('/api/listening/topics/' + t.id, { method: 'DELETE' }); }))
      .then(function () { setData({ topics: [] }); setState({ selectedRadarId: null }); })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteBorrador(id) {
    if (!confirm('¿Eliminar este borrador? Se borra también su imagen generada. No se puede deshacer.')) return;
    adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
      .then(function () {
        setProposalsKey('borrador', (state.data.proposalsByKey.borrador || []).filter(function (p) { return p.id !== id; }));
        setState({ successMsg: 'Borrador eliminado.' });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteProposal(id) {
    if (!confirm('¿Eliminar esta propuesta rechazada? No se puede deshacer.')) return;
    adminApi('/api/editorial/proposals/' + id, { method: 'DELETE' })
      .then(function () {
        setProposalsKey('rechazada', (state.data.proposalsByKey.rechazada || []).filter(function (p) { return p.id !== id; }));
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  function submitDeleteSocial(id) {
    if (!confirm('¿Borrar esta producción? No se puede deshacer.')) return;
    adminApi('/api/admin/social/' + id, { method: 'DELETE' })
      .then(function () {
        var list = state.data.socialPosts.filter(function (p) { return p.id !== id; });
        setData({ socialPosts: list });
      })
      .catch(function (err) { setState({ errorMsg: err.message }); });
  }

  // ---------- forms ----------

  function handleSubmit(e) {
    var form = e.target.closest('[data-action]');
    if (!form) return;
    var action = form.getAttribute('data-action');
    if (action === 'submit-login') {
      e.preventDefault();
      login(form.querySelector('#pl-email').value.trim(), form.querySelector('#pl-pass').value);
    } else if (action === 'submit-idea') {
      e.preventDefault();
      var title = form.querySelector('#idea-title').value.trim();
      if (!title) return;
      adminApi('/api/editorial/ideas', { method: 'POST', body: {
        title: title, category: form.querySelector('#idea-cat').value, description: form.querySelector('#idea-desc').value.trim()
      } }).then(function (created) {
        form.reset();
        setState({ demoNote: 'idea' });
        setData({ ideas: (state.data.ideas || []).concat([Object.assign(created, { collaborator_name: state.user.name })]) });
      }).catch(function (err) { setState({ errorMsg: err.message }); });
    } else if (action === 'submit-new-user') {
      e.preventDefault();
      var nuPassword = form.querySelector('#nu-password').value;
      var nuId = state.editingUserId;
      var nuBody = {
        name: form.querySelector('#nu-name').value.trim(),
        email: form.querySelector('#nu-email').value.trim(),
        role: form.querySelector('#nu-role').value,
      };
      if (!nuId || nuPassword) nuBody.password = nuPassword;
      var nuReq = nuId
        ? adminApi('/api/auth/users/' + nuId, { method: 'PATCH', body: nuBody })
        : adminApi('/api/auth/users', { method: 'POST', body: nuBody });
      nuReq.then(function (saved) {
        setState({ newUserOpen: false, newUserError: null, editingUserId: null });
        var list = nuId
          ? (state.data.users || []).map(function (u) { return u.id === nuId ? saved : u; })
          : (state.data.users || []).concat([saved]);
        setData({ users: list });
      }).catch(function (err) {
        setState({ newUserError: (err.fields && Object.values(err.fields)[0]) || err.message });
      });
    } else if (action === 'submit-service') {
      e.preventDefault();
      var svBody = {
        name: form.querySelector('#sv-name').value.trim(),
        price_label: form.querySelector('#sv-price').value.trim(),
        description: form.querySelector('#sv-desc').value.trim(),
        cta_interest: form.querySelector('#sv-interest').value.trim() || 'Otro',
        features: form.querySelector('#sv-features').value.split('\n').map(function (f) { return f.trim(); }).filter(Boolean),
        sort_order: Number(form.querySelector('#sv-order').value) || 0,
        active: form.querySelector('#sv-active').checked,
      };
      var svId = state.editingServiceId;
      var req = svId
        ? adminApi('/api/commercial/services/' + svId, { method: 'PATCH', body: svBody })
        : adminApi('/api/commercial/services', { method: 'POST', body: svBody });
      req.then(function (saved) {
        setState({ serviceFormOpen: false, serviceFormError: null, editingServiceId: null });
        var list = svId
          ? (state.data.services || []).map(function (s) { return s.id === svId ? saved : s; })
          : (state.data.services || []).concat([saved]);
        setData({ services: list });
      }).catch(function (err) {
        setState({ serviceFormError: (err.fields && Object.values(err.fields)[0]) || err.message });
      });
    } else if (action === 'submit-fb-account') {
      e.preventDefault();
      var fbaBody = {
        label: form.querySelector('#fba-label').value.trim(),
        handle_or_url: form.querySelector('#fba-handle').value.trim(),
        active: form.querySelector('#fba-active').checked,
      };
      var fbaId = state.editingFbAccountId;
      var fbaReq = fbaId
        ? adminApi('/api/listening/competitors/accounts/' + fbaId, { method: 'PATCH', body: fbaBody })
        : adminApi('/api/listening/competitors/accounts', { method: 'POST', body: fbaBody });
      fbaReq.then(function (saved) {
        setState({ fbAccountFormOpen: false, fbAccountFormError: null, editingFbAccountId: null });
        var list = fbaId
          ? (state.data.fbAccounts || []).map(function (a) { return a.id === fbaId ? saved : a; })
          : (state.data.fbAccounts || []).concat([saved]);
        setData({ fbAccounts: list });
      }).catch(function (err) {
        setState({ fbAccountFormError: (err.fields && Object.values(err.fields)[0]) || err.message });
      });
    } else if (action === 'submit-newsletter-settings') {
      e.preventDefault();
      adminApi('/api/newsletter/settings', { method: 'PATCH', body: {
        enabled: form.querySelector('#nls-enabled').checked,
        send_hour: Number(form.querySelector('#nls-hour').value),
        send_minute: Number(form.querySelector('#nls-minute').value),
      } }).then(function (updated) {
        setState({ errorMsg: null });
        setData({ newsletterSettings: updated });
      }).catch(function (err) {
        setState({ errorMsg: err.message });
      });
    } else if (action === 'submit-site-metrics') {
      e.preventDefault();
      adminApi('/api/admin/site-metrics', { method: 'PATCH', body: {
        monthly_reach_label: form.querySelector('#sm-reach').value.trim(),
        municipalities_count: Number(form.querySelector('#sm-municipios').value),
        tercer_tiempo_listeners_label: form.querySelector('#sm-listeners').value.trim(),
        audience_age_18_24_pct: Number(form.querySelector('#sm-age-1').value),
        audience_age_25_44_pct: Number(form.querySelector('#sm-age-2').value),
        audience_age_45_plus_pct: Number(form.querySelector('#sm-age-3').value),
      } }).then(function (updated) {
        setState({ errorMsg: null, successMsg: 'Métricas actualizadas.' });
        setData({ siteMetrics: updated });
      }).catch(function (err) {
        setState({ errorMsg: err.message });
      });
    } else if (action === 'submit-newsletter-event') {
      e.preventDefault();
      var evDate = form.querySelector('#ne-date').value;
      var evTitle = form.querySelector('#ne-title').value.trim();
      if (!evDate || !evTitle) return;
      adminApi('/api/newsletter/events', { method: 'POST', body: { event_date: evDate, title: evTitle } })
        .then(function (created) {
          form.reset();
          setData({ newsletterEvents: (state.data.newsletterEvents || []).concat([created]) });
        })
        .catch(function (err) { setState({ errorMsg: err.message }); });
    } else if (action === 'submit-new-client') {
      e.preventDefault();
      var name = form.querySelector('#nc-name').value.trim();
      if (!name) return;
      adminApi('/api/commercial/clients', { method: 'POST', body: {
        name: name,
        business_name: form.querySelector('#nc-business').value.trim(),
        package: form.querySelector('#nc-package').value,
        phone: form.querySelector('#nc-phone').value.trim(),
        email: form.querySelector('#nc-email').value.trim(),
      } }).then(function (created) {
        setState({ clientFormOpen: false, clientFormError: null });
        setData({ clients: (state.data.clients || []).concat([created]) });
      }).catch(function (err) {
        setState({ clientFormError: (err.fields && Object.values(err.fields)[0]) || err.message });
      });
    } else if (action === 'submit-social') {
      e.preventDefault();
      var url = form.querySelector('#social-url').value.trim();
      var pos = parseInt(form.querySelector('#social-position').value, 10);
      if (!url) return;
      setState({ socialBusy: true, socialFormError: null });
      adminApi('/api/admin/social', { method: 'POST', body: {
        external_url: url,
        position: isNaN(pos) ? 0 : pos,
      } }).then(function (created) {
        setState({ socialFormOpen: false, socialBusy: false, socialFormError: null });
        setData({ socialPosts: (state.data.socialPosts || []).concat([created]) });
      }).catch(function (err) {
        setState({ socialBusy: false, socialFormError: (err.fields && err.fields.external_url) || err.message });
      });
    }
  }

  function handleChange(e) {
    if (e.target.getAttribute && e.target.getAttribute('data-action') === 'move-idea') {
      var id = Number(e.target.getAttribute('data-id'));
      adminApi('/api/editorial/ideas/' + id, { method: 'PATCH', body: { column_status: e.target.value } })
        .then(function (updated) {
          var list = state.data.ideas.map(function (i) { return i.id === id ? Object.assign({}, i, updated) : i; });
          setData({ ideas: list });
        })
        .catch(function (err) { setState({ errorMsg: err.message }); });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var app = document.getElementById('app');
    app.addEventListener('click', handleClick);
    app.addEventListener('submit', handleSubmit);
    app.addEventListener('change', handleChange);
    tryResumeSession();
  });
})();
