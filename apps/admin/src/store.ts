// CREA Panel Admin — estado central, API y carga de datos.
// Base compartida por todos los módulos de feature (sin bundler adicional: Vite + TS).

export interface User {
  id: number;
  name: string;
  role: string;
}

export interface AdminData {
  ideas: any[] | null;
  proposalsByKey: Record<string, any[]>;
  clients: any[] | null;
  topics: any[] | null;
  users: any[] | null;
  metrics: any | null;
  socialPosts: any[] | null;
  activity: any[] | null;
  integrations: any[] | null;
  pipeline: any | null;
  notifications: any[] | null;
  newsletterSettings: any | null;
  newsletterEvents: any[] | null;
  services: any[] | null;
  roleModules: any | null;
  leads: any[] | null;
  distLog: any[] | null;
  distChannels: any[] | null;
  competitors: any[] | null;
  siteMetrics: any | null;
  fbAccounts: any[] | null;
}

export type Screen =
  | 'login' | 'dashboard' | 'ideas' | 'editor' | 'aprobacion'
  | 'comercial' | 'leads' | 'metricas' | 'radar' | 'propuestas'
  | 'producciones' | 'publicadas' | 'hermes' | 'pipeline'
  | 'denegado' | 'configuracion';

export interface EditorDraft {
  title: string;
  body: string;
  section: string;
  dek: string;
  slug: string;
  cover_image_url: string;
  author_name: string;
  is_sponsored: boolean;
  sponsor_name: string;
  image_prompt: string;
}

export interface State {
  token: string | null;
  user: User | null;
  allowedModules: string[];
  screen: Screen;
  loginError: string | null;
  data: AdminData;
  distBusy: string | null;
  radarSource: string;
  radarStatus: string;
  radarBusy: boolean;
  radarTab: 'temas' | 'competencia';
  competitorsBusy: boolean;
  leadsStatus: string;
  propuestaRejecting: number | null;
  editorProposalId: number | null;
  editorDraft: EditorDraft | null;
  generatingProposal: boolean;
  generatingDraft: boolean;
  qaResult: any | null;
  qaBusy: boolean;
  notaPreviewHtml: string | null;
  editorImagePrompt: string | null;
  generatingImage: boolean;
  transparency: Record<string, unknown>;
  comentarioPieceId: number | null;
  comentarioText: string;
  pickerPreview: any | null;
  selectedRadarId: number | null;
  configTab: string;
  showNotifications: boolean;
  newUserOpen: boolean;
  newUserError: string | null;
  editingUserId: number | null;
  serviceFormOpen: boolean;
  serviceFormError: string | null;
  editingServiceId: number | null;
  fbAccountFormOpen: boolean;
  fbAccountFormError: string | null;
  editingFbAccountId: number | null;
  socialFormOpen: boolean;
  socialFormError: string | null;
  socialBusy: boolean;
  clientFormOpen: boolean;
  clientFormError: string | null;
  newsletterContent: any | null;
  newsletterBusy: boolean;
  newsletterSending: boolean;
  newsletterPreview: any | null;
  newsletterSubscriberCount: number | null;
  newsletterAudioBusy: boolean;
  newsletterAudioUrl: string | null;
  demoNote: string | null;
  errorMsg: string | null;
  successMsg: string | null;
  soundMuted: boolean;
  deniedTarget?: string | null;
  mobileNavOpen?: boolean;
}

export const CREA_API_BASE = (function () {
  // Servido en el mismo origen que el API (Docker, prod) → llamadas relativas,
  // que es lo único compatible con CSP connect-src 'self'. Solo bajo `vite dev`
  // (puerto propio, API real en :3000) hace falta la base absoluta del meta tag.
  if (location.port !== '4001') return '';
  const meta = document.querySelector('meta[name="crea-api-base"]');
  return (meta && meta.getAttribute('content')) || 'http://localhost:3000';
})();

