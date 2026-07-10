// CREA Panel Admin — estado central, API y carga de datos.
// Base compartida por todos los módulos de feature (sin bundler: ES modules nativos).

export var CREA_API_BASE = (function () {
  var meta = document.querySelector('meta[name="crea-api-base"]');
  var base = (meta && meta.content) || 'http://localhost:3000';
  if (base.indexOf('localhost') !== -1 && location.hostname !== 'localhost') return '';
  return base;
})();

export var state = {
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
  editorImagePrompt: null, generatingImage: false,
  transparency: {}, comentarioPieceId: null, comentarioText: '',
  pickerPreview: null,
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

// render() se registra desde router.js (lo evita circular: store no importa vistas).
var renderFn = function () {};
export function setRender(fn) { renderFn = fn; }

export function adminApi(path, opts) {
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

export function adminApiBlob(path, opts) {
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

// ---------- toasts: sonido + auto-dismiss ----------
var errorToastTimer = null;
var successToastTimer = null;
var audioCtx = null;

export function isSoundMuted() {
  try { return localStorage.getItem('crea-admin-sound-muted') === '1'; } catch (e) { return false; }
}

export function playToastSound(kind) {
  if (isSoundMuted()) return;
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var freqs = kind === 'error' ? [392] : [523.25, 659.25];
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

export function setState(patch) {
  var k;
  for (k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) state[k] = patch[k]; }
  if (Object.prototype.hasOwnProperty.call(patch, 'errorMsg')) {
    if (errorToastTimer) { clearTimeout(errorToastTimer); errorToastTimer = null; }
    if (patch.errorMsg) {
      playToastSound('error');
      errorToastTimer = setTimeout(function () { state.errorMsg = null; renderFn(); }, 6000);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'successMsg')) {
    if (successToastTimer) { clearTimeout(successToastTimer); successToastTimer = null; }
    if (patch.successMsg) {
      playToastSound('success');
      successToastTimer = setTimeout(function () { state.successMsg = null; renderFn(); }, 4000);
    }
  }
  renderFn();
}

export function setData(patch) {
  state.data = Object.assign({}, state.data, patch);
  renderFn();
}

export function loadProposals(key, query) {
  if (state.data.proposalsByKey[key]) return;
  adminApi('/api/editorial/proposals?' + query)
    .then(function (rows) {
      var byKey = Object.assign({}, state.data.proposalsByKey);
      byKey[key] = rows;
      setData({ proposalsByKey: byKey });
    })
    .catch(function (err) { setState({ errorMsg: err.message }); });
}

export function invalidateProposals() {
  state.data.proposalsByKey = {};
}

export function loadScreenData(screen, extra) {
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
  } else if (screen === 'publicadas') {
    loadProposals('published', 'status=published');
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

// ---------- helpers de estado compartidos por acciones ----------

export function mergeKey(obj, key, value) {
  var copy = {}, k;
  for (k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) copy[k] = obj[k]; }
  copy[key] = value;
  return copy;
}

export function setProposalsKey(key, list) {
  var byKey = Object.assign({}, state.data.proposalsByKey);
  byKey[key] = list;
  setData({ proposalsByKey: byKey });
}
