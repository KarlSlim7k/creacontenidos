// CREA Panel Admin — estado central, API y carga de datos.
// Base compartida por todos los módulos de feature (sin bundler adicional: Vite + TS).

export interface User {
  id: number;
  name: string;
  role: string;
}

export interface Idea {
  id: number;
  title: string;
  category: string | null;
  description: string | null;
  score: string | null;
  column_status: 'nueva' | 'en_analisis' | 'aprobada' | 'descartada';
  collaborator_id: number | null;
  collaborator_name: string | null;
}

export interface Proposal {
  id: number;
  topic_id: number | null;
  format: string;
  title: string | null;
  body: string | null;
  dek: string | null;
  section: string | null;
  slug: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  is_sponsored: boolean;
  sponsor_name: string | null;
  image_prompt: string | null;
  angulo: string | null;
  sensibilidad: string | null;
  origin: string | null;
  status: string;
  author_id: number | null;
  review_comment: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  view_count: number;
}

export interface EditorialMetrics {
  piecesPublished: number;
  weeklyGoal: number;
  weeklyPieces: { week: string; count: number }[];
  socialChannels: unknown[];
  totalReach: null;
  totalPieces: number;
  approvalRate: number | null;
  avgDraftDays: number | null;
  topSections: { section: string; count: number }[];
  authors: { name: string; published: number }[];
}

export interface PipelineStep {
  label: string;
  status: 'completado' | 'pendiente' | 'esperando';
  at: string | null;
}

export interface Client {
  id: number;
  name: string;
  business_name: string | null;
  package: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  pipeline_stage: 'identificado' | 'contactado' | 'propuesta_enviada' | 'cerrado';
  interest: string | null;
  estimated_value: string | null;
  last_contact_at: string | null;
  owner_id: number | null;
  website_url: string | null;
  sponsor_copy: string | null;
  last_sponsored_at: string | null;
}

export interface Lead {
  id: number;
  name: string;
  email: string;
  company: string | null;
  service_interest: string | null;
  message: string;
  source_page: string | null;
  status: 'nuevo' | 'contactado' | 'descartado';
  notes: string | null;
  created_at: string;
}

export interface Service {
  id: number;
  name: string;
  price_label: string;
  description: string;
  features: string[];
  cta_interest: string;
  sort_order: number;
  active: boolean;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
}

export type RoleModules = Record<string, string[]>;

export interface SocialPost {
  id: number;
  network: 'tiktok' | 'youtube' | 'facebook' | 'instagram';
  external_url: string;
  title: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  is_published: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  fetched_at: string | null;
  created_by_name: string | null;
}

export interface ActivityEntry {
  id: number;
  action: string;
  detail: string | null;
  user_id: number | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
}

export interface Integration {
  name: string;
  desc: string;
  connected: boolean;
}

export interface SiteMetrics {
  id: number;
  monthly_reach_label: string;
  municipalities_count: number;
  tercer_tiempo_listeners_label: string;
  audience_age_18_24_pct: number;
  audience_age_25_44_pct: number;
  audience_age_45_plus_pct: number;
  updated_at: string;
}

/** Evidencia de ficha RADAR (JSONB evidence[]). */
export interface TopicEvidence {
  label: string;
  url?: string | null;
  kind?: string | null;
  supports?: string | null;
  reliable?: boolean | null;
}

/** verified|checking|signal|risk — null = sin evaluar (topics pre-Fase 2). */
export type VerificationStatus = 'verified' | 'checking' | 'signal' | 'risk';

export interface Topic {
  id: number;
  title: string;
  source: string | null;
  mentions: number;
  sentiment: string | null;
  status: string;
  antecedentes: string | null;
  actores: string | null;
  angulos: string | null;
  audiencia: string | null;
  confidence: number | null;
  verification_status: VerificationStatus | null;
  known_facts: string | null;
  unknown_facts: string | null;
  evidence: TopicEvidence[] | null;
  risk_flags: Array<string | { code?: string; message?: string }> | null;
  editorial_decision: string | null;
  source_count: number | null;
  detected_at: string;
}

export interface CompetitorPost {
  id: number;
  source_platform: string;
  source_account: string | null;
  post_url: string | null;
  post_text: string | null;
  post_date: string | null;
  reactions: number;
  comments: number;
  shares: number;
  views: number;
  media_type: string | null;
  scraped_at: string;
  analyzed: boolean;
}

export interface FbAccount {
  id: number;
  label: string;
  handle_or_url: string;
  active: boolean;
  created_at: string;
}

/** Fuente de la lista editorial RADAR (radar_sources). */
export interface RadarSource {
  id: number;
  domain: string;
  label: string;
  trust: 'high' | 'medium' | 'low';
  active: boolean;
  notes: string | null;
  created_at: string;
}