export const state: State = {
  token: null, user: null, allowedModules: [],
  screen: 'login', loginError: null,
  data: {
    ideas: null, proposalsByKey: {}, clients: null, topics: null, users: null, metrics: null,
    socialPosts: null, activity: null, integrations: null, pipeline: null, notifications: null,
    newsletterSettings: null, newsletterEvents: null, services: null, roleModules: null, leads: null,
    distLog: null, distChannels: null, competitors: null, siteMetrics: null, fbAccounts: null,
  },
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
  demoNote: null, errorMsg: null, successMsg: null, soundMuted: false,
};
state.soundMuted = isSoundMuted();

// render() se registra desde router.ts (evita import circular: store no importa vistas).
let renderFn: () => void = function () {};
export function setRender(fn: () => void) { renderFn = fn; }

export interface ApiOpts {
  method?: string;
  body?: unknown;
}

export interface ApiError extends Error {
  status?: number;
  fields?: unknown;
}

export function adminApi<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  return fetch(CREA_API_BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then((res) => {
    if (res.status === 204) return null as T;
    return res.json().catch(() => null).then((json) => {
      if (!res.ok) {
        const err = new Error((json && json.error) || 'API respondió ' + res.status) as ApiError;
        err.status = res.status;
        err.fields = json && json.fields;
        throw err;
      }
      return json as T;
    });
  });
}

export function adminApiBlob(path: string, opts: ApiOpts = {}): Promise<Blob> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  return fetch(CREA_API_BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then((res) => {
    if (!res.ok) {
      return res.json().catch(() => null).then((json) => {
        throw new Error((json && json.error) || 'API respondió ' + res.status);
      });
    }
    return res.blob();
  });
}

// ---------- toasts: sonido + auto-dismiss ----------
let errorToastTimer: ReturnType<typeof setTimeout> | null = null;
let successToastTimer: ReturnType<typeof setTimeout> | null = null;
let audioCtx: AudioContext | null = null;

export function isSoundMuted(): boolean {
  try { return localStorage.getItem('crea-admin-sound-muted') === '1'; } catch { return false; }
}

export function playToastSound(kind: 'error' | 'success') {
  if (isSoundMuted()) return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const freqs = kind === 'error' ? [392] : [523.25, 659.25];
    freqs.forEach((freq, i) => {
      const t0 = audioCtx!.currentTime + i * 0.09;
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    });
  } catch { /* autoplay bloqueado o Web Audio no soportado */ }
}

export function setState(patch: Partial<State>) {
  for (const k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      (state as any)[k] = (patch as any)[k];
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'errorMsg')) {
    if (errorToastTimer) { clearTimeout(errorToastTimer); errorToastTimer = null; }
    if (patch.errorMsg) {
      playToastSound('error');
      errorToastTimer = setTimeout(() => { state.errorMsg = null; renderFn(); }, 6000);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'successMsg')) {
    if (successToastTimer) { clearTimeout(successToastTimer); successToastTimer = null; }
    if (patch.successMsg) {
      playToastSound('success');
      successToastTimer = setTimeout(() => { state.successMsg = null; renderFn(); }, 4000);
    }
  }
  renderFn();
}

export function setData(patch: Partial<AdminData>) {
  state.data = Object.assign({}, state.data, patch);
  renderFn();
}

export function loadProposals(key: string, query: string) {
  if (state.data.proposalsByKey[key]) return;
  adminApi(`/api/editorial/proposals?${query}`)
    .then((rows) => {
      const byKey = Object.assign({}, state.data.proposalsByKey);
      byKey[key] = rows as any[];
      setData({ proposalsByKey: byKey });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message }); });
}

export function invalidateProposals() {
  state.data.proposalsByKey = {};
}

export function loadScreenData(screen: Screen, extra?: number | null) {
  if (screen === 'dashboard') {
    loadProposals('en_revision', 'status=en_revision');
    if (state.user!.role === 'produccion') loadProposals('mine', 'author_id=' + state.user!.id);
    if (!state.data.ideas) adminApi('/api/editorial/ideas').then((r) => { setData({ ideas: r as any[] }); });
  } else if (screen === 'ideas') {
    adminApi('/api/editorial/ideas').then((r) => { setData({ ideas: r as any[] }); });
  } else if (screen === 'editor') {
    const id = extra != null ? extra : state.editorProposalId;
    loadProposals('borrador', 'status=borrador');
    loadProposals('en_revision', 'status=en_revision');
    if (id) {
      adminApi<any>(`/api/editorial/proposals/${id}`).then((p) => {
        setState({
          editorProposalId: id, notaPreviewHtml: null, editorImagePrompt: null, editorDraft: {
            title: p.title || '', body: p.body || '', section: p.section || '', dek: p.dek || '', slug: p.slug || '',
            cover_image_url: p.cover_image_url || '', author_name: p.author_name || state.user!.name,
            is_sponsored: Boolean(p.is_sponsored), sponsor_name: p.sponsor_name || '',
            image_prompt: p.image_prompt || '',
          },
        });
      });
    }
  } else if (screen === 'aprobacion') {
    loadProposals('en_revision', 'status=en_revision');
    loadProposals('published', 'status=published');
    adminApi('/api/distribution/channels').then((r) => { setData({ distChannels: r as any[] }); }).catch(() => { /* best-effort */ });
    adminApi('/api/distribution/log?limit=30').then((r) => { setData({ distLog: r as any[] }); }).catch(() => { /* best-effort */ });
  } else if (screen === 'comercial') {
    adminApi('/api/commercial/clients').then((r) => { setData({ clients: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  } else if (screen === 'leads') {
    adminApi('/api/commercial/leads').then((r) => { setData({ leads: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  } else if (screen === 'metricas') {
    adminApi('/api/editorial/metrics').then((r) => { setData({ metrics: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  } else if (screen === 'radar') {
    adminApi('/api/listening/topics').then((r) => { setData({ topics: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    if (state.radarTab === 'competencia' && !state.data.competitors) {
      adminApi('/api/listening/competitors').then((r) => { setData({ competitors: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    }
  } else if (screen === 'propuestas') {
    loadProposals('propuesta', 'status=propuesta');
    loadProposals('rechazada', 'status=rechazada');
  } else if (screen === 'producciones') {
    adminApi('/api/admin/social').then((r) => { setData({ socialPosts: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  } else if (screen === 'publicadas') {
    loadProposals('published', 'status=published');
  } else if (screen === 'configuracion') {
    if (state.configTab === 'usuarios') adminApi('/api/auth/users').then((r) => { setData({ users: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    if (state.configTab === 'permisos' && !state.data.roleModules) adminApi('/api/auth/roles').then((r) => { setData({ roleModules: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    if (state.configTab === 'integraciones') adminApi('/api/admin/integrations').then((r) => { setData({ integrations: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    if (state.configTab === 'newsletter') {
      adminApi('/api/newsletter/settings').then((r) => { setData({ newsletterSettings: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
      adminApi('/api/newsletter/events').then((r) => { setData({ newsletterEvents: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    }
    if (state.configTab === 'servicios') adminApi('/api/commercial/services').then((r) => { setData({ services: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    if (state.configTab === 'cuentas-fb') adminApi('/api/listening/competitors/accounts').then((r) => { setData({ fbAccounts: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    if (state.configTab === 'metricas-sitio') adminApi('/api/admin/site-metrics').then((r) => { setData({ siteMetrics: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  } else if (screen === 'hermes') {
    adminApi('/api/admin/activity?limit=20').then((r) => { setData({ activity: r as any[] }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
  } else if (screen === 'pipeline') {
    adminApi('/api/editorial/pipeline').then((r) => { setData({ pipeline: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message }); });
    adminApi<{ count: number }>('/api/newsletter/subscribers/count').then((r) => { setState({ newsletterSubscriberCount: r.count }); }).catch(() => { /* best-effort */ });
    if (!state.newsletterContent) {
      adminApi('/api/newsletter/pending').then((r) => { if (r) setState({ newsletterContent: r }); }).catch(() => { /* best-effort */ });
    }
  }
}

// ---------- helpers de estado compartidos por acciones ----------

export function mergeKey<T extends Record<string, any>>(obj: T, key: string, value: any): T {
  return { ...obj, [key]: value };
}

export function setProposalsKey(key: string, list: any[]) {
  const byKey = Object.assign({}, state.data.proposalsByKey);
  byKey[key] = list;
  setData({ proposalsByKey: byKey });
}