/** GET /api/listening/topics/summary — totales RADAR (independiente del filtro/página activa). */
export interface TopicSummary {
  total: number;
  by_verification: Record<string, number>;
  sources: string[];
}

/** GET /api/listening/radar-stats — calibración Fase 6. */
export interface RadarStats {
  days: number;
  topics: {
    total: number;
    by_status: Record<string, { count: number; pct: number; avg_confidence: number | null }>;
  };
  proposals: {
    generated: number;
    by_verification_status: Record<string, number>;
    blocked_risk: number;
    forced_from_risk: number;
  };
  detection: {
    runs: number;
    inserted: number;
    upgraded: number;
    skipped_similar: number;
  };
  sources: { active: number; by_trust: Record<string, number> };
  hints: string[];
  knobs?: Record<string, string | number>;
}

export interface DistChannel {
  channel: 'facebook' | 'whatsapp' | 'wordpress';
  label: string;
  connected: boolean;
}

export interface DistLogEntry {
  id: number;
  proposal_id: number | null;
  platform: 'facebook' | 'whatsapp' | 'wordpress';
  published_at: string | null;
  url: string | null;
  status: 'ok' | 'error';
  detail: string | null;
  title: string | null;
  created_by_name: string | null;
}

export interface NewsletterSettings {
  enabled: boolean;
  send_hour: number;
  send_minute: number;
}

export interface NewsletterEvent {
  id: number;
  event_date: string;
  title: string;
}

export interface NewsletterContent {
  weekday: string;
  date: string;
  clima: string;
  notaDelDia: { titulo: string; cuerpo: string };
  enBreve: string[];
  datoDelDia: string;
  agenda: string | null;
  patrocinador: { nombre: string; copy: string; link: string } | null;
  topicsUsed: number;
}

export interface AdminData {
  ideas: Idea[] | null;
  proposalsByKey: Record<string, Proposal[]>;
  clients: Client[] | null;
  topics: Topic[] | null;
  users: AdminUser[] | null;
  metrics: EditorialMetrics | null;
  socialPosts: SocialPost[] | null;
  activity: ActivityEntry[] | null;
  integrations: Integration[] | null;
  pipeline: PipelineStep[] | null;
  notifications: ActivityEntry[] | null;
  newsletterSettings: NewsletterSettings | null;
  newsletterEvents: NewsletterEvent[] | null;
  services: Service[] | null;
  roleModules: RoleModules | null;
  leads: Lead[] | null;
  distLog: DistLogEntry[] | null;
  distChannels: DistChannel[] | null;
  competitors: CompetitorPost[] | null;
  radarSources: RadarSource[] | null;
  radarStats: RadarStats | null;
  topicSummary: TopicSummary | null;
  siteMetrics: SiteMetrics | null;
  fbAccounts: FbAccount[] | null;
}

export type Screen =
  | 'login' | 'dashboard' | 'ideas' | 'editor' | 'aprobacion'
  | 'comercial' | 'leads' | 'metricas' | 'radar' | 'propuestas'
  | 'producciones' | 'publicadas' | 'hermes' | 'pipeline'
  | 'denegado' | 'configuracion';

export interface QaResult {
  score: number;
  summary?: string;
  issues: { type: string; line?: number; text: string }[];
}

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
  /** Filtro de verification_status: Todos | verified | checking | signal | risk | none */
  radarVerification: string;
  radarBusy: boolean;
  radarTab: 'temas' | 'competencia' | 'fuentes';
  /** Ventana de radar-stats: 7 | 30 */
  radarStatsDays: number;
  /** Error del fetch de radar-stats (se muestra inline en el bloque Calibración). */
  radarStatsError: string | null;
  /** true si la última página de topics vino llena → puede haber más en el servidor. */
  radarTopicsHasMore: boolean;
  competitorsBusy: boolean;
  leadsStatus: string;
  propuestaRejecting: number | null;
  editorProposalId: number | null;
  editorDraft: EditorDraft | null;
  generatingProposal: boolean;
  generatingDraft: boolean;
  qaResult: QaResult | null;
  qaBusy: boolean;
  notaPreviewHtml: string | null;
  editorImagePrompt: string | null;
  generatingImage: boolean;
  transparency: Record<string, unknown>;
  comentarioPieceId: number | null;
  comentarioText: string;
  pickerPreview: Proposal | null;
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
  newsletterContent: NewsletterContent | null;
  newsletterBusy: boolean;
  newsletterSending: boolean;
  newsletterPreview: string | null;
  newsletterSubscriberCount: number | null;
  newsletterAudioBusy: boolean;
  newsletterAudioUrl: string | null;
  demoNote: string | null;
  errorMsg: string | null;
  // Distinto de errorMsg: ese es un toast que se auto-oculta a los 6s (store.ts
  // setState). dataError persiste hasta la próxima navegación de pantalla —
  // sin esto, si el fetch que llena los datos de la pantalla falla, el toast
  // desaparece pero la pantalla se queda en "Cargando…" para siempre.
  dataError: string | null;
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
    distLog: null, distChannels: null, competitors: null, radarSources: null, radarStats: null,
    topicSummary: null, siteMetrics: null, fbAccounts: null,
  },
  distBusy: null,
  radarSource: 'Todas', radarStatus: 'Todos', radarVerification: 'Todos', radarBusy: false,
  radarTab: 'temas', competitorsBusy: false, radarStatsDays: 30,
  radarStatsError: null, radarTopicsHasMore: false,
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
  demoNote: null, errorMsg: null, dataError: null, successMsg: null, soundMuted: false,
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
  adminApi<Proposal[]>(`/api/editorial/proposals?${query}`)
    .then((rows) => {
      const byKey = Object.assign({}, state.data.proposalsByKey);
      byKey[key] = rows;
      setData({ proposalsByKey: byKey });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
}

export function invalidateProposals() {
  state.data.proposalsByKey = {};
}

// ---------- RADAR: carga server-side (filtros + paginación viven en la API) ----------

export const RADAR_PAGE = 50;

// Pide RADAR_PAGE+1 filas: si llegan PAGE+1 hay más páginas — evita un COUNT
// extra en el API solo para mostrar "Cargar más".
export function loadRadarTopics(reset: boolean) {
  const offset = reset ? 0 : (state.data.topics || []).length;
  const p = new URLSearchParams();
  if (state.radarSource !== 'Todas') p.set('source', state.radarSource);
  if (state.radarStatus !== 'Todos') p.set('status', state.radarStatus);
  if (state.radarVerification !== 'Todos') p.set('verification_status', state.radarVerification);
  p.set('limit', String(RADAR_PAGE + 1));
  if (offset > 0) p.set('offset', String(offset));
  adminApi<Topic[]>('/api/listening/topics?' + p.toString())
    .then((rows) => {
      const hasMore = rows.length > RADAR_PAGE;
      const page = hasMore ? rows.slice(0, RADAR_PAGE) : rows;
      // Dedupe por id: un topic detectado entre página y página desplazaría el offset.
      const prev = reset ? [] : (state.data.topics || []);
      const seen = new Set(prev.map((t) => t.id));
      setState({
        data: Object.assign({}, state.data, { topics: prev.concat(page.filter((t) => !seen.has(t.id))) }),
        radarTopicsHasMore: hasMore,
      });
    })
    .catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
}

// Best-effort: si falla, las tarjetas muestran "—" (la lista sí reporta error).
export function loadRadarSummary() {
  adminApi<TopicSummary>('/api/listening/topics/summary')
    .then((r) => { setData({ topicSummary: r }); })
    .catch(() => { /* tarjetas en guion */ });
}

// Guard contra respuestas fuera de orden al alternar 7d/30d rápido.
export function loadRadarStats() {
  const days = state.radarStatsDays || 30;
  adminApi<RadarStats>('/api/listening/radar-stats?days=' + days)
    .then((r) => {
      if ((state.radarStatsDays || 30) !== days) return;
      setState({ radarStatsError: null, data: Object.assign({}, state.data, { radarStats: r }) });
    })
    .catch((err: ApiError) => {
      if ((state.radarStatsDays || 30) !== days) return;
      setState({ radarStatsError: err.message });
    });
}

export function loadScreenData(screen: Screen, extra?: number | null) {
  state.dataError = null;
  if (screen === 'dashboard') {
    loadProposals('en_revision', 'status=en_revision');
    if (state.user!.role === 'produccion') loadProposals('mine', 'author_id=' + state.user!.id);
    if (!state.data.ideas) adminApi<Idea[]>('/api/editorial/ideas').then((r) => { setData({ ideas: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
  } else if (screen === 'ideas') {
    adminApi<Idea[]>('/api/editorial/ideas').then((r) => { setData({ ideas: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
  } else if (screen === 'editor') {
    const id = extra != null ? extra : state.editorProposalId;
    loadProposals('borrador', 'status=borrador');
    loadProposals('en_revision', 'status=en_revision');
    if (id) {
      adminApi<Proposal>(`/api/editorial/proposals/${id}`).then((p) => {
        setState({
          editorProposalId: id, notaPreviewHtml: null, editorImagePrompt: null, editorDraft: {
            title: p.title || '', body: p.body || '', section: p.section || '', dek: p.dek || '', slug: p.slug || '',
            cover_image_url: p.cover_image_url || '', author_name: p.author_name || state.user!.name,
            is_sponsored: Boolean(p.is_sponsored), sponsor_name: p.sponsor_name || '',
            image_prompt: p.image_prompt || '',
          },
        });
      }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
    }
  } else if (screen === 'aprobacion') {
    loadProposals('en_revision', 'status=en_revision');
    loadProposals('published', 'status=published');
    adminApi<DistChannel[]>('/api/distribution/channels').then((r) => { setData({ distChannels: r }); }).catch(() => { /* best-effort */ });
    adminApi<DistLogEntry[]>('/api/distribution/log?limit=30').then((r) => { setData({ distLog: r }); }).catch(() => { /* best-effort */ });
  } else if (screen === 'comercial') {
    adminApi<Client[]>('/api/commercial/clients').then((r) => { setData({ clients: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
  } else if (screen === 'leads') {
    adminApi<Lead[]>('/api/commercial/leads').then((r) => { setData({ leads: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
  } else if (screen === 'metricas') {
    adminApi<EditorialMetrics>('/api/editorial/metrics').then((r) => { setData({ metrics: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
  } else if (screen === 'radar') {
    // Carga perezosa por tab con caché: cambiar de tab no refetchea lo que ya
    // está cargado (los datos se refrescan con el botón ↻ o tras mutaciones).
    if (state.radarTab === 'competencia') {
      if (!state.data.competitors) {
        adminApi<CompetitorPost[]>('/api/listening/competitors').then((r) => { setData({ competitors: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
      }
    } else if (state.radarTab === 'fuentes') {
      if (!state.data.radarSources) {
        adminApi<RadarSource[]>('/api/listening/radar-sources').then((r) => { setData({ radarSources: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
      }
    } else {
      if (!state.data.topics) loadRadarTopics(true);
      if (!state.data.topicSummary) loadRadarSummary();
      if (!state.data.radarStats) loadRadarStats();
    }
  } else if (screen === 'propuestas') {
    loadProposals('propuesta', 'status=propuesta');
    loadProposals('rechazada', 'status=rechazada');
  } else if (screen === 'producciones') {
    adminApi<SocialPost[]>('/api/admin/social').then((r) => { setData({ socialPosts: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
  } else if (screen === 'publicadas') {
    loadProposals('published', 'status=published');
  } else if (screen === 'configuracion') {
    if (state.configTab === 'usuarios') adminApi<AdminUser[]>('/api/auth/users').then((r) => { setData({ users: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
    if (state.configTab === 'permisos' && !state.data.roleModules) adminApi<RoleModules>('/api/auth/roles').then((r) => { setData({ roleModules: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
    if (state.configTab === 'integraciones') adminApi<Integration[]>('/api/admin/integrations').then((r) => { setData({ integrations: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
    if (state.configTab === 'newsletter') {
      adminApi<NewsletterSettings>('/api/newsletter/settings').then((r) => { setData({ newsletterSettings: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
      adminApi<NewsletterEvent[]>('/api/newsletter/events').then((r) => { setData({ newsletterEvents: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
    }
    if (state.configTab === 'servicios') adminApi<Service[]>('/api/commercial/services').then((r) => { setData({ services: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
    if (state.configTab === 'cuentas-fb') adminApi<FbAccount[]>('/api/listening/competitors/accounts').then((r) => { setData({ fbAccounts: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
    if (state.configTab === 'metricas-sitio') adminApi<SiteMetrics>('/api/admin/site-metrics').then((r) => { setData({ siteMetrics: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
  } else if (screen === 'hermes') {
    adminApi<ActivityEntry[]>('/api/admin/activity?limit=20').then((r) => { setData({ activity: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
  } else if (screen === 'pipeline') {
    adminApi<PipelineStep[]>('/api/editorial/pipeline').then((r) => { setData({ pipeline: r }); }).catch((err: ApiError) => { setState({ errorMsg: err.message, dataError: err.message }); });
    adminApi<{ count: number }>('/api/newsletter/subscribers/count').then((r) => { setState({ newsletterSubscriberCount: r.count }); }).catch(() => { /* best-effort */ });
    if (!state.newsletterContent) {
      adminApi<NewsletterContent | null>('/api/newsletter/pending').then((r) => { if (r) setState({ newsletterContent: r }); }).catch(() => { /* best-effort */ });
    }
  }
}

// ---------- helpers de estado compartidos por acciones ----------

export function mergeKey<T extends Record<string, unknown>>(obj: T, key: string, value: unknown): T {
  return { ...obj, [key]: value };
}

export function setProposalsKey(key: string, list: Proposal[]) {
  const byKey = Object.assign({}, state.data.proposalsByKey);
  byKey[key] = list;
  setData({ proposalsByKey: byKey });
}
